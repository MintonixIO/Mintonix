"""Headless court/score detector ported from RESEARCH/preprocess.py.

No GUI, working-directory state, calibration, 3D models, or output side effects.
Frame intervals in this module are inclusive, as in the research scripts.
"""
import re
import logging
import subprocess
import tempfile
from collections import Counter
from fractions import Fraction

import cv2
import numpy as np
from tqdm import tqdm

logger = logging.getLogger(__name__)

COURT_W = 6.10
COURT_L = 13.40
NET_Y = 6.70
ALLEY = 0.46
SHORT_SERVICE = 1.98
LONG_SERVICE = 0.76


def court_intersections_world():
    """Painted-line crossings other than the 6 calibration clicks."""
    sx0, sx1 = ALLEY, COURT_W - ALLEY
    cx = COURT_W / 2.0
    ssl_far = NET_Y - SHORT_SERVICE
    ssl_near = NET_Y + SHORT_SERVICE
    lsl_far = LONG_SERVICE
    lsl_near = COURT_L - LONG_SERVICE
    ys_all = (0.0, lsl_far, ssl_far, NET_Y, ssl_near, lsl_near, COURT_L)
    ys_interior = (lsl_far, ssl_far, NET_Y, ssl_near, lsl_near)
    ys_centre = (0.0, lsl_far, ssl_far, ssl_near, lsl_near, COURT_L)
    pts = []
    for x in (sx0, sx1):
        for y in ys_all:
            pts.append((x, y, 0.0))
    for x in (0.0, COURT_W):
        for y in ys_interior:
            pts.append((x, y, 0.0))
    for y in ys_centre:
        pts.append((cx, y, 0.0))
    pts.append((cx, NET_Y, 0.0))
    arr = np.asarray(pts, dtype=np.float32)
    key = np.round(arr, 3)
    _, idx = np.unique(key, axis=0, return_index=True)
    return arr[np.sort(idx)]


def court_probe_points(points, image_size, margin=8.0):
    """Annotated clicks plus reprojected painted-line crossings, in pixels."""
    points = np.asarray(points, dtype=np.float32).reshape(-1, 2)
    if len(points) < 4:
        raise ValueError(f"Need at least 4 court corner points, got {len(points)}")
    width, height = int(image_size[0]), int(image_size[1])
    src = np.float32(
        [[0.0, 0.0], [COURT_W, 0.0], [COURT_W, COURT_L], [0.0, COURT_L]]
    )
    dst = np.ascontiguousarray(points[:4], dtype=np.float32)
    homography = cv2.getPerspectiveTransform(src, dst)
    extra = cv2.perspectiveTransform(
        court_intersections_world()[:, :2].reshape(-1, 1, 2), homography
    ).reshape(-1, 2)
    n_ann = min(6, len(points))
    probes = np.vstack([points[:n_ann], extra])
    key = np.round(probes, 1)
    _, idx = np.unique(key, axis=0, return_index=True)
    probes = probes[np.sort(idx)]
    m = float(margin)
    inside = (
        (probes[:, 0] >= m)
        & (probes[:, 0] < width - m)
        & (probes[:, 1] >= m)
        & (probes[:, 1] < height - m)
        & np.isfinite(probes).all(axis=1)
    )
    return probes[inside].astype(np.float32)


def court_color(frame, points):
    """Median Lab colour of the court surface inside the four corners.

    Bright line pixels are left out, so the result is the paint between the
    lines: green, blue, red, or anything else a venue uses.
    """
    h, w = frame.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    cv2.fillConvexPoly(mask, np.rint(np.asarray(points, np.float32)[:4]).astype(np.int32), 255)
    mask = cv2.erode(mask, np.ones((5, 5), np.uint8))
    mask[cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) >= 180] = 0
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)[mask > 0]
    if len(lab) < 100:
        raise ValueError("Too little court surface inside the fitted corners")
    return np.median(lab, axis=0).astype(np.float32)


def court_surface_mask(frame, court_lab, chroma_tol=22.0, light_tol=70.0):
    """Pixels whose colour is close to the fitted court surface."""
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB).astype(np.float32)
    ref = np.asarray(court_lab, np.float32)
    chroma = np.hypot(lab[..., 1] - ref[1], lab[..., 2] - ref[2])
    return (chroma <= chroma_tol) & (np.abs(lab[..., 0] - ref[0]) <= light_tol)


