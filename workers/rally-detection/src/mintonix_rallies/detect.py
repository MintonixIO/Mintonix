"""One headless detection pass: probe, fit the court, then run the research detector."""
import json
import math
import subprocess
from pathlib import Path

from .manifest import build_manifest
from .court import detect_court, validate_corners
from .research import timeline_fps


def probe_video(path):
    result = subprocess.run([
        "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_streams",
        "-show_format", "-of", "json", str(path),
    ], check=True, capture_output=True, text=True)
    data = json.loads(result.stdout)
    if not data.get("streams"):
        raise ValueError("Input has no video stream")
    stream = data["streams"][0]
    fps = float(timeline_fps(stream.get("r_frame_rate"), stream.get("avg_frame_rate")))
    duration = float(data.get("format", {}).get("duration") or stream.get("duration") or 0)
    width, height = stream["width"], stream["height"]
    if not all(math.isfinite(n) and n > 0 for n in (fps, duration, width, height)):
        raise ValueError("Video must have finite positive duration, frame rate, and dimensions")
    return fps, duration, width, height


def detect(*, video, match_id, title, players, youtube_video_id, include_scores=False, ocr=None, tracker=None):
    """Analyse a local copy of the complete YouTube upload; timestamps stay on its timeline."""
    from . import research
    from .play import ShuttleTracker, mark_dead_time

    video = str(Path(video).resolve(strict=True))
    fps, duration, width, height = probe_video(video)
    points, court_lab = detect_court(video)
    points = validate_corners(points, width, height)
    court_frames = research.find_court_frames(video, points, court_lab)
    if ocr is None:
        from paddleocr import PaddleOCR

        ocr = PaddleOCR(
            lang="en", device="cpu", use_doc_orientation_classify=False,
            use_doc_unwarping=False, use_textline_orientation=False,
        )
    tracker = tracker or ShuttleTracker()
    rallies = research.refine_court_frames(video, court_frames, ocr, fps=fps,
                                           n_frames=math.ceil(duration * fps))
    rallies = mark_dead_time(video, rallies, fps, tracker)
    return build_manifest(
        match_id=match_id, title=title, players=players, duration=duration, fps=fps,
        youtube_video_id=youtube_video_id, rallies=rallies, include_scores=include_scores,
    )
