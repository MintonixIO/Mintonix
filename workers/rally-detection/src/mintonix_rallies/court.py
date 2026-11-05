"""Automatic corner discovery through the archived C++ court-line fitter."""
import csv
import logging
import math
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

import cv2
import numpy as np

logger = logging.getLogger(__name__)


def validate_corners(points, width=None, height=None):
    if len(points) != 4 or any(len(p) != 2 for p in points):
        raise ValueError("Expected four x y court corners")
    if any(not math.isfinite(n) or n < 0 for p in points for n in p):
        raise ValueError("Court coordinates must be finite and nonnegative")
    turns = []
    for i in range(4):
        a, b, c = (points[(i + j) % 4] for j in range(3))
        turns.append((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]))
    if not all(turn > 0 for turn in turns):
        raise ValueError("Court corners must be convex and ordered top-left clockwise")
    if width is not None and height is not None:
        if any(x >= width or y >= height for x, y in points):
            raise ValueError("Court coordinates lie outside the source video")
    return points


def read_detected_corners(path):
    with Path(path).open(newline="") as source:
        records = {row["Point"]: [float(row["X"]), float(row["Y"])] for row in csv.DictReader(source)}
    if not all(f"P{i}" in records for i in range(1, 23)):
        raise ValueError("Native detector must return all 22 court intersections")
    corners = [records[f"P{i}"] for i in range(1, 5)]
    # Court-model axes can be reversed. Normalize to image TL, TR, BR, BL.
    by_y = sorted(corners, key=lambda p: p[1])
    top_left, top_right = sorted(by_y[:2])
    bottom_left, bottom_right = sorted(by_y[2:])
    return validate_corners([top_left, top_right, bottom_right, bottom_left])


# Where to try the native fit, as fractions of the video. Earlier entries are
# the archived wrapper's positions; later ones only run if those all fail.
FIT_POSITIONS = (0.40, 0.25, 0.60, 0.33, 0.75, 0.50, 0.15, 0.85, 0.10)
SUPPORT_SAMPLES = 30
# The main camera is the most common view in a broadcast. A fit taken from a
# replay, close-up, or other angle matches few sampled frames.
SUPPORT_ACCEPT = 0.30
SUPPORT_MIN = 0.15


def _sample_frames(cap, total, count=SUPPORT_SAMPLES, size=(384, 216)):
    frames = []
    for k in range(count):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(total * (0.05 + 0.9 * k / max(1, count - 1))))
        ok, image = cap.read()
        if ok:
            frames.append(cv2.resize(image, size))
    return frames


def fit_support(points, court_lab, frames, image_size, threshold=0.50):
    """Fraction of sampled frames in which the fitted court lines are visible."""
    from .research import court_frame_score, court_probe_points

    probes = court_probe_points(points, image_size)
    if len(probes) < 8 or not frames:
        return 0.0
    scaled = probes * np.float32([frames[0].shape[1] / image_size[0], frames[0].shape[0] / image_size[1]])
    return float(np.mean([court_frame_score(f, scaled, court_lab) >= threshold for f in frames]))


def detect_court(video, *, binary=None):
    """Return ``(corners, court_lab)`` for the main camera, or raise."""
    from .research import court_color, court_frame_score, court_probe_points

    executable = binary or os.environ.get("MINTONIX_COURT_DETECTOR") or shutil.which("mintonix-court-detect")
    if not executable:
        raise RuntimeError("Court detector is missing: build native/court-detection and put it on PATH")
    cap = cv2.VideoCapture(str(video))
    try:
        if not cap.isOpened():
            raise ValueError("Cannot open video for court detection")
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        if total <= 0:
            raise ValueError("Cannot read video frame count for court detection")
        samples = None
        best = None
        with tempfile.TemporaryDirectory(prefix="mintonix-court-") as directory:
            for attempt, fraction in enumerate(FIT_POSITIONS):
                frame = min(total - 1, int(total * fraction))
                # Unique files prevent a failed retry from reusing an earlier CSV.
                output = Path(directory) / f"court-{attempt}.csv"
                env = dict(os.environ, COURT_DETECT_FRAME=str(frame), COURT_DETECT_MAX_WIDTH="960")
                try:
                    result = subprocess.run(
                        [str(executable), str(video), str(output)], env=env,
                        capture_output=True, text=True, timeout=120,
                    )
                    if result.returncode or not output.is_file():
                        logger.info("Court fit rejected at frame %s (exit %s): %s",
                                    frame, result.returncode, (result.stderr or "")[-500:].strip())
                        continue
                    points = validate_corners(read_detected_corners(output), width, height)
                    cap.set(cv2.CAP_PROP_POS_FRAMES, frame)
                    ok, image = cap.read()
                    if not ok:
                        continue
                    court_lab = court_color(image, points)
                    probes = court_probe_points(points, (width, height))
                    if len(probes) < 8 or court_frame_score(image, probes, court_lab) < 0.50:
                        logger.info("Court fit lacks painted-line support at frame %s", frame)
                        continue
                    if samples is None:
                        samples = _sample_frames(cap, total)
                    support = fit_support(points, court_lab, samples, (width, height))
                    logger.info("Court fit at frame %s matches %.0f%% of sampled frames", frame, 100 * support)
                    if best is None or support > best[0]:
                        best = (support, points, court_lab)
                    if support >= SUPPORT_ACCEPT:
                        break
                except (ValueError, KeyError, subprocess.TimeoutExpired) as exc:
                    logger.info("Court fit failed at frame %s: %s", frame, exc)
        if best is None or best[0] < SUPPORT_MIN:
            raise RuntimeError(f"No reliable court fit in {len(FIT_POSITIONS)} attempts")
        return best[1], best[2]
    finally:
        cap.release()