def court_frame_score(frame, probes, court_lab, half=None):
    """Fraction of probe patches that look like a white court line on the court colour.

    A main-camera frame has painted-line crossings at the corners and at the
    reprojected service/alley/centre intersections. Alternate cameras,
    intros, and plain fills do not.
    """
    if frame is None:
        return 0.0
    probes = np.asarray(probes, dtype=np.float32).reshape(-1, 2)
    if probes.size == 0:
        return 0.0
    height, width = frame.shape[:2]
    if half is None:
        half = max(2, int(round(height * 8.0 / 1080.0)))
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    surface = court_surface_mask(frame, court_lab)
    std_min = max(8.0, 3.0 * half)
    votes = 0
    n = 0
    for x, y in probes:
        xi, yi = int(round(float(x))), int(round(float(y)))
        if not (half <= xi < width - half and half <= yi < height - half):
            continue
        patch = gray[yi - half : yi + half + 1, xi - half : xi + half + 1]
        smask = surface[yi - half : yi + half + 1, xi - half : xi + half + 1]
        if patch.size == 0:
            continue
        n += 1
        surface_f = float(smask.mean())
        white_f = float((patch >= 180).mean())
        if surface_f >= 0.15 and white_f >= 0.08 and float(patch.std()) >= std_min:
            votes += 1
    if n == 0:
        return 0.0
    return float(votes) / float(n)


def frame_index_from_timestamp(timestamp, ticks_per_frame):
    """Nearest slot on the nominal frame grid for one decoded picture.

    ``timestamp`` is in stream time-base ticks; ``ticks_per_frame`` is
    ``(1 / fps) / time_base`` and may be fractional for variable-rate or
    off-grid uploads. A clip whose first picture is not at time 0 (dl2c62
    starts at 0.08 s) keeps that hole instead of shifting later frames.
    """
    step = Fraction(ticks_per_frame)
    if step <= 0:
        raise ValueError(f"bad ticks_per_frame {ticks_per_frame}")
    return int(Fraction(int(timestamp)) / step + Fraction(1, 2))


def _rate(text):
    num, den = (text or "0/1").split("/")
    return Fraction(int(num), int(den)) if int(den) > 0 else Fraction(0)


def timeline_fps(r_frame_rate, avg_frame_rate):
    """Frame grid used for every frame index and for manifest seconds.

    Frames are placed by their own timestamps, so the grid only sets the
    resolution and cannot drift. Dropped frames lower the average rate, so
    r_frame_rate is kept unless it is a container tick rate (e.g. 90000/1)
    far above the average, as some variable-rate uploads report.
    """
    r, avg = _rate(r_frame_rate), _rate(avg_frame_rate)
    if r <= 0 and avg <= 0:
        raise RuntimeError(f"Bad frame rate {r_frame_rate} / {avg_frame_rate}")
    if r > 0 and (avg <= 0 or r <= 2 * avg):
        return r
    return avg


def _video_timing(video_path):
    """Return the timeline fps, frame count, and time-base ticks per frame."""
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=r_frame_rate,avg_frame_rate,time_base,nb_frames",
        "-of",
        "default=nw=1",
        video_path,
    ]
    proc = subprocess.run(cmd, check=False, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            "ffprobe failed:\n" + (proc.stderr or "")[-2000:]
        )
    info = {}
    for line in proc.stdout.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        info[key] = value
    fps = timeline_fps(info.get("r_frame_rate"), info.get("avg_frame_rate"))
    time_base = _rate(info.get("time_base", "0/1"))
    if time_base <= 0:
        raise RuntimeError(f"Bad time base for {video_path}")
    n_frames = int(info["nb_frames"]) if info.get("nb_frames", "N/A").isdigit() else 0
    return float(fps), n_frames, 1 / (fps * time_base)


def _frame_timeline_indexes(video_path, ticks_per_frame):
    """Timeline slot of each decoded picture, in decode order, or None.

    None marks a picture that rounds onto an already used slot (a variable
    rate burst); callers skip it so every slot keeps its first picture.
    """
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "frame=best_effort_timestamp",
        "-of",
        "csv=p=0",
        video_path,
    ]
    proc = subprocess.run(cmd, check=False, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            "ffprobe timestamps failed:\n" + (proc.stderr or "")[-2000:]
        )
    indexes = []
    last = -1
    for line in proc.stdout.splitlines():
        field = line.strip().split(",", 1)[0].strip()
        if not field:
            continue
        if field == "N/A" or int(field) < 0:
            raise ValueError("Video frames need nonnegative presentation timestamps")
        index = frame_index_from_timestamp(field, ticks_per_frame)
        if index <= last:
            indexes.append(None)
            continue
        indexes.append(index)
        last = index
    if last < 0:
        raise RuntimeError(f"No video frames in {video_path}")
    return indexes


