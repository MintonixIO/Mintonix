# Rally manifest v2

`rally-manifest.schema.json` is the persisted data contract for the viewer and Python detector. Synthetic data for timeline and validation tests lives directly in `apps/web/components/rally-player/timeline.test.ts`.

## Source video

`source` names the published video that every timestamp refers to. Mintonix plays matches by embedding that video and never re-hosts broadcast media. The only provider is `youtube`: `videoId` is the 11-character YouTube ID, and `durationSeconds` is the full length of that video.

The detector analyses a local copy of the same video. That copy must be the complete upload, not a trimmed or concatenated cut, so its timeline is the same as the embed's.

## Timestamps

All timestamps use seconds in the **source video**, including fractional seconds. Intervals are half-open: `startSeconds` is included; `endSeconds` is excluded. Rally IDs are stable within a match. `scoreBefore`, when present, is the two players' score before that rally, in `players` order. Game numbers start at 1.

Beyond JSON Schema validation, consumers must check:

- End is strictly greater than start, and end does not exceed `source.durationSeconds`.
- Rallies are chronological, non-overlapping, and have unique IDs.
- Game numbers do not move backward.
- Timestamps and duration are finite numbers.

JSON Schema cannot express those cross-field constraints by itself. The web parser and worker enforce them before accepting or publishing a manifest. The worker packages a copy of the schema and checks it against this canonical file in its tests.

Do not treat missing score labels as missing rallies.

## Changes from v1

v1 had a top-level `sourceDurationSeconds` and assumed a locally hosted video file. v2 replaces it with `source` (`provider`, `videoId`, `durationSeconds`). v1 manifests are rejected; regenerate them with the source video ID.
