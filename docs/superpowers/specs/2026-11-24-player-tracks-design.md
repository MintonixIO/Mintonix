# Live court: per-rally match data with player skeletons

Date: 2026-11-24 · Status: implemented (see Changes during implementation)

## Intent

The next feature is a live 3D mini-map beside the YouTube embed: the court from a low
corner on the camera side, the shuttle on its measured path and both players moving,
in sync with playback, plus how far each player ran in the rally. The app has the
shuttle but nothing about the players. The Engine already reconstructs both players'
full 3D skeletons every frame; it never exports them.

This change exports those skeletons at the video's frame rate, reorganises each
published match into one match file plus one file per rally (so the heavy data that
plays with the video loads one rally at a time), and adds the live court to the Watch view.

## Goals

- Every rally's player skeletons (17 joints, court metres) for every watchable video frame.
- Each player's running distance per rally, computed once in the Engine.
- A file layout where the match loads once and each rally's motion loads on demand.
- All 13 published matches republished in the new layout with nothing else changed.
- A live 3D court at the top of the Watch sidebar that plays each rally in sync with the video.

## Non-goals

- The live court in the Analyze view or in fullscreen.
- Changing how the Engine tracks players or lifts poses.
- Player heights for the published matches (they keep the Engine's default prior).

## Anti-goals

- Skeletons presented as measured or hand-checked: they are a model's estimate from one
  broadcast camera, scaled to a default 1.6 m player height.
- Motion drawn across gaps (close-ups, camera cuts, lost tracks), or outside the rally's
  watchable segments.
- Distance inflated by frame-to-frame jitter.
- A republish that silently changes rallies, scores or shots.
- Anything analysis-only (shots, summaries) made required for a match to play.

## What exists

- Engine `pose_3d.npz`: `<p>_frames`, `<p>_poses_3d` (T, 17, 3) H36M joints, court axes,
  z up, **centred on the hips**. `eval/viewer.py` places them on court with
  `pose_on_court(pose, positions record, ankle_height)` from `positions.json` (ankle
  court positions per frame, `close_up`/`interpolated`/`airborne` flags, jump height).
  `pose_3d_quality.json` records each player's scale and `height_source`
  (`default_prior`, 1.6 m, for the published matches).
- Engine `util/export_match.py` writes `match.json` + `analysis.json`.
- App: `contract.ts` (zod) → `contracts/*.schema.json` via `pnpm contracts`;
  `local-match.ts` reads the files; `/api/matches/[id]/analysis` serves the analysis to the
  Analyze view; the shot explorer, the Analyze rail and the search index read every
  rally's shots; only the 3D shot replay reads `shot.path`.
- Indonesia final: `analysis.json` 700 KB, of which shot paths 232 KB; skeletons would be
  9.4 MB as integer centimetres (2.8 MB gzipped), ≈ 36 KB gzipped per rally.

## Approaches considered

- **A. Match file + one file per rally, JSON, integer centimetres — chosen (user).**
  Rally files load as the rally plays; each stays small; one zod contract per file.
- B. One skeleton file per match: 2.8 MB gzipped before anything can show.
- C. Compact binary per rally: about half A's gzipped size, but outside the zod
  contracts and needing its own decoder; not worth it at these sizes.
- Skeletons inside `analysis.json` were ruled out: 13× its size, loaded by every Analyze visit.

## Layout (user)

```
content/matches/<matchId>/
  metadata.json        the match: loaded once
  <rallyId>.json       one per rally with analysis: loaded while it plays
```

`match.json` and `analysis.json` are removed. Rally ids may not be `metadata`.

## metadata.json

Everything about the match, including every shot's measurements — the explorer, rail
and search need all of them — but no per-frame data.

```
version, matchId, title, players, review
source { provider, videoId, durationSeconds, fps }
rallies: [{
  id, game, segments, scoreBefore?, server?, winner?,
  summary? { shots, unreliable, byPlayer, fastest, highest },
  shots?: [{ hitter, startSeconds, endSeconds, startContact, endContact, speed,
             arrivalSpeed, contact, end, apex, netClearance, launchAngle,
             descentAngle, hitterEnd, placement, quality, issues, shotType? }]
}]
analysis? { quality, games, players, shotTypes?, patterns? }
poses? { model: "MotionBERT", players: { <id>: { heightMetres, heightSource } } }
```

- `shots` are today's shots, with their `path`. A match without analysis has no `shots`,
  `summary` or `analysis`; a match without skeletons has no `poses` and no rally files.
- `poses` describes the skeleton model once, so the UI can caveat it without loading a rally.
- **No running distance here** (user).

## <rallyId>.json

The rally's motion, in sync with the video.

```
version, matchId, rallyId, fps
poses: { <playerId>: [{ startFrame, frames, root: [ints], joints: [ints] }, …] }
                                              runs of `frames` consecutive frames, encoded below
distance: { <playerId>: metres }              horizontal distance along the player's tracked runs
```

- Frame `startFrame + i` is at `(startFrame + i) / fps` source-video seconds.
- Pose encoding (integer centimetres, court axes, z up):
  - `root`: the hip joint's court position, `frames × 3` values, flat.
  - `joints`: the other 16 H36M joints relative to the hip, `frames × 16 × 3` values, flat.
  - Both are stored as frame-to-frame differences within the run (the first frame as
    is); a reader recovers positions with a running sum, exactly, since they are integers.
  - Measured on the Indonesia final: 1.45 MB gzipped per match, against 4.04 MB for
    absolute per-frame joint arrays — as small as a binary encoding after compression,
    while staying JSON under a zod schema. 1 cm stays: joints move a median 1.8 cm per
    frame, so 2 cm steps would show.
- A new run starts after any gap; nothing is drawn across runs.

Cross-file rules (checked when a rally file is parsed with its metadata): `matchId`
matches; `rallyId` is a rally in metadata; `fps` equals `source.fps`; pose and distance player ids are match players; runs are
chronological, non-overlapping and inside the rally's segments; `root` has `frames × 3`
values and `joints` `frames × 48`.

## Engine change (`util/export_match.py`, helpers under `src/analytics/`)

1. Write `metadata.json` from what `match.json` + `analysis.json` hold today, plus `source.fps` and the `poses` descriptor from `pose_3d_quality.json`.
2. When `pose_3d.npz` exists, write one `<rallyId>.json` per published rally with its
   skeletons and distance.
3. Skeletons: for each player frame inside the rally's watchable pieces
   (`src.common.watchable`) and not `close_up`, place the pose with `pose_on_court`
   exactly as `eval/viewer.py` does; split into runs at missing frames; drop runs under 2
   frames; round to integer centimetres; encode as above. Output is deterministic
   (fixed key order and rounding), so a republish that doesn't change a rally writes a
   byte-identical file and adds nothing to Git.
4. Distance: from the ankle midpoint (`positions.json`) on the same frames, smoothed
   (centred filter over a few tenths of a second; the builder picks and tests it),
   summing horizontal step lengths within runs.
5. Map `p0`/`p1` to player ids as shots' `hitter` already is.

Tests (Engine): one frame per source frame inside segments; close-up and
out-of-segment frames excluded; gaps split runs and add no distance; jitter around a
fixed point gives near-zero distance; a straight walk gives its length; joints match
`pose_on_court`; no `pose_3d.npz` → no rally files; no analytics → metadata without shots.

## App change

- `contract.ts`: `metadataSchema` and `rallySchema` (file) replace `matchSchema` and
  `analysisSchema`; `pnpm contracts` writes `contracts/metadata.schema.json` and
  `contracts/rally.schema.json`; parse functions keep the existing cross-field rules and
  add the ones above. Contract versions start at 1 for both files.
- Loading: `local-match.ts` reads `metadata.json`; a route serves `<rallyId>.json`. The explorer, rail, summaries and
  search read shots from metadata. How the shot data reaches the browser is the
  builder's call, provided the Watch view's first load doesn't grow noticeably for a
  viewer who never opens Analyze.
- Fixtures in `test-fixtures.ts` move to the new shapes; tests for the new rules.
- `AGENTS.md`: the published-match exception and the `contracts/` description name
  `metadata.json` and `<rallyId>.json`.

## Republish

Re-export all 13 published matches (`content/matches/*`: the Denmark Open semifinal and
the twelve BFMD 2025 men's singles matches) from Engine `master` (780a214, the same
`src`/`util` as `1bf5702`, which the BFMD matches were exported from), with the
arguments they were published with. Every Engine output (`dataset/output/<stem>/`) has
`pose_3d.npz` and `positions.json`.
Check with a script that `metadata.json` equals the old `match.json` + `analysis.json`
(plus the new fields); if anything else differs, stop and report it. Git stores files zlib-compressed,
so the repository grows by about the gzipped size: ≈ 1.5 MB per match, ≈ 20 MB for all
13. A later republish adds only the rally files whose content changed.

Serving: rally files are immutable per deploy and large in total, so they are served as
static files (not read by a server function, which would bundle ~120 MB into it). The
mechanism is the builder's call; check the installed Next.js docs.

Verification: Engine tests; `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`;
the Watch and Analyze views and the 3D shot replay still work on all 13 matches; the
live court plays in sync, and drags, on desktop and phone width.

## Live court (UI)

Decided by the user: it sits at the **top of the Watch sidebar, above the rally list**
(320 px wide); it shows **both skeletons and the shuttle, with a tag at each hit**.

```
┌──────── sidebar ────────┐
│   ╱‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾╲     │  3D court, low corner on the camera side
│  ╱  o    ┃     o   ╲    │  skeletons in player colours (--player-a/-b)
│ ╱  /|\ ──┃─ ⌒  /|\  ╲   │  shuttle + short trail in the hitter's colour
│╱___/_\___┃_____/_\___╲  │  [SMASH · 312 km/h] tag at the hitter on contact
│ ● A 18.4 m   B 22.1 m ● │  live running distance
├─────────────────────────┤
│ Rallies …               │  existing list, unchanged
└─────────────────────────┘
```

- **Sync:** driven by the player's current time (the same `sourceTime` the rally list
  uses); skeleton frames are picked by `floor(time × fps)`, the shuttle by its path's
  timestamps. Paused video → paused court.
