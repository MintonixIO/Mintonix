# Architecture and first release

## Product

Mintonix turns a BWF match broadcast into continuous rally playback. The initial scope is detecting rally intervals, excluding broadcast replays and non-playing time, and providing a custom player with a draggable timeline and score-based navigation.

The original video's timestamps remain authoritative. Do not assume the broadcast score changes at the instant a rally ends, and do not confuse a replay of an earlier rally with new gameplay.

## Components

1. **Next.js on Vercel:** the website, manifest reader, score list, and custom video controls.
2. **Rally detection on Vast.ai:** consumes a match and returns chronological rally intervals in the source video's time coordinates.
3. **Backblaze B2:** stores the source media and published JSON manifest. Large files and model weights do not belong in Git.

The website, local video viewer, manifest contract, and single-job batch detector are implemented. Local watch pages validate detector output and serve source video with byte-range seeking; the homepage links to `dl1s0` when local matches are configured. The detector combines automatic C++ court fitting with the research court/score pipeline; its output still requires broadcast evaluation and review. Worker provisioning, cloud storage, job orchestration, and server credentials are not configured yet. Persistent job state and reliable dispatch will be needed before a public processing flow is added; B2 is object storage, not a job database.

## Playback model

A rally is a half-open interval `[startSeconds, endSeconds)` in the original source. The gameplay timeline is the concatenation of these intervals. The visible player uses the original-video timeline with rally intervals highlighted. During playback, the default Skip gaps setting advances from each rally end to the next start and pauses after the last interval. Disable it to inspect the full source. Paused timeline scrubbing retains the chosen source timestamp. The concatenated gameplay timeline remains an internal mapping rather than a separate visible timeline.

Use the original video plus a manifest first. This supports correcting boundaries without re-encoding footage. Seamless playback may later require a generated gameplay-only rendition if source seeking causes visible pauses.

Score labels identify the score **before** the rally and are optional. Detecting rallies does not guarantee accurate score OCR. A manifest without score labels must remain playable and navigable by rally number.

## Security and data

- Resolve temporary playback URLs through a server-side boundary when private B2 storage is connected. Do not persist expiring URLs in the manifest.
- Workers should receive scoped temporary input/output access, rather than account credentials.
- Use stable match and rally IDs. Define retry/idempotency behavior before scheduling GPU jobs.
- Publish only manifests validated against the contract and the temporal invariants documented in `contracts/README.md`.

## Implementation sequence

1. Connect one real match and a manually reviewed manifest.
2. Implement real media controls, automatic gap skipping, and source/gameplay timeline mapping.
3. Implement and evaluate rally detection, including replay exclusion and boundary accuracy.
4. Add B2 publishing and Vast deployment with tracked jobs and safe retries.
5. Add score recognition with correction/review support.

Do not add the old 3D pipeline, catalog scraper, mobile app, auth, or billing during the foundation work.
