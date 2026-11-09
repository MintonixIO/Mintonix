# Match data contracts

A match is a folder `<matchId>/` with two files:

| file | schema | required |
|---|---|---|
| `match.json` | [`match.schema.json`](match.schema.json) (v3) | yes |
| `analysis.json` | [`match-analysis.schema.json`](match-analysis.schema.json) (v1) | no |

Both schemas are **generated** from `apps/web/components/rally-player/contract.ts`
(zod). Edit that file, then run `pnpm --filter @mintonix/web contracts`. A
test fails when the files here are out of date. The Mintonix Engine writes
both files with `util/export_match.py`.

## match.json

`source` names the published video that every timestamp refers to.
Mintonix embeds that video and never re-hosts broadcast media. The only
provider is `youtube`: `videoId` is the 11-character YouTube ID, and
`durationSeconds` is the full length of that upload. Timestamps from trimmed
or concatenated clips must be mapped to the full upload first.

`players` has two entries with a stable `id` and a display `name`. Scores,
servers, winners and shots refer to players by `id`, never by position.

`review` is `automatic` (engine output, not checked by hand) or `reviewed`
(rally boundaries and scores checked by hand). The viewer shows an
unreviewed notice for `automatic` matches.

Each rally is one point of play:

- `id`: stable within the match, so links survive boundary corrections. The
  engine uses game and score before, e.g. `g1-3-2`.
- `game`: 1–3.
- `segments`: the watchable `[start, end)` intervals in source seconds.
  A camera cut or replay inside a rally splits it into several segments; it
  is still one rally.
- `scoreBefore` (optional): each player's score before the rally, keyed by
  player id. Missing scores never mean missing rallies.
- `server`, `winner` (optional): player ids, when known.

Checked beyond the schema (`parseMatch`): player ids differ; rally ids are
unique; all segments across the match are chronological, non-overlapping,
non-empty and end within `durationSeconds`; game numbers never move backward;
`scoreBefore` has exactly one score per player; `server`/`winner` name a player.

## analysis.json

Shot data from the engine's 3D shuttle reconstruction. Always automatic.

- `rallies`: `{ <rallyId>: { shots: [...] } }`. A shot runs from one contact
  to the next: hitter (player id, or null for a net-cord continuation),
  start and end seconds, contact types, launch and arrival speed (m/s),
  contact and end points, apex, net clearance, launch and descent angles,
  `hitterEnd`, `placement` (end point seen with the hitter at the camera end),
  `quality` (`ok`, `guessed`, `unreliable`) with `issues`, and `path`
  (`[seconds, x, y, z]`, empty when the 3D fit failed).
- `players`: per-player summaries over `ok` shots, each distribution with its
  sample size `n`.
- `quality`: shot counts by quality.

Court coordinates are metres: x across the court (0–6.10), y from the far
baseline (0) to the baseline nearest the broadcast camera (13.40), net at
y = 6.70 with its top at 1.524 m, z up.

Checked beyond the schema (`parseAnalysis`): same `matchId` as the match;
rally and player ids exist in the match; shots are chronological and inside
their rally's span.

## Changes from v2

v2 had one entry per watchable piece (`startSeconds`/`endSeconds`), so a rally
with a camera cut appeared as several rallies, players were plain strings and
`scoreBefore` was positional. v3 groups pieces into `segments`, gives players
ids, keys scores by id, adds `server`, `winner` and `review`, and the file is
named `match.json`. v2 `manifest.json` files are ignored.