def _ffmpeg_bgr_frames(video_path, sw, sh, ticks=None):
    """Yield ``(timeline_index, bgr)`` for each decoded picture.

    The index is the container frame number, not the dense decode count.
    Pictures that the file does not contain leave holes for the caller.
    Pass ``ticks`` (time-base ticks per frame) when already probed.
    """
    if ticks is None:
        _fps, _n, ticks = _video_timing(video_path)
    indexes = _frame_timeline_indexes(video_path, ticks)
    frame_size = sw * sh * 3
    cmd = [
        "ffmpeg",
        "-nostdin",
        "-v",
        "error",
        "-i",
        video_path,
        "-map",
        "0:v:0",
        "-an",
        # ffmpeg 8 removed -vsync. passthrough keeps one picture per decoded
        # frame so the count matches the ffprobe timeline.
        "-fps_mode",
        "passthrough",
        "-vf",
        f"scale={sw}:{sh}",
        "-pix_fmt",
        "bgr24",
        "-f",
        "rawvideo",
        "pipe:1",
    ]
    with tempfile.TemporaryFile("w+") as errf:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=errf)
        try:
            produced = 0
            while True:
                buf = proc.stdout.read(frame_size)
                if len(buf) < frame_size:
                    break
                if produced >= len(indexes):
                    raise RuntimeError(
                        f"Decoded more frames than timestamps in {video_path}"
                    )
                index = indexes[produced]
                produced += 1
                if index is None:
                    continue
                yield int(index), np.frombuffer(buf, np.uint8).reshape(sh, sw, 3).copy()
            if proc.wait() != 0:
                errf.seek(0)
                raise RuntimeError(
                    "ffmpeg decode failed:\n" + errf.read()[-2000:]
                )
            if produced != len(indexes):
                raise RuntimeError(
                    f"Decoded {produced} frames but ffprobe listed "
                    f"{len(indexes)} in {video_path}"
                )
        finally:
            proc.stdout.close()
            proc.terminate()
            proc.wait()


def court_frame_scores(video_path, points, court_lab, sw=384, sh=216):
    """Per-frame labeled-court votes at the working scale of find_court_frames."""
    pts = list(points)
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise FileNotFoundError(f"Could not open video: {video_path}")
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    n_src = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    cap.release()
    _fps, n_timed, ticks = _video_timing(video_path)
    n_src = max(n_src, n_timed)
    if width <= 0 or height <= 0 or n_src <= 0:
        raise RuntimeError(f"Could not read video properties: {video_path}")

    probes = court_probe_points(pts, (width, height))
    if len(probes) < 8:
        raise RuntimeError("Too few in-image court probe points")
    scaled = probes.copy()
    scaled[:, 0] *= sw / float(width)
    scaled[:, 1] *= sh / float(height)

    # Missing pictures stay 0 (not the main court). A one- or two-frame hole
    # inside a court run is filled later by find_court_frames' gap cleanup.
    scores = np.zeros(n_src, dtype=np.float32)
    decoded = 0
    for idx, frame in tqdm(
        _ffmpeg_bgr_frames(video_path, sw, sh, ticks=ticks),
        total=n_src,
        desc="Court frames",
        unit="frame",
    ):
        decoded += 1
        if idx >= len(scores):
            scores = np.pad(scores, (0, idx + 1 - len(scores)))
        scores[idx] = court_frame_score(frame, scaled, court_lab)
    if decoded == 0:
        raise RuntimeError("No frames decoded for court visibility")
    return scores


def court_visible_from_scores(scores, vote_on=0.50, vote_off=0.40):
    """Hysteresis: enter court at vote_on, leave only below vote_off.

    Overhead / graphic cameras score ~0.22–0.35 and must drop to off.
    """
    scores = np.asarray(scores, dtype=np.float32).ravel()
    vis = np.zeros(len(scores), dtype=bool)
    on = False
    for i, v in enumerate(scores):
        if on:
            on = float(v) >= vote_off
        else:
            on = float(v) >= vote_on
        vis[i] = on
    return vis


def _runs(mask, value=True):
    """Half-open ``(start, end)`` index runs where ``mask`` equals ``value``."""
    hit = np.asarray(mask, dtype=bool) == value
    edges = np.flatnonzero(np.diff(np.concatenate(([False], hit, [False])).astype(np.int8)))
    return list(zip(edges[::2].tolist(), edges[1::2].tolist()))


