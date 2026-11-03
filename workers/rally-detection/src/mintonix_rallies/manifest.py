"""Wire-contract validation and research-frame conversion."""
import json
import math
from functools import cache
from importlib.resources import files

from jsonschema import Draft202012Validator


@cache
def _schema_validator():
    schema = json.loads(files("mintonix_rallies").joinpath("manifest.schema.json").read_text())
    return Draft202012Validator(schema)


def validate_manifest(manifest):
    _schema_validator().validate(manifest)
    duration = manifest["sourceDurationSeconds"]
    if not math.isfinite(duration):
        raise ValueError("Source duration must be finite")
    previous_end, previous_game = 0, 1
    ids = set()
    for rally in manifest["rallies"]:
        start, end = rally["startSeconds"], rally["endSeconds"]
        if not all(math.isfinite(n) for n in (start, end)):
            raise ValueError("Rally timestamps must be finite")
        if not previous_end <= start < end <= duration:
            raise ValueError("Rallies must be chronological, non-overlapping, and within the source")
        if rally["game"] < previous_game:
            raise ValueError("Game numbers must not move backward")
        if rally["id"] in ids:
            raise ValueError("Rally IDs must be unique")
        previous_end, previous_game = end, rally["game"]
        ids.add(rally["id"])
    return manifest


def playable_frames(rally):
    """Subtract all inclusive camera-switch ranges; yield half-open frames.

    One research rally may become several playback intervals. The current
    contract has no nested segments, so each gets its own stable ID.
    """
    start, end = rally["start_frame"], rally["end_frame"] + 1
    switches = sorted((s["start_frame"], s["end_frame"] + 1)
                      for s in rally.get("camera_switches", []))
    for left, right in switches:
        if right <= start or left >= end:
            continue
        if left > start:
            yield start, left
        start = max(start, right)
        if start >= end:
            return
    if start < end:
        yield start, end


def build_manifest(*, match_id, title, players, duration, fps, rallies, include_scores=False):
    if not math.isfinite(fps) or fps <= 0:
        raise ValueError("Frame rate must be finite and positive")
    intervals = []
    for rally in rallies:
        for start, end in playable_frames(rally):
            start_seconds, end_seconds = start / fps, min(end / fps, duration)
            if start_seconds >= end_seconds:
                continue
            item = {
                "id": f"g{rally['game']}-f{start}-{end}",
                "game": rally["game"],
                "startSeconds": start_seconds,
                "endSeconds": end_seconds,
            }
            if include_scores and rally.get("p1") is not None and rally.get("p0") is not None:
                # Research p1/p0 mean scoreboard top/bottom, not court ends.
                item["scoreBefore"] = [rally["p1"], rally["p0"]]
            intervals.append(item)
    return validate_manifest({
        "version": 1,
        "matchId": match_id,
        "title": title,
        "players": list(players),
        "sourceDurationSeconds": duration,
        "rallies": intervals,
    })
