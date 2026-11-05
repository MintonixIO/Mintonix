#!/usr/bin/env python3
"""Run the detector on one video and score it against reviewed intervals.

Court fit, per-frame court scores and OCR reads are cached in --cache, so
changes to score sequencing or interval logic re-run in seconds.

    python scripts/evaluate.py --video dl1.mp4 --truth rallies.json --cache .cache/dl1 --out result.json

--truth accepts a research rallies.json or a v2 manifest.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import pickle
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from mintonix_rallies import research  # noqa: E402
from mintonix_rallies.court import detect_court  # noqa: E402
from mintonix_rallies.detect import probe_video  # noqa: E402
from mintonix_rallies.manifest import build_manifest, playable_frames  # noqa: E402


class CachedOCR:
    """PaddleOCR keyed by crop bytes, persisted between runs."""

    def __init__(self, path):
        self.path = Path(path)
        self.cache = pickle.loads(self.path.read_bytes()) if self.path.exists() else {}
        self.ocr = None

    def predict(self, image):
        key = hashlib.sha1(np.ascontiguousarray(image).tobytes()).hexdigest()
        if key not in self.cache:
            if self.ocr is None:
                from paddleocr import PaddleOCR

                self.ocr = PaddleOCR(lang="en", device="cpu", use_doc_orientation_classify=False,
                                     use_doc_unwarping=False, use_textline_orientation=False)
            res = list(self.ocr.predict(image))
            self.cache[key] = [{"rec_texts": list(r["rec_texts"]),
                                "rec_polys": [np.asarray(p).tolist() for p in r["rec_polys"]]} for r in res]
        return self.cache[key]

    def save(self):
        self.path.write_bytes(pickle.dumps(self.cache))


def intervals_of(path, fps):
    data = json.loads(Path(path).read_text())
    rallies = data["rallies"] if isinstance(data, dict) else data
    if rallies and "startSeconds" in rallies[0]:
        return [(r["startSeconds"], r["endSeconds"]) for r in rallies]
    return [(a / fps, b / fps) for r in rallies for a, b in playable_frames(r)]


def overlap(a, b):
    return max(0.0, min(a[1], b[1]) - max(a[0], b[0]))


def score(truth, found, iou_min=0.5):
    """Interval recall/precision at IoU >= iou_min, boundary errors, and time-level overlap."""
    def iou(a, b):
        o = overlap(a, b)
        return o / ((a[1] - a[0]) + (b[1] - b[0]) - o)

    pairs = sorted(((iou(t, f), i, j) for i, t in enumerate(truth) for j, f in enumerate(found)
                    if overlap(t, f) > 0), reverse=True)
    used_t, used_f, matched = set(), set(), []
    for v, i, j in pairs:
        if v >= iou_min and i not in used_t and j not in used_f:
            used_t.add(i)
            used_f.add(j)
            matched.append((i, j))
    start_err = [abs(found[j][0] - truth[i][0]) for i, j in matched]
    end_err = [abs(found[j][1] - truth[i][1]) for i, j in matched]
    covered = sum(overlap(t, f) for t in truth for f in found)
    t_total = sum(b - a for a, b in truth)
    f_total = sum(b - a for a, b in found)
    pct = lambda xs, q: round(float(np.percentile(xs, q)), 2) if xs else None  # noqa: E731
    return {
        "truth_intervals": len(truth), "found_intervals": len(found),
        "interval_recall": round(len(matched) / max(1, len(truth)), 3),
        "interval_precision": round(len(matched) / max(1, len(found)), 3),
        "start_error_s": {"median": pct(start_err, 50), "p90": pct(start_err, 90)},
        "end_error_s": {"median": pct(end_err, 50), "p90": pct(end_err, 90)},
        "time_recall": round(covered / max(1e-9, t_total), 3),
        "time_precision": round(covered / max(1e-9, f_total), 3),
        "missed": [truth[i] for i in range(len(truth)) if i not in used_t],
        "extra": [found[j] for j in range(len(found)) if j not in used_f],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--truth")
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out", required=True, help="Write the manifest and score here")
    args = ap.parse_args()
    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    video = str(Path(args.video).resolve())
    fps, duration, _w, _h = probe_video(video)

    court_file = cache / "court.json"
    if court_file.exists():
        c = json.loads(court_file.read_text())
        points, lab = c["points"], np.float32(c["lab"])
    else:
        points, lab = detect_court(video)
        court_file.write_text(json.dumps({"points": points, "lab": np.asarray(lab).tolist()}))
    scores_file = cache / "court_scores.npy"
    if scores_file.exists():
        scores = np.load(scores_file)
    else:
        scores = research.court_frame_scores(video, points, lab)
        np.save(scores_file, scores)
    court_frames = research.find_court_frames(video, points, lab, scores=scores)

    ocr = CachedOCR(cache / "ocr.pkl")
    try:
        rallies = research.refine_court_frames(video, court_frames, ocr, fps=fps,
                                               n_frames=math.ceil(duration * fps))
    finally:
        ocr.save()
    from mintonix_rallies.play import ShuttleTracker, mark_dead_time

    rallies = mark_dead_time(video, rallies, fps, ShuttleTracker())
    manifest = build_manifest(match_id="eval", title="eval", players=["top", "bottom"], duration=duration,
                              fps=fps, youtube_video_id="00000000000", rallies=rallies, include_scores=True)
    result = {"court": points, "manifest": manifest}
    if args.truth:
        found = [(r["startSeconds"], r["endSeconds"]) for r in manifest["rallies"]]
        result["score"] = score(intervals_of(args.truth, fps), found)
        summary = {k: v for k, v in result["score"].items() if k not in ("missed", "extra")}
        summary["missed"] = len(result["score"]["missed"])
        summary["extra"] = len(result["score"]["extra"])
        print(json.dumps(summary, indent=1))
    Path(args.out).write_text(json.dumps(result, indent=1))


if __name__ == "__main__":
    main()
