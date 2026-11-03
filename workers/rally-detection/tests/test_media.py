"""Real FFmpeg/native smoke tests, with generated footage and no model weights."""
import os
from pathlib import Path
import shutil
import tempfile
import unittest

import cv2
import numpy as np

from mintonix_rallies.court import detect_court
from mintonix_rallies.research import _ffmpeg_bgr_frames


def write_court_video(path):
    width, height = 1280, 720
    image = np.full((height, width, 3), 25, np.uint8)
    corners = np.float32([[440, 220], [840, 220], [1050, 660], [230, 660]])
    transform = cv2.getPerspectiveTransform(
        np.float32([[0, 0], [6.1, 0], [6.1, 13.41], [0, 13.41]]), corners,
    )
    cv2.fillConvexPoly(image, corners.astype(np.int32), (55, 135, 40))

    def line(a, b):
        pts = cv2.perspectiveTransform(np.float32([[a, b]]), transform)[0]
        cv2.line(image, tuple(np.rint(pts[0]).astype(int)), tuple(np.rint(pts[1]).astype(int)),
                 (245, 245, 245), 2, cv2.LINE_AA)

    for x in (0, .46, 5.64, 6.1):
        line((x, 0), (x, 13.41))
    for y in (0, .76, 4.72, 8.685, 12.65, 13.41):
        line((0, y), (6.1, y))
    line((3.05, 0), (3.05, 4.72))
    line((3.05, 8.685), (3.05, 13.41))
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), 30, (width, height))
    if not writer.isOpened():
        raise RuntimeError("MJPG encoder unavailable")
    try:
        for _ in range(30):
            writer.write(image)
    finally:
        writer.release()
    return corners


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg required")
class MediaTests(unittest.TestCase):
    def test_ffmpeg_reads_each_source_frame(self):
        with tempfile.TemporaryDirectory() as directory:
            video = Path(directory) / "court.avi"
            write_court_video(video)
            frames = list(_ffmpeg_bgr_frames(str(video), 384, 216))
            self.assertEqual([idx for idx, _ in frames], list(range(30)))
            self.assertEqual(frames[0][1].shape, (216, 384, 3))

    @unittest.skipUnless(os.environ.get("MINTONIX_COURT_DETECTOR") or shutil.which("mintonix-court-detect"),
                         "Compiled native court detector required")
    def test_native_fitter_finds_generated_court_without_supplied_points(self):
        with tempfile.TemporaryDirectory() as directory:
            video = Path(directory) / "court.avi"
            expected = write_court_video(video)
            detected = detect_court(video)
            np.testing.assert_allclose(detected, expected, atol=12)