def find_court_frames(video_path, points, court_lab, scores=None):
    """Mark frames where the fitted main-camera court is visible."""

    min_run, max_gap = 5, 3

    if scores is None:
        scores = court_frame_scores(video_path, points, court_lab)
    n_src = len(scores)

    court = court_visible_from_scores(scores)
    for i, j in _runs(court, True):
        if j - i < min_run:
            court[i:j] = False
    for i, j in _runs(court, False):
        if i > 0 and j < n_src and j - i <= max_gap:
            court[i:j] = True

    ranges = _runs(court, True)
    if not ranges:
        raise RuntimeError("No valid court-visible frame ranges found")

    court_frames = [{"start": int(start), "end": int(end) - 1} for start, end in ranges]
    kept = int(court.sum())
    logger.info(
        f"court frames: mean_vote={float(scores.mean()):.3f} "
        f"on={kept}/{n_src} clusters={len(ranges)} kept={kept}/{n_src}"
    )
    return court_frames


def camera_switches_in_span(court_on, start, end, fps=30.0):
    """Off-court runs inside [start, end] long enough to be a camera switch.

    Lead and trail close-ups at the span edges are kept even when the rally is
    mostly court-on. Do not drop them just because they touch start or end.
    There is no upper bound: the span is already one rally, and a replay or
    other angle longer than 50s is still not the main camera.
    """
    court_on = np.asarray(court_on, dtype=bool)
    if court_on.size == 0:
        return []
    start = max(0, int(start))
    end = min(int(end), int(court_on.size) - 1)
    if end < start:
        return []
    min_sw = max(8, int(round(float(fps) * 1.0)))
    return [
        {"start_frame": start + i, "end_frame": start + j - 1}
        for i, j in _runs(court_on[start : end + 1], False)
        if j - i >= min_sw
    ]


# Digit centers closer than this are one score column (a two-digit number
# that OCR split, or the same glyph twice). Finished-game columns on these
# broadcasts sit about 45px apart, so 28px does not merge two games.
_COLUMN_X_GAP = 28.0


def _score_rows(hits):
    """Split scoreboard digits into the top row and the bottom row.

    hits are (cy, cx, value) in crop pixels. The top row is p1 and the
    bottom row is p0. Same-row digits sit a few pixels apart in y; the two
    rows do not. Returns (top, bottom) or None.
    """
    pts = [(float(y), float(x), int(n)) for y, x, n in hits if int(n) <= 30]
    if len(pts) < 2:
        return None
    pts.sort(key=lambda h: h[0])
    split = None
    best = -1.0
    for i in range(len(pts) - 1):
        gap = pts[i + 1][0] - pts[i][0]
        if gap > best:
            best = gap
            split = i
    if split is None or best < 8.0:
        return None
    top = pts[: split + 1]
    bot = pts[split + 1 :]
    if not top or not bot:
        return None
    return top, bot


def _x_clusters(pts, gap=_COLUMN_X_GAP):
    """Group one scoreboard row into left-to-right columns."""
    ordered = sorted(pts, key=lambda h: h[1])
    groups = []
    for h in ordered:
        if groups and float(h[1]) - float(groups[-1][-1][1]) <= gap:
            groups[-1].append(h)
        else:
            groups.append([h])
    return groups


def current_game_score(hits):
    """Rightmost digit on each scoreboard row.

    Game 1 has one number per row. Later games add finished-game columns
    on the left; the current game is the right-hand number.
    """
    rows = _score_rows(hits)
    if rows is None:
        return None
    top, bot = rows
    return int(max(top, key=lambda h: h[1])[2]), int(max(bot, key=lambda h: h[1])[2])


def score_column_count(hits):
    """How many score columns are on the board, or None if the rows disagree.

    One column is game 1, two is game 2, three is game 3. Both rows must
    show the same columns, lined up in x. A two-digit score is one column.
    """
    rows = _score_rows(hits)
    if rows is None:
        return None
    top_g = _x_clusters(rows[0])
    bot_g = _x_clusters(rows[1])
    if len(top_g) != len(bot_g) or not (1 <= len(top_g) <= 3):
        return None
    for tg, bg in zip(top_g, bot_g):
        tx = sum(float(h[1]) for h in tg) / len(tg)
        bx = sum(float(h[1]) for h in bg) / len(bg)
        if abs(tx - bx) > _COLUMN_X_GAP:
            return None
    return len(top_g)


def is_win(score):
    """True when a (p1, p0) score has finished a game."""
    p1, p0 = score
    return (p1 >= 21 or p0 >= 21) and abs(p1 - p0) >= 2


def successors(score):
    """The two scores one rally after ``score``."""
    return (score[0] + 1, score[1]), (score[0], score[1] + 1)


