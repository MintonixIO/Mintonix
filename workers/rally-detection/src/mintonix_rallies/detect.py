"""One headless detection pass: probe, fit the court, then run the research detector."""
import json
import math
import subprocess
from pathlib import Path

from .manifest import build_manifest
from .court import detect_court, validate_corners


def probe_video(path):
    result = subprocess.run([
        "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_streams",
        "-show_format", "-of", "json", str(path),
    ], check=True, capture_output=True, text=True)
    data = json.loads(result.stdout)
    if not data.get("streams"):
        raise ValueError("Input has no video stream")
    stream = data["streams"][0]
    numerator, denominator = map(int, stream["r_frame_rate"].split("/"))
    fps = numerator / denominator
    duration = float(data.get("format", {}).get("duration") or stream.get("duration") or 0)
    width, height = stream["width"], stream["height"]
    if not all(math.isfinite(n) and n > 0 for n in (fps, duration, width, height)):
        raise ValueError("Video must have finite positive duration, frame rate, and dimensions")
    return fps, duration, width, height


def detect(*, video, match_id, title, players, youtube_video_id, include_scores=False, ocr=None):
    """Analyse a local copy of the complete YouTube upload; timestamps stay on its timeline."""
    from . import research

    video = str(Path(video).resolve(strict=True))
    fps, duration, width, height = probe_video(video)
    points = validate_corners(detect_court(video), width, height)
    court_frames = research.find_court_frames(video, points)
    if ocr is None:
        from paddleocr import PaddleOCR

        ocr = PaddleOCR(
            lang="en", device="cpu", use_doc_orientation_classify=False,
            use_doc_unwarping=False, use_textline_orientation=False,
        )
    rallies = research.refine_court_frames(video, court_frames, ocr)
    return build_manifest(
        match_id=match_id, title=title, players=players, duration=duration, fps=fps,
        youtube_video_id=youtube_video_id, rallies=rallies, include_scores=include_scores,
    )
