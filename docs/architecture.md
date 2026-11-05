# Architecture and first release

## Product

Mintonix turns a BWF match broadcast into continuous rally playback. The initial scope is detecting rally intervals, excluding broadcast replays and non-playing time, and providing a custom player with a draggable timeline and score-based navigation.

The original video's timestamps remain authoritative. Do not assume the broadcast score changes at the instant a rally ends, and do not confuse a replay of an earlier rally with new gameplay.

## Components

This repository contains the Next.js app configured for deployment on Vercel, including the website, manifest reader, score list, and custom video controls. Backend implementation and deployment are maintained separately.

Local watch pages validate v2 match manifests and embed the manifest's YouTube source. The library lists configured local matches. Mintonix never re-hosts broadcast video. The match-link form validates URL syntax locally; public processing is not connected.

## Playback model

A rally is a half-open interval `[startSeconds, endSeconds)` in the original source. The gameplay timeline is the concatenation of these intervals. The visible player uses the original-video timeline with rally intervals highlighted. During playback, the default Skip gaps setting advances from each rally end to the next start and pauses after the last interval. Disable it to inspect the full source. Paused timeline scrubbing retains the chosen source timestamp. The concatenated gameplay timeline remains an internal mapping rather than a separate visible timeline.

Use the published source video plus a manifest. This supports correcting boundaries without re-encoding footage, and the embed keeps playback on the rights holder's upload. A generated gameplay-only rendition is not an option for broadcast footage we do not own; seeking pauses inside the YouTube embed are an accepted cost.

Score labels identify the score **before** the rally and are optional. Detecting rallies does not guarantee accurate score OCR. A manifest without score labels must remain playable and navigable by rally number.

## App data boundary

- Read local match manifests on the server using `MINTONIX_LOCAL_MATCHES_DIR`; do not send filesystem paths or server credentials to the client.
- Accept only manifests that satisfy the contract and temporal invariants documented in `contracts/README.md`.
- Keep match IDs and rally IDs stable so navigation remains consistent when boundaries are corrected.
- Keep media, generated manifests, model weights, and credentials outside Git.