def step_ok(a, b):
    """True when ``b`` is one point after ``a``."""
    return tuple(b) in successors(a)


def is_new_game_score(prev, cur, gap=None, fps=30.0):
    """True when cur is the first detected score of the next game.

    A changeover is usually off-court, so the first court segment of the new
    game is often already 0-1 or 1-0 rather than 0-0. A finished game is not
    continued by those scores, and it is not continued by a later score from
    the new game either.
    """
    if prev is None or cur is None:
        return False
    p1, p0 = int(prev[0]), int(prev[1])
    c1, c0 = int(cur[0]), int(cur[1])
    if (c1, c0) == (p1, p0) or step_ok((p1, p0), (c1, c0)):
        return False
    won = is_win((p1, p0))
    long_gap = gap is not None and gap > float(fps) * 60.0
    if (c1, c0) == (0, 0) and (won or p1 + p0 >= 15 or long_gap):
        return True
    # The winning point is often off-court, so the last court score can be
    # 22-21 or 21-20. The next court score is then the new game.
    fresh = max(c1, c0) <= 21 and (c1 + c0) + 4 < (p1 + p0)
    late = max(p1, p0) >= 20
    if fresh and (won or (late and long_gap)):
        return True
    return False


def ends_swapped_for(game, p1, p0):
    """True when the players are on the opposite ends from game 1.

    Ends change after game 1, after game 2, and in game 3 once either side
    has reached 11. The rally score is the score at the start of the point,
    so a game-3 rally that already shows 11 is after that interval.
    """
    game = int(game)
    if game <= 1:
        return False
    if game == 2:
        return True
    return int(p1) >= 11 or int(p0) >= 11


def _le(a, b):
    return a[0] <= b[0] and a[1] <= b[1]


def drop_misreads(pieces):
    """Remove score pieces that disagree with both neighbours.

    Within a game both scores only rise. If the pieces either side of one
    agree with each other (the later is at most three points on) and the
    middle score does not lie between them, the middle one was misread.
    Without this, one forward misread (13 read as 18) makes every real
    score up to 18 look like a step backwards, and those rallies are lost.
    """
    kept = []
    for i, piece in enumerate(pieces):
        prev = kept[-1]["score"] if kept else None
        nxt = pieces[i + 1]["score"] if i + 1 < len(pieces) else None
        cur = piece["score"]
        if (prev is not None and nxt is not None and _le(prev, nxt)
                and sum(nxt) - sum(prev) <= 3 and not (_le(prev, cur) and _le(cur, nxt))):
            logger.info("dropping misread score %s between %s and %s", cur, prev, nxt)
            continue
        kept.append(piece)
    return kept


def opening_piece_index(pieces):
    """First score span to keep.

    Full matches start at 0-0 / 0-1 / 1-0. Single-rally clips can start at
    any score (e.g. dl1c2 is 2-0); fall back to the first OCR'd piece.
    """
    if not pieces:
        return None
    first_play = None
    for i, p in enumerate(pieces):
        if p["score"] in ((1, 0), (0, 1)):
            first_play = i
            break
    if first_play is None:
        for i, p in enumerate(pieces):
            if p["score"] == (0, 0):
                first_play = i
                break
    if first_play is None:
        return 0
    start_i = first_play
    for i in range(first_play, -1, -1):
        if pieces[i]["score"] == (0, 0):
            start_i = i
            break
    return start_i