- **Shot tag:** at each racket contact, a tag at the hitter: stroke type and speed
  (e.g. "SMASH · 312 km/h"); a low-confidence type shows as "lift?"; a shot without a
  type or with `quality: "unreliable"` shows no number. The tag fades before the next hit.
- **Distance:** each player's distance grows live as the rally plays — the share of the
  rally file's `distance` covered up to the current frame (cumulative along the runs),
  reaching the full figure at the rally's end.
- **Gaps:** during a gap in a player's runs, that skeleton is hidden, not frozen or
  interpolated across.
- **Between rallies:** holds the last frame of the rally that just ended; before the
  first rally, the empty court.
- **Loading:** fetches the current rally's file, and prefetches the next one; while a
  file loads, the empty court with a quiet loading state.
- **Camera (user: draggable):** starts low at a corner on the broadcast camera's side.
  Dragging orbits around the court centre (three.js `OrbitControls`, as the shot
  replay uses), clamped so the camera stays above the floor; pinch zooms on touch,
  within limits; the mouse wheel does not zoom, so scrolling the page and rally list
  isn't hijacked. The view the viewer chose persists across rallies and seeks; a small
  "Reset view" button appears once it has moved and returns to the corner. Arrow keys
  orbit when the court has focus (reuse the replay's key handling where it fits).
  Dragging never pauses or seeks the video.
- **Where it shows:** Watch view only, only for matches with rally files; matches
  without them look as they do today. On phones it lands directly under the video
  (the sidebar already stacks there). Hidden in fullscreen (the sidebar floats over the
  picture there, and nothing may be drawn over the embed).
- **Labelled as estimates:** a one-line caption under the court, e.g. "3D estimate from
  the broadcast; not checked by hand", with stroke types marked as model inferences,
  per `AGENTS.md`.
- **Rendering:** reuses the three.js setup of the shot replay (`analysis/shot-scene.ts`:
  court, net, colours, WebGL fallback), loaded only when the court first shows; renders
  only while playing or seeking. Without WebGL, the court is replaced by the distance line.
- **Accessibility / motion:** the canvas is focusable for the arrow-key orbit, labelled
  "3D court, drag to rotate", otherwise not read out;
  with the distances and the current shot tag in a polite live region at most once per
  shot; `prefers-reduced-motion` drops the shuttle trail and tag animation.

## Calls Claude made (check these)

- `metadata.json` merges `match.json` and `analysis.json` (the alternative, keeping the
  analysis apart, was offered and not chosen).
- Running distance lives in the rally file, still computed in the Engine.
- Skeletons are stored as a court-placed hip track plus hip-relative joints, delta
  encoded (the reader's running sum is the only decoding).
- A small `poses` descriptor (model, each player's height and its source) sits in metadata.
- Both contracts start at version 1.
- Live court: Watch only, hidden in fullscreen, draggable camera without wheel zoom, holds the last frame between
  rallies, skeletons hidden during gaps, distance grows live, caption marks it as an estimate.

## Left to the builder

- Distance smoothing filter and window.
- Helper module names in the Engine; the route shape for rally files.
- How the analysis part of metadata reaches the browser, within the constraint above.
- Exact camera position, tag styling and fade timing for the live court (within the design tokens).

## Changes during implementation

- **Shot paths stay in `metadata.json`.** Besides the 3D replay, the Analyze rally
  drawings (`court-drawing.tsx`) and the server-side search previews (`search/rank.ts`)
  read paths across rallies; they are ≈ 70 KB gzipped per match. Rally files hold only
  `poses` and `distance`, and exist for every published rally (players move in rallies
  without shots too).
- **Denmark Open semifinal:** the current Engine assigns two rallies' servers differently
  from the older run that published it. Its `metadata.json` was built from the published
  files, unchanged; the other 12 matches' metadata is byte-identical to a fresh export.
- **Distance smoothing:** a centred moving average over 0.3 s whose window shrinks
  symmetrically at run ends (a one-sided window shortens every run). On the Indonesia
  final it takes the near player from 2.41 m/s raw to 1.69 m/s; wider windows start
  cutting real changes of direction.
- **Serving:** `dynamicParams = false` is not allowed with `cacheComponents`; unknown
  rallies are still 404s because no function traces rally files (their reads are marked
  `turbopackIgnore`, and only metadata is included). Turbopack does not apply
  `outputFileTracingExcludes` to its own traces, so an exclude could not do this.
- **In memory** the app keeps `Match` and `MatchAnalysis`; `parseMetadata` splits the file
  into them, so the views were unchanged.
