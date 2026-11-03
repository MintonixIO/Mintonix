---
title: "Why rally timestamps belong to the original video"
description: "A small data-model decision that makes rally navigation easier to correct, inspect, and play back."
date: "2026-11-03"
category: "Playback design"
---

A match viewer needs to answer a simple question: where does this rally happen in the broadcast?

Mintonix keeps the original video's timestamps as the reference. Rally detection produces intervals in that coordinate system. A player can highlight them, jump between them, or skip the gaps without inventing a second version of the source.

## One rally, two boundaries

The persisted manifest describes each rally with a start and an end:

```json
{
  "id": "rally-04",
  "game": 1,
  "startSeconds": 154,
  "endSeconds": 178,
  "scoreBefore": [2, 1]
}
```

This illustrative rally starts at 2:34 and ends at 2:58 in the original video. The interval includes its start and excludes its end: `[154, 178)`.

That convention avoids counting a shared boundary twice. It also gives the detector and player one precise interpretation of an endpoint.

## Keep the match in view

A highlighted original timeline preserves the space between rallies. You can see where a point belongs in the full match, and move to a source timestamp directly.

Rally-only playback can still skip those gaps. It is a playback policy over the intervals, rather than a reason to replace the video's timestamps.

If a future player needs an elapsed gameplay time, it can calculate the sum of earlier rally durations and add the position within the current rally. That is a derived value; the source timestamps remain the reference.

## Corrections should be inexpensive

A detected boundary might be a little early or late. Keeping intervals in a manifest lets a reviewer correct a boundary without re-encoding the whole broadcast.

Before publication, a manifest must satisfy a few constraints:

- Every interval ends after it starts.
- Intervals are chronological and do not overlap.
- No interval extends beyond the source video's duration.
- Rally IDs are unique within the match.

These rules are enforced by the web manifest parser and by the batch worker's validation. A JSON schema describes the data shape; cross-field checks enforce the temporal rules.

## Scores are useful, but optional

The example records the score **before** the rally. Score labels make useful navigation shortcuts, but they are separate from the rally's time boundaries.

An uncertain score should not make an otherwise valid rally unplayable. That is why `scoreBefore` is optional in the contract.

The result is a small, inspectable format that keeps detection, corrections, and playback aligned. The website's public generation flow is still being connected; this note describes the data model it will use.