def refine_court_frames(video_path, court_frames, ocr, fps=None, n_frames=0):
    """Score-sequenced rallies on the timeline grid of find_court_frames.

    ``fps`` must be the same timeline rate used for court frames and the
    manifest; it is probed when omitted.
    """
    if fps is None:
        fps, n_frames, _ticks = _video_timing(video_path)
    fps = float(fps)
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise FileNotFoundError(f"Could not open video: {video_path}")
    n_src = max(int(n_frames or 0), max((s["end"] + 1 for s in court_frames), default=0))

    try:
        def grab_frame(idx):
            idx = int(idx)
            if idx < 0 or (n_src and idx >= n_src):
                return None
            # Seek by time: decode order differs from the timeline when the
            # file has holes or a variable frame rate.
            cap.set(cv2.CAP_PROP_POS_MSEC, idx * 1000.0 / fps)
            ret, frame = cap.read()
            return frame if ret else None

        def ocr_score(frame):
            if frame is None:
                return None
            h, w = frame.shape[:2]
            crop = frame[int(h * 0.02) : int(h * 0.15), int(w * 0.01) : int(w * 0.38)]
            if crop.size == 0:
                return None
            rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
            result = list(ocr.predict(rgb))
            if not result:
                return None
            res = result[0]
            try:
                texts = list(res["rec_texts"])
                polys = list(res["rec_polys"])
            except Exception:
                return None
            hits = []
            for text, poly in zip(texts, polys):
                pts = np.asarray(poly, dtype=np.float32)
                if pts.size < 2:
                    continue
                xs = pts[:, 0]
                ys = pts[:, 1]
                x0, x1 = float(xs.min()), float(xs.max())
                cy = float(ys.mean())
                nums = []
                for tok in re.findall(r"\d{1,2}", str(text)):
                    n = int(tok)
                    if n <= 30:
                        nums.append(n)
                if not nums:
                    continue
                for i, n in enumerate(nums):
                    if len(nums) == 1:
                        cx = (x0 + x1) / 2.0
                    else:
                        cx = x0 + (x1 - x0) * (i + 0.5) / len(nums)
                    hits.append((cy, cx, n))
            if len(hits) < 2:
                return None, None
            return current_game_score(hits), score_column_count(hits)

        score_cache = {}
        game_cache = {}

        def score_at(idx):
            idx = int(idx)
            if idx not in score_cache:
                reading = ocr_score(grab_frame(idx))
                if reading is None:
                    score_cache[idx] = None
                    game_cache[idx] = None
                else:
                    score_cache[idx], game_cache[idx] = reading
            return score_cache[idx]

        def ocr_many(indices, desc):
            todo = []
            seen = set()
            for i in indices:
                i = int(i)
                if n_src:
                    i = max(0, min(i, n_src - 1))
                if i in seen or i in score_cache:
                    continue
                seen.add(i)
                todo.append(i)
            for i in tqdm(todo, desc=desc, unit="frame"):
                score_at(i)

        def missing_between(a, b):
            cands = [s1 for s1 in successors(a) if max(s1) <= 30 and step_ok(s1, b)]
            if len(cands) == 1:
                return cands[0]
            if b == (0, 0):
                w = [s for s in successors(a) if is_win(s)]
                if len(w) == 1:
                    return w[0]
            return None

        def gap_idxs(gs, ge, head_only=False):
            gs, ge = int(gs), int(ge)
            if ge < gs:
                return []
            span = ge - gs + 1
            if span <= int(fps * 3):
                return [gs, ge]
            if head_only:
                window_e = min(ge, gs + int(fps * 15))
                return [gs + int((window_e - gs) * k / 7.0) for k in range(8)]
            window_e = min(ge, gs + int(fps * 90))
            n = 12
            return [gs + int((window_e - gs) * k / float(n - 1)) for k in range(n)]

        def locate_score(gs, ge, target, head_only=False):
            gs, ge = int(gs), int(ge)
            if ge < gs:
                return None
            idxs = gap_idxs(gs, ge, head_only=head_only)
            ocr_many(idxs, "OCR gaps")
            hits = [i for i in idxs if score_cache.get(i) == target]
            if not hits:
                return None
            return hits[0], min(ge, hits[-1] + int(round(fps)))

        def pick_missing(gs, ge, cands):
            idxs = gap_idxs(gs, ge, head_only=False)
            ocr_many(idxs, "OCR gaps")
            counts = Counter()
            first = {}
            last = {}

            def tally(frames):
                for i in frames:
                    sc = score_cache.get(i)
                    if sc in cands:
                        counts[sc] += 1
                        first.setdefault(sc, i)
                        last[sc] = i

            tally(idxs)
            if not counts:
                step = max(15, int(round(fps * 2)))
                extra = list(range(int(gs), min(int(ge), int(gs) + int(fps * 50)) + 1, step))
                ocr_many(extra, "OCR gaps")
                tally(extra)
            if not counts:
                return None
            best = counts.most_common(1)[0][0]
            return best, first[best], min(ge, last[best] + int(round(fps)))

        islands = [{"start": int(s["start"]), "end": int(s["end"])} for s in court_frames]
        if not islands:
            raise RuntimeError("No court frames to refine")

        probes = []
        for isl in islands:
            s, e = isl["start"], isl["end"]
            probes.extend([s, s + (e - s) // 2, e])
        ocr_many(probes, "OCR scores")

        def split_change(lo, hi, old, new):
            lo, hi = int(lo), int(hi)
            if hi - lo <= 8 or old is None or new is None or old == new:
                return hi
            for _ in range(12):
                if hi - lo <= 8:
                    break
                mid = (lo + hi) // 2
                sc = score_at(mid)
                if sc == new:
                    hi = mid
                else:
                    lo = mid
            return hi

        pieces = []
        long_isl = int(round(fps * 5))
        for isl in islands:
            s, e = isl["start"], isl["end"]
            sm = s + (e - s) // 2
            scs = [score_at(s), score_at(sm), score_at(e)]
            votes = [x for x in scs if x is not None]
            if not votes:
                continue
            ranked = Counter(votes).most_common()
            if (e - s) >= long_isl and scs[1] is not None:
                maj = scs[1]
            elif ranked[0][1] == 1 and scs[1] is not None:
                maj = scs[1]
            else:
                maj = ranked[0][0]
            q3 = None
            if (e - s) >= long_isl and scs[1] is not None:
                need_q3 = (scs[0] is not None and scs[0] != scs[1]) or (
                    scs[2] is not None and scs[2] != scs[1]
                )
                if need_q3:
                    q3 = score_at(s + 3 * (e - s) // 4)
            cur_s = s
            did_split = False
            if (
                (e - s) >= long_isl
                and scs[0] is not None
                and scs[1] is not None
                and scs[0] != scs[1]
                and step_ok(scs[0], scs[1])
                and (scs[1] == scs[2] or scs[1] == q3)
            ):
                cut = split_change(s, sm, scs[0], scs[1])
                if cut > cur_s:
                    pieces.append(
                        {"start": cur_s, "end": max(cur_s, cut - 1), "score": scs[0]}
                    )
                    cur_s = cut
                    did_split = True
            if (
                (e - s) >= long_isl
                and scs[1] is not None
                and scs[2] is not None
                and scs[1] != scs[2]
                and step_ok(scs[1], scs[2])
                and q3 == scs[2]
                and cur_s < e
            ):
                cut = split_change(sm, e, scs[1], scs[2])
                if cut > cur_s:
                    pieces.append(
                        {"start": cur_s, "end": max(cur_s, cut - 1), "score": scs[1]}
                    )
                    pieces.append({"start": cut, "end": e, "score": scs[2]})
                    continue
            if did_split:
                pieces.append({"start": cur_s, "end": e, "score": scs[1]})
                continue
            pieces.append({"start": s, "end": e, "score": maj})

        pieces = [p for p in pieces if p["score"] is not None and p["end"] >= p["start"]]
        pieces.sort(key=lambda p: p["start"])
        pieces = drop_misreads(pieces)
        logger.info("score pieces: %s", len(pieces))

        start_i = opening_piece_index(pieces)
        if start_i is None:
            raise RuntimeError("Could not find opening rally scores")
        pieces = pieces[start_i:]

        def board_game_for(piece):
            """Stable scoreboard column count on frames that show this score."""
            frames = (
                int(piece["start"]),
                int(piece["start"] + piece["end"]) // 2,
                int(piece["end"]),
            )
            votes = []
            for i in frames:
                if score_at(i) != piece["score"]:
                    continue
                g = game_cache.get(int(i))
                if g in (1, 2, 3):
                    votes.append(int(g))
            if not votes:
                return None
            top, n = Counter(votes).most_common(1)[0]
            if sum(1 for v in votes if v != top) >= n:
                return None
            return int(top)

        for p in pieces:
            p["board_game"] = board_game_for(p)

        raw = []

        def add_off_only(score, span):
            raw.append({"game": game, "score": score, "spans": [span], "off_only": True})

        game = 1
        prev = None
        max_merge = int(fps * 90)
        for p in pieces:
            sc = p["score"]
            span = (p["start"], p["end"])
            if prev is None:
                # A clip can open mid-match, so there is no earlier rally to
                # count. Finished columns on the left of the scoreboard are
                # the game number (one column is game 1, two is game 2).
                board = p.get("board_game")
                if board in (1, 2, 3):
                    game = int(board)
                raw.append({"game": game, "score": sc, "spans": [span]})
                prev = sc
                continue
            gap = span[0] - raw[-1]["spans"][-1][1]
            if sc == prev and gap <= max_merge:
                raw[-1]["spans"].append(span)
                continue
            if step_ok(prev, sc):
                raw.append({"game": game, "score": sc, "spans": [span]})
                prev = sc
                continue
            if is_new_game_score(prev, sc, gap=gap, fps=fps):
                if game >= 3:
                    continue
                gs = raw[-1]["spans"][-1][1] + 1
                ge = span[0] - 1
                if sc == (0, 0) or not is_win(prev):
                    cands = []
                    if sc == (0, 0):
                        miss = missing_between(prev, sc)
                        if miss is not None:
                            cands = [miss]
                    else:
                        cands = [s for s in successors(prev) if is_win(s)]
                    for miss in cands:
                        loc = locate_score(gs, ge, miss, head_only=True)
                        if loc is not None:
                            add_off_only(miss, loc)
                            break
                game += 1
                if sc in ((1, 0), (0, 1)):
                    tail = max(gs, ge - int(round(fps * 30)))
                    loc = locate_score(tail, ge, (0, 0), head_only=False)
                    if loc is not None:
                        add_off_only((0, 0), loc)
                raw.append({"game": game, "score": sc, "spans": [span]})
                prev = sc
                continue
            dp1 = sc[0] - prev[0]
            dp0 = sc[1] - prev[1]
            forward = dp1 >= 0 and dp0 >= 0 and dp1 + dp0 >= 1
            if forward and dp1 + dp0 == 2 and gap <= int(fps * 120):
                gs = raw[-1]["spans"][-1][1] + 1
                ge = span[0] - 1
                miss = missing_between(prev, sc)
                if miss is None:
                    picked = pick_missing(gs, ge, successors(prev))
                    if picked is not None:
                        miss, a, b = picked
                        add_off_only(miss, (a, b))
                else:
                    loc = locate_score(gs, ge, miss, head_only=False)
                    if loc is not None:
                        add_off_only(miss, loc)
                raw.append({"game": game, "score": sc, "spans": [span]})
                prev = sc
                continue
            # A missed rally must not throw away the rest of the game.
            if forward and gap <= int(fps * 300):
                raw.append({"game": game, "score": sc, "spans": [span]})
                prev = sc
                continue

        if raw and not is_win(raw[-1]["score"]):
            last = raw[-1]["score"]
            gs = raw[-1]["spans"][-1][1] + 1
            ge = min(n_src - 1 if n_src else gs + int(fps * 8), gs + int(fps * 8))
            for cand in successors(last):
                if not is_win(cand):
                    continue
                loc = locate_score(gs, ge, cand, head_only=True)
                if loc is not None:
                    add_off_only(cand, loc)
                    break

        court_on = np.zeros(max(n_src, 1), dtype=bool)
        for s in court_frames:
            a, b = int(s["start"]), int(s["end"])
            b = min(b, court_on.size - 1)
            if a < court_on.size:
                court_on[max(0, a) : b + 1] = True

        trail_fallback = max(1, int(round(fps * 1.0)))

        starts = []
        ends = []
        # A file that is one rally (the dl1c/dl2c chops, and a match that really
        # is a single point) includes the leading and trailing cuts. Those runs
        # are camera switches. Stopping one second after the court leaves drops
        # the rest of the cut, and starting at the first court frame drops the
        # opening cut.
        solo = len(raw) == 1 and not raw[0].get("off_only") and n_src > 0
        if solo:
            starts = [0]
            ends = [int(n_src) - 1]
        for i, r in enumerate(raw):
            if solo:
                break
            play0 = min(s for s, e in r["spans"])
            play1 = max(e for s, e in r["spans"])
            prev_r = raw[i - 1] if i else None
            if r.get("off_only"):
                start, end = play0, play1
            else:
                end = play1 + trail_fallback
                if (
                    prev_r is not None
                    and prev_r["game"] == r["game"]
                    and not prev_r.get("off_only")
                ):
                    prev_play1 = max(e for s, e in prev_r["spans"])
                    start = prev_play1 + trail_fallback + 1
                else:
                    start = play0
                if end < start:
                    end = start
            starts.append(int(start))
            ends.append(int(end))

        for i in range(len(starts) - 1):
            if raw[i]["game"] != raw[i + 1]["game"]:
                continue
            if raw[i].get("off_only") or raw[i + 1].get("off_only"):
                continue
            ends[i] = starts[i + 1] - 1
            if ends[i] < starts[i]:
                ends[i] = starts[i]

        out = []
        for i, r in enumerate(raw):
            start, end = starts[i], ends[i]
            if r.get("off_only"):
                # Known only from the scoreboard: the main camera never showed
                # this rally, so it is not a playable rally. It stays in the
                # list to keep the score sequence intact.
                switches = [{"start_frame": int(start), "end_frame": int(end)}]
            else:
                switches = camera_switches_in_span(court_on, start, end, fps=fps)
            p1, p0 = r["score"]
            out.append(
                {
                    "game": int(r["game"]),
                    "score": f"{p1}-{p0}",
                    "p1": int(p1),
                    "p0": int(p0),
                    "ends_swapped": ends_swapped_for(r["game"], p1, p0),
                    "start_frame": int(start),
                    "end_frame": int(end),
                    "camera_switches": switches,
                }
            )

        return out
    finally:
        cap.release()
