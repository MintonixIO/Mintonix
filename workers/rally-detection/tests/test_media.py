"""Real FFmpeg/native smoke tests, with generated footage and no model weights."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import cv2
import numpy as np

from mintonix_rallies.court import detect_court
from mintonix_rallies.research import _ffmpeg_bgr_frames


GREEN = (55, 135, 40)
BLUE = (150, 90, 30)
MAIN = np.float32([[440, 220], [840, 220], [1050, 660], [230, 660]])
# An overhead-style alternate view: a different, smaller court placement.
ALTERNATE = np.float32([[520, 120], [760, 120], [820, 600], [460, 600]])


def court_image(corners, colour, width=1280, height=720):
    image = np.full((height, width, 3), 25, np.uint8)
    transform = cv2.getPerspectiveTransform(
        np.float32([[0, 0], [6.1, 0], [6.1, 13.41], [0, 13.41]]), corners,
    )
    cv2.fillConvexPoly(image, corners.astype(np.int32), colour)

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
    return image


def write_court_video(path, colour=GREEN, frames=30, alternate=()):
    """Main-camera court video; frame indexes in ``alternate`` show another view."""
    main, other = court_image(MAIN, colour), court_image(ALTERNATE, colour)
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), 30, (1280, 720))
    if not writer.isOpened():
        raise RuntimeError("MJPG encoder unavailable")
    try:
        for i in range(frames):
            writer.write(other if i in alternate else main)
    finally:
        writer.release()
    return MAIN


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
            detected, _colour = detect_court(video)
            np.testing.assert_allclose(detected, expected, atol=12)

    @unittest.skipUnless(os.environ.get("MINTONIX_COURT_DETECTOR") or shutil.which("mintonix-court-detect"),
                         "Compiled native court detector required")
    def test_blue_court_is_fitted_and_scored(self):
        from mintonix_rallies.research import court_frame_scores

        with tempfile.TemporaryDirectory() as directory:
            video = Path(directory) / "court.avi"
            expected = write_court_video(video, colour=BLUE)
            detected, colour = detect_court(video)
            np.testing.assert_allclose(detected, expected, atol=12)
            self.assertGreaterEqual(court_frame_scores(str(video), detected, colour).min(), 0.5)

    @unittest.skipUnless(os.environ.get("MINTONIX_COURT_DETECTOR") or shutil.which("mintonix-court-detect"),
                         "Compiled native court detector required")
    def test_fit_from_alternate_view_loses_to_main_camera(self):
        # The first fit position (40%) lands in a short alternate view. That
        # fit is valid but matches few frames, so the main camera must win.
        with tempfile.TemporaryDirectory() as directory:
            video = Path(directory) / "court.avi"
            expected = write_court_video(video, frames=100, alternate=range(30, 50))
            detected, _colour = detect_court(video)
            np.testing.assert_allclose(detected, expected, atol=12)

    def test_variable_frame_rate_file_keeps_source_timeline(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "court.avi"
            write_court_video(source, frames=60)
            video = Path(directory) / "vfr.mp4"
            # Jitter every third picture by 11 ms and drop frames 20-29.
            subprocess.run([
                "ffmpeg", "-v", "error", "-i", str(source), "-vf",
                "select='not(between(n,20,29))',settb=1/15360,setpts='(N+10*gte(N,20))*512+eq(mod(N,3),1)*170'",
                "-fps_mode", "passthrough", "-video_track_timescale", "15360", "-c:v", "libx264", str(video),
            ], check=True)
            indexes = [idx for idx, _ in _ffmpeg_bgr_frames(str(video), 384, 216)]
            self.assertEqual(indexes, list(range(20)) + list(range(30, 60)))
