import csv
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

import numpy as np

from mintonix_rallies import research
from mintonix_rallies.court import FIT_POSITIONS, detect_court, read_detected_corners, validate_corners
from mintonix_rallies.manifest import playable_frames


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
            with self.assertRaisesRegex(RuntimeError, "No reliable court fit"):
                detect_court("video.mp4", binary="detector")
            self.assertEqual(runner.call_count, len(FIT_POSITIONS))
            self.assertEqual(len({c.args[0][2] for c in runner.call_args_list}), len(FIT_POSITIONS))
            capture.release.assert_called_once()

    def test_native_failure_does_not_accept_stale_output(self):
        capture = Mock()
        capture.get.return_value = 100
        with patch("mintonix_rallies.court.cv2.VideoCapture", return_value=capture), patch(
            "mintonix_rallies.court.subprocess.run", return_value=Mock(returncode=3, stderr="fit failed")
        ):
            with self.assertRaisesRegex(RuntimeError, "No reliable court fit"):
                detect_court("video.mp4", binary="detector")


class ResearchTests(unittest.TestCase):
    def test_timestamp_holes_preserve_original_frame_coordinates(self):
        result = Mock(returncode=0, stdout="1024\n1536\n2560\n")
        with patch.object(research.subprocess, "run", return_value=result):
            self.assertEqual(research._frame_timeline_indexes("video", 512), [2, 3, 5])

    def test_variable_rate_timestamps_snap_to_nearest_grid_slot(self):
        # 30 fps grid in a 1/15360 time base is 512 ticks per frame. Jittered
        # pictures round to the nearest slot; a second picture on a used slot
        # is marked None so each slot keeps its first picture.
        result = Mock(returncode=0, stdout="0\n700\n1000\n1100\n2560\n")
        with patch.object(research.subprocess, "run", return_value=result):
            self.assertEqual(research._frame_timeline_indexes("video", 512), [0, 1, 2, None, 5])

    def test_fractional_ticks_per_frame(self):
        # 29.97 fps in a 1/90000 time base is 3003 ticks per frame.
        ticks = research.Fraction(90000) / research.Fraction(30000, 1001)
        self.assertEqual(research.frame_index_from_timestamp(3003 * 7, ticks), 7)

    def test_negative_or_missing_timestamps_are_rejected(self):
        for timestamps in ("-512\n0\n", "N/A\n512\n"):
            with patch.object(research.subprocess, "run", return_value=Mock(returncode=0, stdout=timestamps)):
                with self.subTest(timestamps=timestamps), self.assertRaises(ValueError):
                    research._frame_timeline_indexes("video", 512)

    def test_timeline_fps_prefers_average_when_container_rate_is_bogus(self):
        self.assertEqual(research.timeline_fps("30/1", "30/1"), 30)
        self.assertEqual(research.timeline_fps("30000/1001", "2997/100"), research.Fraction(30000, 1001))
        self.assertEqual(research.timeline_fps("90000/1", "30/1"), 30)
        # Dropped frames lower the average; the nominal grid stays.
        self.assertEqual(research.timeline_fps("30/1", "25/1"), 30)

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

    def test_misread_scores_between_agreeing_neighbours_are_dropped(self):
        def pieces(*scores):
            return [{"start": i, "end": i, "score": sc} for i, sc in enumerate(scores)]

        kept = research.drop_misreads(pieces((13, 5), (18, 5), (14, 5), (15, 5)))
        self.assertEqual([p["score"] for p in kept], [(13, 5), (14, 5), (15, 5)])
        kept = research.drop_misreads(pieces((13, 5), (3, 5), (14, 5)))
        self.assertEqual([p["score"] for p in kept], [(13, 5), (14, 5)])
        # A new game resets the score; that is not a misread.
        game = pieces((21, 15), (0, 1), (1, 1))
        self.assertEqual(research.drop_misreads(game), game)
        # A skipped (off-camera) rally is a real two-point step.
        skip = pieces((4, 4), (5, 5), (6, 5))
        self.assertEqual(research.drop_misreads(skip), skip)

    def test_ocr_failure_closes_capture_and_propagates(self):
        capture = Mock()
        capture.get.return_value = 30
        capture.read.return_value = (True, np.zeros((100, 100, 3), np.uint8))
        ocr = Mock()
        ocr.predict.side_effect = RuntimeError("inference failed")
        with patch.object(research.cv2, "VideoCapture", return_value=capture):
            with self.assertRaisesRegex(RuntimeError, "inference failed"):
                research.refine_court_frames("video", [{"start": 0, "end": 29}], ocr, fps=30)
        capture.release.assert_called_once()


class FakeCapture:
    """Video capture whose frames carry no pixels, only the seeked time."""

    def __init__(self, clock):
        self.clock = clock

    def isOpened(self):
        return True

    def set(self, prop, value):
        if prop == research.cv2.CAP_PROP_POS_MSEC:
            self.clock["frame"] = int(round(value * 30 / 1000.0))
        return True

    def read(self):
        return True, np.zeros((100, 100, 3), np.uint8)

    def release(self):
        pass


class ScoreboardOCR:
    """Returns the scoreboard text for whatever frame was last seeked."""

    def __init__(self, clock, score_for):
        self.clock, self.score_for = clock, score_for

    def predict(self, _image):
        top, bottom = self.score_for(self.clock["frame"])
        return [{"rec_texts": [str(top), str(bottom)],
                 "rec_polys": [[[10, 5], [20, 5], [20, 15], [10, 15]], [[10, 30], [20, 30], [20, 40], [10, 40]]]}]


class OffCameraRallyTests(unittest.TestCase):
    def test_rally_never_shown_on_main_camera_has_no_playback_time(self):
        # 0-0 is played on the main camera, then the 1-0 rally is shown only
        # from another angle for 97 s, then 2-0 is back on the main camera.
        def score_for(frame):
            return (0, 0) if frame < 90 else (1, 0) if frame < 3000 else (2, 0)

        clock = {"frame": 0}
        court = [{"start": 0, "end": 89}, {"start": 3000, "end": 3089}]
        with patch.object(research.cv2, "VideoCapture", return_value=FakeCapture(clock)):
            rallies = research.refine_court_frames("video", court, ScoreboardOCR(clock, score_for),
                                                   fps=30, n_frames=3090)
        self.assertEqual([r["score"] for r in rallies], ["0-0", "1-0", "2-0"])
        played = [span for r in rallies for span in playable_frames(r)]
        self.assertTrue(played)
        for start, end in played:
            self.assertTrue(end <= 120 or start >= 3000, (start, end))
