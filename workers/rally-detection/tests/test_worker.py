import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from mintonix_rallies.worker import main, read_job, write_manifest
from test_manifest import manifest


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / "video.mp4").write_bytes(b"placeholder")
        self.job = self.root / "job.json"
        self.data = {"matchId": "match", "title": "A vs B", "players": ["A", "B"], "video": "video.mp4"}
        self.job.write_text(json.dumps(self.data))

    def test_resolves_relative_video_and_needs_no_court_file(self):
        self.assertEqual(read_job(self.job)["video"], (self.root / "video.mp4").resolve())

    def test_rejects_invalid_jobs_including_supplied_court(self):
        for changes in ({"court": "court.txt"}, {"includeScores": "false"}, {"players": ["A"]},
                        {"title": " "}, {"video": "absent.mp4"}, {"unknown": True}):
            self.job.write_text(json.dumps(dict(self.data, **changes)))
            with self.subTest(changes=changes), self.assertRaises((ValueError, FileNotFoundError)):
                read_job(self.job)

    def test_success_writes_valid_manifest(self):
        output = self.root / "output/manifest.json"
        with patch("mintonix_rallies.worker.detect", return_value=manifest()) as detector:
            self.assertEqual(main(["--job", str(self.job), "--output", str(output)]), 0)
        self.assertEqual(json.loads(output.read_text()), manifest())
        self.assertNotIn("court", detector.call_args.kwargs)

    def test_failure_preserves_previous_result_and_writes_no_partial(self):
        output = self.root / "manifest.json"
        output.write_text("previous")
        with patch("mintonix_rallies.worker.detect", side_effect=RuntimeError("no court")):
            self.assertEqual(main(["--job", str(self.job), "--output", str(output)]), 1)
        self.assertEqual(output.read_text(), "previous")
        self.assertEqual(list(self.root.glob(".manifest-*")), [])

    def test_cannot_overwrite_job_or_video(self):
        for output in (self.job, self.root / "video.mp4"):
            with patch("mintonix_rallies.worker.detect") as detector:
                self.assertEqual(main(["--job", str(self.job), "--output", str(output)]), 1)
                detector.assert_not_called()

    def test_invalid_output_is_never_published(self):
        output = self.root / "manifest.json"
        with self.assertRaises(Exception):
            write_manifest(output, {"version": 1})
        self.assertFalse(output.exists())
