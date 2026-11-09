# Shot replay in Analyze view — design

Date: 2026-11-08
Status: approved, awaiting implementation plan

## Goal

In the watch page's Analyze view, let a viewer open any measured shot and see it
replayed in 3D, from its reconstructed flight path, in place of the broadcast
video, with that shot's analysis beneath. The sidebar stays at match level so the
whole match is always one click away.

## Decisions

| Question | Decision |
| --- | --- |
| Where shots are picked | Rally rows in the sidebar's match rail expand in place to list their shots. |
| Video while a shot is open | Paused, seeked to the shot (contact − 0.4 s), kept mounted but hidden. "Back to video" (or clicking the expanded rally row) shows it again, cued at that shot. |
| Below the stage with no shot open | Rally court drawing + summary after a rally is clicked; the match overview by default and via a "Match summary" button. Playback alone never changes it. |
| Replay interactivity | Looping flight with a growing trail; drag to orbit; camera presets (broadcast, side, top, hitter); play/pause, scrub, 0.25×/0.5×/1× speed, previous/next shot. |
| 3D technology | Plain `three` (already a dependency) with its bundled `OrbitControls`; no new dependencies. Loaded lazily. |

Out of scope: Watch view and fullscreen behaviour (unchanged; Analyze stays
disabled in fullscreen), multi-shot or whole-rally 3D replay, player figures,
shot types.

## Constraints

- The YouTube player is never destroyed, re-hosted or drawn over. While a shot is
  open, the embed is hidden (`visibility: hidden`, keeping the iframe sized and its
  API alive) and the 3D stage takes its slot as a sibling.
- The replay is a reconstruction, not footage: the stage carries a
  "3D reconstruction" label, and guessed/unreliable shots show their quality note.
- The shot is shareable through the URL like the view itself.

## 1. Layout and components

### Sidebar (Analyze view)

- Always `MatchRail`. `ZoomTrail`, `ShotRail` and the `zoom` state are removed.
- Clicking a collapsed rally row: expands it (one at a time), seeks the video to the
  rally's start, closes any open shot, and sets the deck to that rally.
- An expanded row lists the rally's shots in compact `ShotRow`s (#, player, km/h,
  height), extracted from today's `ShotRail` rows. The shot under the playhead shows
  the live dot; the open shot is highlighted (`aria-current`).
- Clicking a shot opens it (section 2).
- Clicking the expanded rally row collapses it and, if a shot is open, returns to
  the video.
- Rail header: a "Match summary" button sets the deck to the match overview.
- Loading / error / "no shots reconstructed" messages appear inside the expanded row.

### Stage

- `.stage` keeps the YouTube mount. When a shot is open: the mount gets a hidden
  state and `<ShotStage>` renders beside it in the same 16:9 box.

### Below the stage

- Shot open: the replay's control bar, then `ShotDetail` and `ShotComparison`
  (no 2D court drawing).
- No shot open, deck = rally: `CourtDrawing` + `RallySummary` for the expanded/clicked
  rally, following the playhead's shot as today.
- No shot open, deck = match (default): `MatchOverview`.
- The existing automatic-data notice stays at the bottom.

## 2. State and data flow

- `deck: "match" | "rally"` and `expandedRally: number | null` live in `RallyPlayer`.
- Open shot lives in the URL: `?view=analyze&shot=<rallyId>.<n>` (n is 1-based).
  `parseShotParam(value)` → `{ rallyId, index } | null` and `formatShotParam(rallyId, index)`
  are pure helpers in `analysis/shots.ts`. `view.ts` gains `useOpenShot()` and
  `setOpenShot(shot | null)`, which `pushState` like `setView`, so browser Back closes
  the shot. Switching to Watch drops the `shot` parameter.
- Opening a shot: pause the player, seek to `max(rallyStart, startSeconds − 0.4)`,
  expand its rally, set deck = rally.
- Closing a shot: clear the parameter; the embed reappears paused at that point.
- Resolving: once analysis has loaded, an unknown rally or out-of-range index is
  treated as no shot. Before it loads, the stage shows a loading placeholder.
- The shot stage shows only when `analyzing && openShot` — fullscreen therefore shows
  the embed, and the shot returns on exiting fullscreen.
- Previous/next shot moves within the rally, updating the URL and the cued video
  position; disabled at either end.

## 3. The 3D replay

All in `components/rally-player/analysis/`.

### `replay.ts` — pure, unit tested

- `toScene([x, y, z])`: court metres (x across, y from far baseline, z up) to three.js
  y-up coordinates, centred on the net: `[x − width/2, z, y − netY]`.
- `replayDuration(shot)`: flight time (last − first path sample) plus a 0.6 s hold.
- `replayTime(shot, elapsedSeconds, speed)`: source time within the flight for a
  looping playback at `speed`, clamped to the landing during the hold.
- `trailIndex(shot, time)`: number of path samples up to `time` (the trail draws those
  plus the interpolated shuttle position from `shuttleAt`).
- `cameraPreset(name, shot)`: `{ position, target }` for
  - `broadcast` — behind and above the camera baseline, looking down the court;
  - `side` — off the left sideline at net height, looking across;
  - `top` — high above the net, looking down;
  - `hitter` — behind and above the contact point, looking toward the shot's end.

### `shot-scene.ts` — imperative three.js, no React

`createShotScene(canvas)` → `{ setShot(shot, tones), setTime(t), setCamera(preset, animate), resize(), dispose() }`.

- Scene: court surface and all lines (matching `COURT`), net mesh and posts, shuttle,
  trail (`Line` with a growing draw range), markers at contact, apex, landing and net
  crossing.
- `OrbitControls` from `three/examples/jsm/controls/OrbitControls.js`, with limits
  that keep the camera above the floor. Presets ease the camera (snap under reduced
  motion).
- Colours read from CSS tokens (`--player-a`, `--player-b`, `--brand`, surfaces) via
  `getComputedStyle`.
- Renders on demand (while playing, interacting or easing); `ResizeObserver` drives
  `resize`; `dispose` frees geometry, materials, renderer and controls.
- Throws a typed error when WebGL is unavailable.

### `shot-stage.tsx` — client component

- Loaded with `next/dynamic({ ssr: false })` from `rally-player.tsx`, so `three` is
  fetched only when a shot first opens.
- Owns the canvas, the "3D reconstruction" label, the quality note, and the control
  bar: play/pause, scrub (`input type=range`), speed (0.25×/0.5×/1×), camera presets,
  previous/next shot, "Back to video". Keyboard: Space toggles play, ←/→ step shots.
- Drives the animation from `requestAnimationFrame`, using `replayTime`.
- Reduced motion: starts paused with the full path drawn.

## 4. Error handling

- Empty `path`: "No 3D path for this shot" in the stage, `three` not loaded; analysis
  below still shows.
- WebGL unavailable: "This browser can't show the 3D replay" in the stage.
- Analysis fetch failure: existing error, shown in the expanded rally row.

## 5. Testing and verification

- `replay.test.ts`: loop timing and hold, speed scaling, trail slicing, coordinate
  mapping, every preset finite with its target inside the court bounds.
- `shots.test.ts`: `parseShotParam` / `formatShotParam` round trip and rejection of
  malformed values.
- Remove `ZoomTrail`, `ShotRail`, the `Zoom` type and their unused CSS.
- Update `AGENTS.md` product scope and `docs/product-experiences.md` to describe the
  match rail with expandable rallies and the 3D shot replay.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`; then run the app on a
  match with `analysis.json` and exercise open/close shot, presets, scrub, Back,
  fullscreen and a shot with an empty path.
