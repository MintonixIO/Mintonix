---
title: "Finding live play inside a badminton broadcast"
description: "Why a visible court is only the beginning, and why rally detection needs reviewable candidates."
date: "2026-11-03"
category: "Detection notes"
---

A broadcast shows much more than badminton rallies. The main camera also captures players walking into position, preparing to serve, and waiting between points. Replays may show the same court again after the point has ended.

Finding a court in a frame is useful. It does not, by itself, tell us that a new live rally is happening.

## Start with the court view

Mintonix's current batch worker automatically fits court coordinates, then uses court-view intervals and scoreboard OCR to assemble rally candidates. Camera-switch intervals are subtracted before the result is written to a manifest.

This is a headless batch process: the caller supplies a local match video, runs one job, and reads the resulting JSON. Public link processing, cloud storage transfers, and job scheduling are separate pieces and are not connected to the website yet.

## Separate evidence from certainty

Different signals answer different questions:

- **Court geometry:** are we looking at the expected court from a usable view?
- **Camera changes:** has the broadcast cut away from the main view?
- **Scoreboard changes:** is there evidence that the match has advanced to another point?

Those signals can narrow the search. They do not prove that every remaining frame contains live play.

The current research assumptions include a green court, a fixed main camera, and a scoreboard crop at the top left. Broadcasts that do not fit those assumptions need separate evaluation.

## Replays are a separate problem

A slow-motion replay can resemble the original camera view. Court visibility alone cannot reliably distinguish the replay from live gameplay, and some between-point time may remain inside candidate intervals.

The replay-filtering experience described on the homepage is a design goal, not a claim that the current worker removes every replay. Output should be treated as candidates for review until it has been evaluated on full broadcasts.

## Review the boundaries, not just the count

A detector can return a plausible number of rallies while still cutting off serves, missing the end of a point, or keeping a replay.

Evaluation needs to examine:

1. Whether the start includes the beginning of the live exchange.
2. Whether the end preserves the full point.
3. Whether genuine rallies were missed.
4. Whether replays or dead time were included.

Processing time matters too, but it does not replace those checks. We are not publishing accuracy or speed claims without a reviewed evaluation set.

## Make the output inspectable

The worker emits original-video timestamps in the same manifest format the player reads. That makes it possible to inspect a candidate in its broadcast context and correct its boundaries.

For the timestamp convention and the reasons behind it, see [Why rally timestamps belong to the original video](/blog/original-video-timestamps).
