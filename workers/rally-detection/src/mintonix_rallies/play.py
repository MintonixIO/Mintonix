"""Drop main-camera intervals with no shuttle in flight (mopping, waiting to serve).

Court visibility and the scoreboard cannot tell live play from dead time on
the main camera. TrackNetV5 finds the shuttle; an interval is live once the
shuttle has moved continuously for MIN_FLIGHT_S. On dl1 the 110 reviewed
rallies all reached at least 0.80 s and 8 of 10 dead intervals stayed below
0.30 s, so 0.5 s keeps every rally with margin.
"""
import logging
import os
from pathlib import Path

import cv2
import numpy as np

from .manifest import playable_frames

logger = logging.getLogger(__name__)

MIN_FLIGHT_S = 0.5
CONFIDENCE = 0.5
# Per-frame shuttle movement, in 1080p pixels, that counts as flight. Held or
# resting shuttles move less; jumps between unrelated detections move more.
MIN_STEP_PX, MAX_STEP_PX = 4.0, 150.0
MAX_GAP = 3
INPUT_W, INPUT_H = 512, 288


def longest_flight(points, height):
    """Longest run of frames (gaps up to MAX_GAP) with a moving shuttle.

    ``points`` holds one ``(x, y, confidence)`` per consecutive frame, in
    source pixels; ``height`` scales the pixel thresholds from 1080p.
    """
    scale = float(height) / 1080.0
    lo, hi = MIN_STEP_PX * scale, MAX_STEP_PX * scale
    best = run = gap = 0
    last = None
    for i, (x, y, conf) in enumerate(points):
        moving = False
        if conf >= CONFIDENCE:
            if last is not None and i - last[0] <= MAX_GAP + 1:
                step = np.hypot(x - last[1], y - last[2]) / (i - last[0])
                moving = lo <= step <= hi
            last = (i, x, y)
        if moving:
            run += 1 + gap
            gap = 0
        elif run:
            gap += 1
            if gap > MAX_GAP:
                run = gap = 0
        best = max(best, run)
    return best


class ShuttleTracker:
    def __init__(self, weights=None, device=None):
        import torch

        from .tracknet import load_tracknet

        weights = weights or os.environ.get("MINTONIX_TRACKNET_WEIGHTS")
        if not weights or not Path(weights).is_file():
            raise RuntimeError("TrackNetV5 weights are missing: set MINTONIX_TRACKNET_WEIGHTS")
        if device is None:
            device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
        self.torch = torch
        self.device = torch.device(device)
        self.model = load_tracknet(weights, self.device)

    def points(self, rgb3, size):
        """Top heatmap point for each of three 512x288 RGB frames, in source pixels."""
        stacked = np.concatenate(rgb3, axis=2).transpose(2, 0, 1)
        x = self.torch.from_numpy(np.ascontiguousarray(stacked)).float().div_(255).unsqueeze(0).to(self.device)
        with self.torch.inference_mode():
            heatmaps = self.model(x).squeeze(0).cpu().numpy()
        sx, sy = size[0] / INPUT_W, size[1] / INPUT_H
        out = []
        for h in heatmaps:
            j = int(h.argmax())
            y, x_ = divmod(j, INPUT_W)
            out.append(((x_ + .5) * sx - .5, (y + .5) * sy - .5, float(h.flat[j])))
        return out


def has_flight(cap, tracker, start, end, fps):
    """True once the shuttle flies for MIN_FLIGHT_S inside frames [start, end)."""
    need = int(round(MIN_FLIGHT_S * fps))
    size = (cap.get(cv2.CAP_PROP_FRAME_WIDTH), cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.set(cv2.CAP_PROP_POS_MSEC, start * 1000.0 / fps)
    points, window = [], []
    for _ in range(end - start):
        ok, frame = cap.read()
        if not ok:
            break
        window.append(cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB), (INPUT_W, INPUT_H),
                                 interpolation=cv2.INTER_AREA))
        if len(window) == 3:
            points += tracker.points(window, size)
            window = []
            if longest_flight(points, size[1]) >= need:
                return True
    if window:
        window += [window[-1]] * (3 - len(window))
        points += tracker.points(window, size)[: len(window)]
    return longest_flight(points, size[1]) >= need


def mark_dead_time(video, rallies, fps, tracker):
    """Add each playable piece without shuttle flight to the rally's ``no_play`` list."""
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise FileNotFoundError(f"Could not open video: {video}")
    try:
        for rally in rallies:
            for start, end in list(playable_frames(rally)):
                if not has_flight(cap, tracker, start, end, fps):
                    logger.info("no shuttle flight in frames %s-%s (%s); dropping", start, end - 1, rally.get("score"))
                    rally.setdefault("no_play", []).append({"start_frame": start, "end_frame": end - 1})
    finally:
        cap.release()
    return rallies
