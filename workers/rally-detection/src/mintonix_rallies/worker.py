"""Run one mounted job on a local machine or Vast instance."""
import argparse
import json
import logging
import os
from pathlib import Path
import sys
import tempfile

from .detect import detect


def read_job(path):
    path = Path(path).resolve(strict=True)
    job = json.loads(path.read_text())
    required = {"matchId", "title", "players", "video"}
    if not isinstance(job, dict) or not required <= job.keys() or job.keys() - required - {"includeScores"}:
        raise ValueError("Job requires matchId, title, players, video; only includeScores is optional")
    for key in required - {"players"}:
        if not isinstance(job[key], str) or not job[key].strip():
            raise ValueError(f"{key} must be a nonempty string")
    if (not isinstance(job["players"], list) or len(job["players"]) != 2
            or any(not isinstance(p, str) or not p.strip() for p in job["players"])):
        raise ValueError("players must contain two nonempty names in scoreboard top/bottom order")
    if type(job.get("includeScores", False)) is not bool:
        raise ValueError("includeScores must be a boolean")
    job["video"] = (path.parent / job["video"]).resolve(strict=True)
    if not job["video"].is_file():
        raise ValueError("video must be a local file")
    return job


def write_manifest(path, manifest):
    """Publish only validated, complete JSON, with no partial file on failure."""
    from .manifest import validate_manifest

    validate_manifest(manifest)
    payload = json.dumps(manifest, indent=2, allow_nan=False) + "\n"
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, prefix=".manifest-", delete=False) as output:
            temporary = Path(output.name)
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Detect broadcast rallies from one local job")
    parser.add_argument("--job", type=Path, required=True, help="Job JSON; media paths are relative to this file")
    parser.add_argument("--output", type=Path, required=True, help="Destination rally manifest JSON")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    try:
        job = read_job(args.job)
        if args.output.resolve() in {job["video"], args.job.resolve()}:
            raise ValueError("Output must not overwrite a job input")
        manifest = detect(
            video=job["video"], match_id=job["matchId"], title=job["title"],
            players=job["players"], include_scores=job.get("includeScores", False),
        )
        write_manifest(args.output, manifest)
    except Exception as exc:
        print(f"Rally detection failed: {exc}", file=sys.stderr)
        return 1
    print(f"Wrote {len(manifest['rallies'])} playback intervals to {args.output}")
    return 0
