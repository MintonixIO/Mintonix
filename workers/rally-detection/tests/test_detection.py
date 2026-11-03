import csv
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

import numpy as np

from mintonix_rallies import research
from mintonix_rallies.court import detect_court, read_detected_corners, validate_corners


class CourtTests(unittest.TestCase):
    def test_native_model_corners_are_reordered_to_image_coordinates(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "court.csv"
            corners = [(10, 10), (0, 100), (100, 100), (90, 10)]
            with path.open("w", newline="") as output:
                writer = csv.writer(output)
                writer.writerow(["Point", "X", "Y", "Confidence"])
                for i in range(1, 23):
                    writer.writerow([f"P{i}", *corners[(i - 1) % 4], 0.9])
            self.assertEqual(read_detected_corners(path), [list(corners[i]) for i in (0, 3, 2, 1)])

    def test_degenerate_crossed_and_out_of_image_corners_fail(self):
        for points in ([[0, 0]] * 4, [[0, 0], [100, 100], [100, 0], [0, 100]],
                        [[0, 0], [200, 0], [200, 100], [0, 100]]):
            with self.subTest(points=points), self.assertRaises(ValueError):
                validate_corners(points, 150, 150)

    def test_failed_native_attempts_are_bounded_and_capture_is_released(self):
        capture = Mock()
        capture.get.return_value = 100
        with patch("mintonix_rallies.court.cv2.VideoCapture", return_value=capture), patch(
            "mintonix_rallies.court.subprocess.run", side_effect=subprocess.TimeoutExpired("court", 120)
        ) as runner:
            with self.assertRaisesRegex(RuntimeError, "five attempts"):
                detect_court("video.mp4", binary="detector")
            self.assertEqual(runner.call_count, 5)
            self.assertEqual(len({c.args[0][2] for c in runner.call_args_list}), 5)
            capture.release.assert_called_once()

    def test_native_failure_does_not_accept_stale_output(self):
        capture = Mock()
        capture.get.return_value = 100
        with patch("mintonix_rallies.court.cv2.VideoCapture", return_value=capture), patch(
            "mintonix_rallies.court.subprocess.run", return_value=Mock(returncode=3, stderr="fit failed")
        ):
            with self.assertRaisesRegex(RuntimeError, "five attempts"):
                detect_court("video.mp4", binary="detector")


class ResearchTests(unittest.TestCase):
    def test_timestamp_holes_preserve_original_frame_coordinates(self):
        result = Mock(returncode=0, stdout="1024\n1536\n2560\n")
        with patch.object(research.subprocess, "run", return_value=result):
            self.assertEqual(research._frame_timeline_indexes("video", 512), [2, 3, 5])

    def test_variable_negative_and_repeated_timestamps_are_rejected(self):
        for timestamps in ("0\n200\n512\n", "-512\n0\n", "0\n0\n"):
            with patch.object(research.subprocess, "run", return_value=Mock(returncode=0, stdout=timestamps)):
                with self.subTest(timestamps=timestamps), self.assertRaises(ValueError):
                    research._frame_timeline_indexes("video", 512)

    def test_court_hysteresis(self):
        np.testing.assert_array_equal(
            research.court_visible_from_scores([0, .5, .45, .39, .45, .6]),
            [False, True, True, False, False, True],
        )

    def test_later_game_score_uses_rightmost_column(self):
        hits = [(50, 340, 21), (50, 385, 11), (92, 340, 19), (92, 385, 15)]
        self.assertEqual(research.current_game_score(hits), (11, 15))
        self.assertEqual(research.score_column_count(hits), 2)

    def test_long_replays_are_still_excluded_camera_switches(self):
        visible = np.zeros(2000, dtype=bool)
        visible[1700:1950] = True
        self.assertEqual(research.camera_switches_in_span(visible, 0, 1999, fps=25), [
            {"start_frame": 0, "end_frame": 1699}, {"start_frame": 1950, "end_frame": 1999},
        ])

    def test_game_reset_and_deciding_game_end_swap(self):
        self.assertTrue(research.is_new_game_score((23, 21), (1, 0), gap=5000, fps=25))
        self.assertFalse(research.is_new_game_score((10, 8), (1, 0), gap=5000, fps=25))
        self.assertTrue(research.ends_swapped_for(3, 11, 9))

    def test_ocr_failure_closes_capture_and_propagates(self):
        capture = Mock()
        capture.get.return_value = 30
        capture.read.return_value = (True, np.zeros((100, 100, 3), np.uint8))
        ocr = Mock()
        ocr.predict.side_effect = RuntimeError("inference failed")
        with patch.object(research.cv2, "VideoCapture", return_value=capture):
            with self.assertRaisesRegex(RuntimeError, "inference failed"):
                research.refine_court_frames("video", [{"start": 0, "end": 29}], ocr)
        capture.release.assert_called_once()
