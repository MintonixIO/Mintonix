# Architecture and first release

## Product

Mintonix turns a BWF match broadcast into continuous rally playback. The initial scope is detecting rally intervals, excluding broadcast replays and non-playing time, and providing a custom player with a draggable timeline and score-based navigation.

The original video's timestamps remain authoritative. Do not assume the broadcast score changes at the instant a rally ends, and do not confuse a replay of an earlier rally with new gameplay.

## Components

This repository contains the Next.js app configured for deployment on Vercel, including the website, match reader, score list, and custom video controls. Backend implementation and deployment are maintained separately.

Local watch pages validate v3 match files and embed the match's YouTube source. An optional analysis file carries per-shot data for the planned analysis view. The library lists configured local matches. Mintonix never re-hosts broadcast video. The match-link form validates URL syntax locally; public processing is not connected.

## Playback model

A rally is one point of play made of one or more half-open segments `[start, end)` in the original source; a camera cut or replay inside a rally separates its segments. The gameplay timeline is the concatenation of all segments. The visible player uses the original-video timeline with rally intervals highlighted. During playback, the default Skip gaps setting advances from each segment end to the next segment start and pauses after the last one. Disable it to inspect the full source. Paused timeline scrubbing retains the chosen source timestamp. The concatenated gameplay timeline remains an internal mapping rather than a separate visible timeline.

Use the published source video plus a match file. This supports correcting boundaries without re-encoding footage, and the embed keeps playback on the rights holder's upload. A generated gameplay-only rendition is not an option for broadcast footage we do not own; seeking pauses inside the YouTube embed are an accepted cost.

Score labels identify the score **before** the rally and are optional. Detecting rallies does not guarantee accurate score OCR. A match without score labels must remain playable and navigable by rally number.

## Analyze view

`/watch/<matchId>?view=analyze` keeps the same embedded video and adds shot data
beside and below it, never over it. The view lives in the URL so links can be
shared; switching uses `history.pushState`, so the player is not remounted.
Shot data is fetched from `/api/matches/<matchId>/analysis` only when the view
opens; the Watch view never downloads it.

The side panel always lists every rally with its shot count and winner, and a
"Match summary" button. Picking a rally seeks to it and expands its shots in place;
picking it again collapses it.

- **Under the video** is the match overview by default (shots per rally coloured
  by point winner, each game's score and longest rally, each player's shot
  profile), or, after picking a rally, a court drawing of its shots from above and
  from the side with the shuttle's live position, and how the point went.
- **Opening a shot** (`?shot=<rallyId>.<n>`, n from 1, pushed to history like the
  view) pauses the video, cues it just before that shot's contact, and hides it:
  the YouTube player stays mounted, out of flow and invisible, and a 3D replay of
  the shot takes its place, so nothing is ever drawn over the embed. The replay
  is built with three.js, loaded only when a shot first opens, from the shot's
  measured `path`; it loops with a short hold at the landing and offers orbit,
  broadcast/side/top/hitter cameras, scrub, 0.25×–1× speed and previous/next
  shot. It is labelled "3D reconstruction". Under it: all the shot's measurements,
  each placed against the hitter's middle 80% for the match. "Back to video", the
  rally row, Escape or browser Back return to the paused, cued video. Shots with no
  3D path, or browsers without WebGL, get a message instead of the replay.
- Per-player summaries use reliably measured shots only and show sample sizes.
  Unreliable shots are listed without numbers; estimated contacts are marked.

Shot data is automatic and labelled as such. Shot types, sequences and
serve-and-return patterns are planned and labelled as planned.

## App data boundary

- Read local matches on the server from `MINTONIX_LOCAL_MATCHES_DIR/<matchId>/{match.json, analysis.json}`; do not send filesystem paths or server credentials to the client.
- Accept only files that satisfy the contracts and the cross-field rules documented in `contracts/README.md`.
- Keep match IDs and rally IDs stable so navigation remains consistent when boundaries are corrected.
- Keep media, generated match files, model weights, and credentials outside Git.
