#!/usr/bin/env python3
"""Render one PNG sheet per playback interval for visual (agent or human) review.

Accepts a v2 manifest (startSeconds/endSeconds) or a research rallies.json
(inclusive frames + camera_switches). Each sheet shows frames just before,
at, and after both boundaries plus the middle, framed green inside the
interval and red outside, and an enlarged scoreboard crop. Interval sheets
are a filmstrip every 0.5 s (at most 42 frames) with three frames on either
side. Gaps longer than --gap seconds get their own sheet so missed play is visible.

    python scripts/review_sheets.py --video match.mp4 --rallies manifest.json --out sheets/
"""
import argparse
import json
from pathlib import Path
import sys

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from mintonix_rallies.manifest import playable_frames  # noqa: E402

TW, TH = 320, 180
COLS = 6


def load_intervals(path, fps):
    data = json.loads(Path(path).read_text())
    rallies = data["rallies"] if isinstance(data, dict) else data
    out = []
    for r in rallies:
        if "startSeconds" in r:
            out.append({"label": f"g{r['game']} {r.get('scoreBefore', '')}",
                        "start": r["startSeconds"], "end": r["endSeconds"]})
            continue
        for a, b in playable_frames(r):
            out.append({"label": f"g{r['game']} {r.get('score', '')}", "start": a / fps, "end": b / fps})
    return sorted(out, key=lambda x: x["start"])


def grab(cap, t):
    cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, t) * 1000.0)
    ok, frame = cap.read()
    return frame if ok else None


def tile(frame, text, inside):
    img = np.zeros((TH, TW, 3), np.uint8) if frame is None else cv2.resize(frame, (TW, TH))
    cv2.rectangle(img, (0, 0), (TW - 1, TH - 1), (0, 200, 0) if inside else (0, 0, 230), 5)
    cv2.rectangle(img, (0, TH - 24), (TW, TH), (0, 0, 0), -1)
    cv2.putText(img, text, (6, TH - 7), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    return img


def score_tile(frame):
    if frame is None:
        return np.zeros((TH, TW, 3), np.uint8)
    h, w = frame.shape[:2]
    crop = frame[int(h * 0.02): int(h * 0.15), int(w * 0.01): int(w * 0.38)]
    return cv2.resize(crop, (TW, TH))


def fmt(t):
    return f"{int(t // 60)}:{t % 60:05.2f}"


def sheet(cap, times, start, end, header, score_at=None):
    tiles = []
    for t in times:
        inside = start <= t < end
        tiles.append(tile(grab(cap, t), f"{fmt(t)}  {'IN' if inside else 'OUT'}", inside))
    if score_at is not None:
        tiles.append(score_tile(grab(cap, score_at)))
    while len(tiles) % COLS:
        tiles.append(np.zeros((TH, TW, 3), np.uint8))
    body = np.vstack([np.hstack(tiles[i:i + COLS]) for i in range(0, len(tiles), COLS)])
    head = np.zeros((36, body.shape[1], 3), np.uint8)
    cv2.putText(head, header, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
    return np.vstack([head, body])


def strip(a, b, step, cap_n):
    n = min(cap_n, max(2, int((b - a) / step) + 1))
    return list(np.linspace(a, b, n))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--rallies", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--gap", type=float, default=4.0, help="Render gaps longer than this many seconds")
    args = ap.parse_args()
    cap = cv2.VideoCapture(args.video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    intervals = load_intervals(args.rallies, fps)
    index = []
    prev_end = 0.0
    for i, iv in enumerate(intervals):
        s, e = iv["start"], iv["end"]
        if s - prev_end > args.gap:
            name = f"{i:03d}_gap.png"
            cv2.imwrite(str(out / name), sheet(cap, strip(prev_end, s - 0.05, 1.0, 36), -1, -1,
                        f"GAP before #{i}: {fmt(prev_end)} - {fmt(s)} (all frames OUT, not played)"))
            index.append({"sheet": name, "kind": "gap", "start": prev_end, "end": s})
        d = e - s
        times = [s - 1.5, s - 1.0, s - 0.5] + strip(s, e - 1 / fps, 0.5, 42) + [e + 0.5, e + 1.0, e + 2.0]
        name = f"{i:03d}_rally.png"
        cv2.imwrite(str(out / name), sheet(cap, times, s, e,
                    f"#{i} {iv['label']}  IN {fmt(s)} - {fmt(e)} ({d:.1f}s); last tile = scoreboard mid-interval",
                    score_at=(s + e) / 2))
        index.append({"sheet": name, "kind": "rally", "label": iv["label"], "start": s, "end": e})
        prev_end = e
    (out / "index.json").write_text(json.dumps(index, indent=1))
    cap.release()
    print(f"{len(index)} sheets in {out}")


if __name__ == "__main__":
    main()
