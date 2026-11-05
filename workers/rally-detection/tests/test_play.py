from pathlib import Path
import tempfile
import unittest

import cv2
import numpy as np

from mintonix_rallies.manifest import playable_frames
from mintonix_rallies.play import longest_flight, mark_dead_time


def flying(n, step=20.0):
    return [(100 + step * i, 500.0, 0.9) for i in range(n)]


class FlightTests(unittest.TestCase):
    def test_moving_shuttle_counts_held_or_missing_does_not(self):
        self.assertEqual(longest_flight(flying(30), 1080), 29)
        self.assertEqual(longest_flight([(500.0, 500.0, 0.9)] * 30, 1080), 0)  # held
        self.assertEqual(longest_flight([(x, y, 0.1) for x, y, _ in flying(30)], 1080), 0)  # unsure
        self.assertEqual(longest_flight(flying(30, step=400), 1080), 0)  # unrelated jumps

    def test_short_dropouts_are_bridged_long_ones_split(self):
        bridged = flying(10) + [(0, 0, 0.0)] * 3 + flying(10)
        self.assertGreater(longest_flight(bridged, 1080), 15)
        split = flying(10) + [(0, 0, 0.0)] * 10 + flying(10)
        self.assertLess(longest_flight(split, 1080), 10)

    def test_no_play_ranges_are_subtracted(self):
        rally = {"start_frame": 0, "end_frame": 99, "camera_switches": [{"start_frame": 40, "end_frame": 49}],
                 "no_play": [{"start_frame": 0, "end_frame": 39}]}
        self.assertEqual(list(playable_frames(rally)), [(50, 100)])


class FakeFlightTracker:
    """Shuttle moves 10 px a frame in bright frames; dark frames have none."""

    def __init__(self):
        self.k = 0

    def points(self, rgb3, size):
        out = []
        for f in rgb3:
            self.k += 1
            out.append((100.0 + 10 * self.k, 90.0, 0.9) if f.mean() > 128 else (0.0, 0.0, 0.0))
        return out


class DeadTimeTests(unittest.TestCase):
    def test_piece_without_flight_is_marked_no_play(self):
        with tempfile.TemporaryDirectory() as directory:
            video = Path(directory) / "v.avi"
            writer = cv2.VideoWriter(str(video), cv2.VideoWriter_fourcc(*"MJPG"), 30, (320, 180))
            for i in range(120):  # frames 0-59 dead (dark), 60-119 live (bright)
                writer.write(np.full((180, 320, 3), 20 if i < 60 else 230, np.uint8))
            writer.release()
            rally = {"score": "1-0", "start_frame": 0, "end_frame": 119,
                     "camera_switches": [{"start_frame": 50, "end_frame": 59}]}
            mark_dead_time(video, [rally], 30.0, FakeFlightTracker())
            self.assertEqual(rally["no_play"], [{"start_frame": 0, "end_frame": 49}])
            self.assertEqual(list(playable_frames(rally)), [(60, 120)])
