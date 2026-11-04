import copy
import json
import math
from pathlib import Path
import unittest

from jsonschema import ValidationError

from mintonix_rallies.manifest import build_manifest, playable_frames, validate_manifest


def manifest():
    return build_manifest(
        match_id="match", title="A vs B", players=["A", "B"], duration=10, fps=25,
        youtube_video_id="9WVwZSzixh0", rallies=[{"game": 1, "start_frame": 25, "end_frame": 49}],
    )


class ManifestTests(unittest.TestCase):
    def test_packaged_schema_matches_canonical_contract(self):
        worker = Path(__file__).resolve().parents[1]
        self.assertEqual(
            json.loads((worker / "src/mintonix_rallies/manifest.schema.json").read_text()),
            json.loads((worker.parents[1] / "contracts/rally-manifest.schema.json").read_text()),
        )

    def test_manifest_names_the_youtube_source(self):
        self.assertEqual(manifest()["source"], {"provider": "youtube", "videoId": "9WVwZSzixh0", "durationSeconds": 10})

    def test_inclusive_frames_become_half_open_original_seconds(self):
        rally = manifest()["rallies"][0]
        self.assertEqual((rally["startSeconds"], rally["endSeconds"]), (1, 2))
        self.assertNotIn("scoreBefore", rally)

    def test_subtracts_leading_trailing_overlapping_and_long_switches(self):
        rally = {"start_frame": 0, "end_frame": 2000, "camera_switches": [
            {"start_frame": 100, "end_frame": 1800},
            {"start_frame": 0, "end_frame": 10},
            {"start_frame": 1790, "end_frame": 1850},
            {"start_frame": 1900, "end_frame": 3000},
        ]}
        self.assertEqual(list(playable_frames(rally)), [(11, 100), (1851, 1900)])

    def test_fully_excluded_spans_produce_no_fake_rallies(self):
        with self.assertRaises(ValidationError):
            build_manifest(match_id="m", title="m", players=["A", "B"], fps=30, duration=10,
                           youtube_video_id="9WVwZSzixh0",
                           rallies=[{"game": 1, "start_frame": 0, "end_frame": 29,
                                     "camera_switches": [{"start_frame": 0, "end_frame": 29}]}])

    def test_stable_ids_and_optional_score_order(self):
        args = dict(match_id="m", title="m", players=["top", "bottom"], fps=25, duration=5,
                    youtube_video_id="9WVwZSzixh0",
                    rallies=[{"game": 2, "start_frame": 0, "end_frame": 99, "p1": 4, "p0": 8,
                              "camera_switches": [{"start_frame": 25, "end_frame": 49}]}])
        first = build_manifest(**args)
        scored = build_manifest(**args, include_scores=True)
        self.assertEqual([r["id"] for r in first["rallies"]], [r["id"] for r in scored["rallies"]])
        self.assertEqual([r["scoreBefore"] for r in scored["rallies"]], [[4, 8], [4, 8]])

    def test_temporal_and_schema_invariants(self):
        cases = []
        for value in (math.nan, math.inf, 0, -1):
            bad = manifest()
            bad["source"]["durationSeconds"] = value
            cases.append(bad)
        for source in ({"provider": "vimeo", "videoId": "9WVwZSzixh0", "durationSeconds": 10},
                       {"provider": "youtube", "videoId": "too-short", "durationSeconds": 10},
                       {"provider": "youtube", "videoId": "9WVwZSzixh0"}):
            bad = manifest()
            bad["source"] = source
            cases.append(bad)
        bad = manifest()
        bad["version"] = 1
        cases.append(bad)
        for key, value in (("startSeconds", math.nan), ("endSeconds", math.inf),
                           ("endSeconds", 1), ("endSeconds", 11), ("game", 4)):
            bad = manifest()
            bad["rallies"][0][key] = value
            cases.append(bad)
        for second in (
            {"id": "second", "game": 1, "startSeconds": 1.5, "endSeconds": 3},
            {"id": "g1-f25-50", "game": 1, "startSeconds": 3, "endSeconds": 4},
            {"id": "second", "game": 1, "startSeconds": 3, "endSeconds": 4},
        ):
            bad = manifest()
            if second["id"] == "second" and second["startSeconds"] == 3:
                bad["rallies"][0]["game"] = 2
            bad["rallies"].append(second)
            cases.append(bad)
        bad = manifest()
        bad["mediaUrl"] = "unexpected"
        cases.append(bad)
        for bad in cases:
            with self.subTest(manifest=bad), self.assertRaises((ValueError, ValidationError)):
                validate_manifest(bad)

    def test_adjacent_intervals_are_allowed(self):
        data = manifest()
        second = copy.deepcopy(data["rallies"][0])
        second.update(id="second", startSeconds=2, endSeconds=3)
        data["rallies"].append(second)
        self.assertIs(validate_manifest(data), data)
