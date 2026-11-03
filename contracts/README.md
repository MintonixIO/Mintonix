# Rally manifest v1

`rally-manifest.schema.json` is the persisted data contract for the viewer and Python detector. `examples/demo-match.json` is illustrative data only, with fictional players and synthetic intervals.

All timestamps use seconds in the **original video**, including fractional seconds. Intervals are half-open: `startSeconds` is included; `endSeconds` is excluded. Rally IDs are stable within a match. `scoreBefore`, when present, is the two players' score before that rally, in `players` order. Game numbers start at 1.

Beyond JSON Schema validation, consumers must check:

- End is strictly greater than start, and end does not exceed source duration.
- Rallies are chronological, non-overlapping, and have unique IDs.
- Game numbers do not move backward.
- Timestamps and duration are finite numbers.

JSON Schema cannot express those cross-field constraints by itself. The web parser and worker enforce them before accepting or publishing a manifest. The worker packages a copy of the schema and checks it against this canonical file in its tests.

Temporary media URLs and storage credentials are not part of this persisted contract. Resolve media access separately. Do not treat missing score labels as missing rallies.
