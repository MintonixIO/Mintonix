# Rally detection worker

One headless, single-job batch worker for local runs or a Vast.ai instance.
It automatically finds court coordinates, detects court-view intervals, uses
scoreboard OCR to assemble rally candidates, subtracts camera-switch intervals,
and writes a v2 manifest in seconds on the source YouTube video's timeline. No supplied court
file or interactive annotation step is accepted.

## Run locally

Requires Python 3.10–3.12, FFmpeg/ffprobe, CMake, a C++17 compiler, and OpenCV
development libraries (`libopencv-dev` on Debian/Ubuntu, `opencv` on Homebrew).
From this directory:

```sh
python3.10 -m venv .venv
. .venv/bin/activate
pip install '.[ocr]'
cmake -S native/court-detection -B build/native -DCMAKE_BUILD_TYPE=Release
cmake --build build/native --parallel 2
export MINTONIX_COURT_DETECTOR="$PWD/build/native/mintonix-court-detect"
mintonix-rallies --job /data/match/job.json --output /data/match/manifest.json
```

The executable can also be installed on PATH as `mintonix-court-detect`.
It is rebuilt from source; archived binaries tied to older OpenCV versions are
not required. Pose, TrackNet, InpaintNet, and MotionBERT weights are not needed.
PaddleOCR downloads OCR models on first use; retain its cache outside Git.

Job JSON (also see `example.job.json`):

```json
{
  "matchId": "my-match",
  "title": "Player A vs Player B",
  "players": ["Player A", "Player B"],
  "video": "match.mp4",
  "youtubeVideoId": "9WVwZSzixh0"
}
```

`video` is a local path, absolute or relative to the job JSON. It must be a
complete copy of the YouTube upload named by `youtubeVideoId`, not a trimmed or
concatenated cut, because the viewer embeds that YouTube video and seeks to the
manifest's timestamps. The manifest records it as `source`. Player names
must follow scoreboard top/bottom row order. Scores are omitted by default;
add `"includeScores": true` only when evaluating OCR labels. Detection still
uses OCR internally, so an unsupported/unreadable scoreboard can fail the job
even when output score labels are disabled.

## Container / Vast.ai

```sh
docker build -t mintonix-rallies .
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -v /absolute/job-directory:/data mintonix-rallies --job /data/job.json --output /data/manifest.json
```

The image builds the native detector and installs Python/OCR dependencies.
Both court fitting and OCR run on CPU, including on Vast GPU hosts; CUDA is not
required. Default container UID is 10001; mounted output/cache directories must
be writable. For repeat runs, mount a persistent cache and set
`PADDLE_PDX_CACHE_HOME` to that directory.

This is a batch command, not a public HTTP service. The caller stages media,
runs a job, and consumes its output. B2 transfers, callbacks, Vast provisioning,
and a persistent queue are not connected. Keep scoped storage credentials in
the caller, outside the job and manifest.

- Exit 0 means a complete, validated manifest was atomically written. Exit 1
  means input, court fitting, decoding, OCR, or validation failed. Invalid CLI
  arguments return 2.
- Court fitting tries five deterministic positions, with a 120-second timeout
  per attempt. Unreliable fits fail; no manual-coordinate fallback exists.
  The caller should impose an overall deadline based on measured throughput.
- Retrying identical inputs/settings atomically replaces the destination.
  IDs derive from game and source frame boundaries. Concurrent jobs need
  separate output paths. Dispatch and completion deduplication belong to the
  caller; the worker emits no callbacks.
- Failed runs preserve the previous output. Check the exit code; an existing
  file alone does not mean the new attempt succeeded.

## Detection details and limits

The C++ fitter comes from the supplied
`Mintonix-Archive/Mintonix-Pose-Improv/lib/court-detection` sources. It produces
22 intersections; Python normalizes the four outer corners and checks bounds
and painted-line support before passing them to detection in memory. Its CSV
is temporary and deleted after fitting. `research.py` ports the relevant parts
of `RESEARCH/preprocess.py` without its GUI, global state, calibration, 3D
pipeline, or working-directory assumptions.

Research frame endpoints are inclusive. Conversion uses
`[start_frame / fps, (end_frame + 1) / fps)` after subtracting camera switches.
One research rally may become multiple playback intervals with the same
optional score; IDs distinguish them without changing the v2 contract.
Entirely excluded candidates are dropped. Zero playable intervals fail
validation instead of generating fake data.

Inputs must use nonnegative constant-frame-rate timestamps. Missing pictures
retain their source-time holes; variable-rate/off-grid timestamps fail instead
of shifting boundaries. Color/line votes assume a green court, a fixed main
camera, and the research scoreboard crop at the top left. Court visibility
alone cannot prove shuttle play or identify replays using the original camera;
some walking/dead time or replays may remain. Treat output as candidates for
review. Evaluate boundary accuracy, missed rallies, replay inclusion, OCR, and
processing time on reviewed full broadcasts before publishing results.

## Verification

```sh
pip install .
python -m unittest discover -s tests -v
```

Tests cover contract synchronization, temporal invariants, endpoint conversion,
switch subtraction, stable IDs, score order, court fit failures/retries, source
timestamp holes, and atomic publication. Core tests need no footage or OCR
weights. The canonical contract remains `contracts/rally-manifest.schema.json`;
a synchronization test checks the worker's packaged copy against it.
