# Shot Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Analyze view, keep the sidebar at match level with expandable rallies, and let a shot open a looping 3D replay in place of the (hidden) YouTube embed with that shot's analysis below.

**Architecture:** Pure helpers (`shots.ts` URL/cue helpers, new `replay.ts` timing/camera maths) carry the testable logic. An imperative three.js module (`shot-scene.ts`) renders; a lazily loaded React component (`shot-stage.tsx`) drives it. `RallyPlayer` owns `deck`/`expandedRally` state and reads the open shot from the URL via `view.ts`.

**Tech Stack:** Next.js 16.4 (App Router), React 19.3, TypeScript, CSS modules, `three@0.170` (already installed; `OrbitControls` from `three/examples/jsm`), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-08-shot-replay-design.md`

All paths below are relative to `apps/web/components/rally-player/` unless they start with `apps/`, `docs/` or `AGENTS.md`.

## Global Constraints

- No new dependencies. `three` loads only via `next/dynamic({ ssr: false })` when a shot first opens.
- The YouTube player is never destroyed, re-hosted or drawn over; while a shot is open the mount is hidden with `visibility: hidden` and the 3D stage is a sibling in the same 16:9 box.
- The stage always shows the label "3D reconstruction"; guessed/unreliable shots also show `qualityNote(shot)`.
- URL: `?view=analyze&shot=<rallyId>.<n>`, n 1-based; written with `history.pushState`; switching to Watch removes `shot`.
- Video cue for a shot: `max(rallyStart(rally), shot.startSeconds − 0.4)` (existing `SHOT_LEAD_SECONDS`).
- Replay: loops over the path with a 0.6 s hold at landing; speeds exactly 0.25, 0.5, 1; presets `broadcast`, `side`, `top`, `hitter`.
- Copy: "Back to video", "Match summary", "No 3D path for this shot", "This browser can't show the 3D replay", "3D reconstruction".
- Reduced motion: replay starts paused with the full path drawn; camera presets snap.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (from repo root) before the final commit. Preserve design tokens; colours come from CSS variables.

## Review Focus

1. A shared link whose `shot` names an unknown rally, an index past the end, or a rally with no analysis → treated as no shot, video shows (Task 1 `resolveShot` test).
2. A malformed `shot` value (`r1`, `r1.0`, `r1.-1`, `r1.1.2`, `R1.1`, `r1.1x`, empty) → null, never a crash (Task 1 test).
3. A path with one sample or zero flight time → finite replay duration and time, no NaN reaching three.js (Task 2 test).
4. `hitter` preset when contact and end share x/y (vertical or degenerate flight) → finite camera, falls back to looking down the court (Task 2 test).
5. Opening a shot from a URL before the YouTube player is ready → the stage shows immediately and the video is cued once `ready` turns true (Task 6 step).

---

### Task 1: Shot URL and cue helpers

**Files:**
- Modify: `analysis/shots.ts`
- Modify: `analysis/shots.test.ts`
- Modify: `view.ts`

**Interfaces:**
- Produces (in `analysis/shots.ts`):
  - `type ShotRef = { rallyId: string; index: number }` (index 0-based)
  - `parseShotParam(value: string | null): ShotRef | null`
  - `formatShotParam(ref: ShotRef): string` → `"<rallyId>.<index+1>"`
  - `resolveShot(analysis: MatchAnalysis | undefined, ref: ShotRef | null): { ref: ShotRef; shot: Shot } | null`
  - `shotCueTime(rallyStartSeconds: number, shot: Shot): number` → `Math.max(rallyStartSeconds, shot.startSeconds - 0.4)`; export `SHOT_LEAD_SECONDS = 0.4` from here.
- Produces (in `view.ts`): `useOpenShot(): ShotRef | null` (reads `shot` via `useSearchParams` + `parseShotParam`), `setOpenShot(ref: ShotRef | null): void` (pushState, sets or deletes `shot`). `setView("watch")` also deletes `shot`.

- [ ] **Step 1: Write the failing tests** in `analysis/shots.test.ts`

```ts
test("shot params round-trip with a 1-based shot number", () => {
  assert.equal(formatShotParam({ rallyId: "r12", index: 2 }), "r12.3");
  assert.deepEqual(parseShotParam("r12.3"), { rallyId: "r12", index: 2 });
  assert.deepEqual(parseShotParam("g1_r-4.10"), { rallyId: "g1_r-4", index: 9 });
});

test("malformed shot params are ignored", () => {
  for (const value of [null, "", "r1", "r1.", "r1.0", "r1.-1", "r1.1.2", "R1.1", "r1.1x", ".1"]) {
    assert.equal(parseShotParam(value), null, String(value));
  }
});

test("a shot ref resolves only to a shot that exists", () => {
  const analysis = analysisFixture() as unknown as MatchAnalysis;
  assert.equal(resolveShot(analysis, { rallyId: "r1", index: 1 })?.shot.hitter, "b");
  assert.equal(resolveShot(analysis, { rallyId: "r1", index: 2 }), null);
  assert.equal(resolveShot(analysis, { rallyId: "r2", index: 0 }), null);
  assert.equal(resolveShot(analysis, { rallyId: "nope", index: 0 }), null);
  assert.equal(resolveShot(undefined, { rallyId: "r1", index: 0 }), null);
  assert.equal(resolveShot(analysis, null), null);
});

test("the video is cued just before contact but never before the rally", () => {
  assert.equal(shotCueTime(9, shots[0]), 9.6);    // shot starts at 10 s
  assert.equal(shotCueTime(9.8, shots[0]), 9.8);  // clamped to the rally start
});
```

(Import `analysisFixture` from `../test-fixtures.ts` and `MatchAnalysis` from `../contract.ts`.)

- [ ] **Step 2: Run** `pnpm --filter @mintonix/web test` — Expected: FAIL, the new exports are missing.

- [ ] **Step 3: Implement** the four helpers in `analysis/shots.ts`. `parseShotParam` uses `/^([a-z0-9][a-z0-9_-]{0,63})\.([1-9]\d{0,3})$/` (rally id regex from `contract.ts`). Then add `useOpenShot` / `setOpenShot` to `view.ts` following `useView` / `setView`, and make `setView("watch")` delete `shot`.

- [ ] **Step 4: Run** `pnpm --filter @mintonix/web test` — Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat: add shot URL and cue helpers"` (with the Co-Authored-By trailer).

---

### Task 2: Replay maths

**Files:**
- Create: `analysis/replay.ts`
- Create: `analysis/replay.test.ts`

**Interfaces:**
- Consumes: `COURT`, `shuttleAt` from `analysis/shots.ts`.
- Produces:
  - `type Vec3 = [number, number, number]`
  - `type CameraPreset = "broadcast" | "side" | "top" | "hitter"`; `CAMERA_PRESETS: readonly CameraPreset[]` in that order
  - `REPLAY_HOLD_SECONDS = 0.6`; `REPLAY_SPEEDS = [0.25, 0.5, 1] as const`
  - `toScene(point: Vec3): Vec3` → `[x − COURT.width/2, z, y − COURT.netY]`
  - `flightBounds(shot: Shot): { start: number; end: number }` — first and last path sample times (end ≥ start)
  - `replayDuration(shot: Shot): number` → `(end − start) + REPLAY_HOLD_SECONDS`
  - `replayTime(shot: Shot, elapsedSeconds: number, speed: number): number` — source time; `loop = (elapsed * speed) mod replayDuration`; returns `start + min(loop, end − start)`
  - `trailIndex(shot: Shot, time: number): number` — count of path samples with `t <= time`
  - `cameraPreset(name: CameraPreset, shot: Shot): { position: Vec3; target: Vec3 }` — scene coordinates

- [ ] **Step 1: Write the failing tests** in `analysis/replay.test.ts`

```ts
const flight = shotFixture(10, 11) as unknown as Shot;          // path 10→11 s

test("court points map to y-up scene coordinates centred on the net", () => {
  assert.deepEqual(toScene([3.05, 6.7, 1.524]), [0, 1.524, 0]);
  assert.deepEqual(toScene([0, 0, 0]), [-3.05, 0, -6.7]);
});

test("the replay loops through the flight and holds at the landing", () => {
  assert.equal(replayDuration(flight), 1.6);
  assert.equal(replayTime(flight, 0, 1), 10);
  assert.equal(replayTime(flight, 0.5, 1), 10.5);
  assert.equal(replayTime(flight, 1.3, 1), 11);                 // in the hold
  assert.ok(Math.abs(replayTime(flight, 1.7, 1) - 10.1) < 1e-9); // looped
  assert.equal(replayTime(flight, 2, 0.25), 10.5);              // speed scales elapsed time
});

test("degenerate paths stay finite", () => {
  const single = { ...flight, path: [[10, 3, 2, 1]] } as Shot;
  assert.equal(replayDuration(single), 0.6);
  assert.equal(replayTime(single, 5, 1), 10);
  assert.equal(trailIndex(single, 10), 1);
});

test("the trail includes every sample up to the playhead", () => {
  assert.equal(trailIndex(flight, 9.9), 0);
  assert.equal(trailIndex(flight, 10), 1);
  assert.equal(trailIndex(flight, 10.99), 1);
  assert.equal(trailIndex(flight, 11), 2);
});

test("every camera preset is finite and aims inside the court", () => {
  const vertical = { ...flight, contact: [3, 5, 1], end: [3, 5, 0], path: [[10, 3, 5, 1], [11, 3, 5, 0]] } as Shot;
  for (const shot of [flight, vertical]) {
    for (const name of CAMERA_PRESETS) {
      const { position, target } = cameraPreset(name, shot);
      assert.ok([...position, ...target].every(Number.isFinite), name);
      assert.ok(Math.abs(target[0]) <= 3.05 + 1e-9 && Math.abs(target[2]) <= 6.7 + 1e-9 && target[1] >= 0, name);
      assert.ok(position[1] > 0, `${name} camera is above the floor`);
    }
  }
});
```

- [ ] **Step 2: Run** `pnpm --filter @mintonix/web test` — Expected: FAIL, `replay.ts` not found.

- [ ] **Step 3: Implement** `analysis/replay.ts`. Preset values (scene coordinates, court centre = origin, camera baseline at +z):
  - `broadcast`: position `[0, 7.5, 6.7 + 9]`, target `[0, 0.8, 0]`
  - `side`: position `[-11, 2.2, 0]`, target `[0, 1.5, 0]`
  - `top`: position `[0, 22, 0.01]`, target `[0, 0, 0]`
  - `hitter`: from `toScene(contact)` step 3.5 m back along the horizontal direction away from `toScene(end)`, raised to `max(contact height, 1) + 1.8`; target is `toScene(end)` with height 0.5, clamped into the court. When contact and end share x/z (horizontal length < 0.1 m) use the court direction toward the far end for the hitter's side (`hitterEnd`). Clamp every target into `|x| ≤ 3.05`, `|z| ≤ 6.7`, `y ≥ 0`.

- [ ] **Step 4: Run** `pnpm --filter @mintonix/web test` — Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat: add shot replay timing and camera maths"`.

---

### Task 3: three.js shot scene

**Files:**
- Create: `analysis/shot-scene.ts`

**Interfaces:**
- Consumes: `COURT`, `shuttleAt` (`shots.ts`); `toScene`, `trailIndex`, `flightBounds`, `cameraPreset`, `CameraPreset`, `Vec3` (`replay.ts`).
- Produces:
  - `class WebGLUnavailableError extends Error`
  - `type SceneColours = { hitter: string; brand: string; court: string; lines: string; net: string; background: string }`
  - `createShotScene(canvas: HTMLCanvasElement, colours: SceneColours): ShotScene`
  - `interface ShotScene { setShot(shot: Shot, hitterColour: string): void; setTime(time: number): void; setCamera(preset: CameraPreset, animate: boolean): void; onChange(listener: () => void): void; render(): void; resize(): void; dispose(): void }`
    - `setTime` moves the shuttle to `shuttleAt(shot, time)` (or the last sample if past the flight) and sets the trail draw range to `trailIndex + 1` points (last point = shuttle).
    - `onChange` fires when OrbitControls or a camera ease changes the view, so the caller can render on demand.

- [ ] **Step 1: Implement** `createShotScene`:
  - `WebGLRenderer({ canvas, antialias: true, alpha: false })`; throw `WebGLUnavailableError` if construction fails or `getContext("webgl2") ?? getContext("webgl")` is null. `setPixelRatio(min(devicePixelRatio, 2))`.
  - `PerspectiveCamera(40, aspect, 0.1, 100)`; `OrbitControls` with `enableDamping`, `maxPolarAngle = Math.PI / 2 − 0.05`, `minDistance 3`, `maxDistance 40`, target from preset.
  - Court: a plane `COURT.width × COURT.length` in `court`; lines as one `LineSegments` built from the same line list as `CourtLines` in `court-drawing.tsx` (sidelines, singles lines, centre lines, baselines, long-service and short-service lines); net as a translucent plane from `netBottom` to `netTop` plus two post cylinders to `postTop`, posts at `x = ±(COURT.width/2)`.
  - Flight: `Line` from all `toScene(path)` points with one spare vertex for the live shuttle, `setDrawRange`; shuttle a small sphere (r 0.05) in `brand`; markers (small spheres) at contact (hitter colour), apex (`max z` sample), landing (`shot.end`), and the net crossing (sample pair straddling `y = netY`, interpolated) when `netClearance !== null`.
  - Ambient + one directional light; background `background`.
  - `setCamera(preset, animate)`: animate over 450 ms with ease-out by lerping position and target, firing `onChange` each frame; snap when `animate` is false.
  - `dispose`: dispose controls, every geometry/material created, renderer.

- [ ] **Step 2: Run** `pnpm --filter @mintonix/web typecheck` and `pnpm --filter @mintonix/web lint` — Expected: no errors.

- [ ] **Step 3: Commit** — `git commit -m "feat: add three.js shot scene"`.

---

### Task 4: Shot stage component

**Files:**
- Create: `analysis/shot-stage.tsx`
- Modify: `analysis/analysis.module.css` (append a `/* ---- Shot replay ---- */` block)

**Interfaces:**
- Consumes: Task 2 `replayTime`, `flightBounds`, `REPLAY_SPEEDS`, `CAMERA_PRESETS`; Task 3 `createShotScene`, `WebGLUnavailableError`; `playerTools` (`players.ts`), `qualityNote` (`shots.ts`).
- Produces: `export default function ShotStage(props: ShotStageProps)` with
  `type ShotStageProps = { match: Match; shot: Shot; index: number; count: number; onStep: (index: number) => void; onClose: () => void }`.
  Renders two parts the parent places: the canvas box (fills the 16:9 stage) and the control bar directly beneath it, both inside one root `<div className={styles.replay}>`.

- [ ] **Step 1: Implement** `ShotStage`:
  - Empty `shot.path`: render the box with "No 3D path for this shot" and the control bar with only previous/next and "Back to video"; do not create a scene.
  - Otherwise create the scene in an effect keyed on the canvas; on `WebGLUnavailableError` render "This browser can't show the 3D replay". Colours: read `--player-a` / `--player-b` (by `playerTools(match).tone(shot.hitter)`; `--text-secondary` for `none`), `--brand`, `--surface-1`, `--border-strong`, `--text-muted`, `--bg-sunken` via `getComputedStyle(document.documentElement)`.
  - State: `playing` (initially `!prefersReducedMotion`), `speed` (1), `preset` ("broadcast"), `time`. While playing, a `requestAnimationFrame` loop accumulates elapsed seconds and sets `time = replayTime(shot, elapsed, speed)`. Paused with reduced motion → `time = flightBounds(shot).end` so the full path shows. Call `scene.setTime(time); scene.render()` when `time` changes, and `scene.render()` from `onChange`.
  - `ResizeObserver` on the box → `scene.resize()`.
  - Changing `shot` calls `scene.setShot` and resets elapsed to 0.
  - Labels: badge "3D reconstruction" in the box's top-left (our own canvas, not the YouTube player); `qualityNote(shot)` beneath it when non-null.
  - Control bar: play/pause button, `<input type="range">` from `flightBounds.start` to `.end` step 0.01 (scrubbing pauses), speed segmented buttons `0.25×` `0.5×` `1×` (`aria-pressed`), preset segmented buttons Broadcast / Side / Top / Hitter (`aria-pressed`, `setCamera(name, !reducedMotion)`), previous/next shot (disabled at `0` and `count − 1`), "Back to video".
  - Keyboard on the root (`tabIndex={-1}`, focused on mount): Space toggles play, ←/→ call `onStep(index ∓ 1)` within bounds, Escape calls `onClose`.
- [ ] **Step 2: Add CSS** for `.replay`, `.replayCanvas` (absolute fill), `.replayBadge`, `.replayNote`, `.replayMessage`, `.replayControls`, `.segmented` using existing tokens (`--surface-*`, `--border`, `--radius-md`, `--text-*`); controls wrap on ≤640px.
- [ ] **Step 3: Run** `pnpm --filter @mintonix/web typecheck` and `lint` — Expected: no errors.
- [ ] **Step 4: Commit** — `git commit -m "feat: add 3D shot stage"`.

---

### Task 5: Match rail with expandable rallies

**Files:**
- Modify: `analysis/match-level.tsx` (`MatchRail`)
- Modify: `analysis/analysis-views.tsx` (extract `ShotRow` from `ShotRail`'s row)
- Modify: `analysis/analysis.module.css`

**Interfaces:**
- Produces:
  - `export function ShotRow(props: { match: Match; shot: Shot; index: number; current: boolean; live: boolean; ready: boolean; onSelect: () => void })` in `analysis-views.tsx` — the existing shot row button with its 4 columns # / player / km/h / height (drop "Over net" to fit the rail; keep the `aria-label`).
  - New `MatchRail` props:
    `{ match; analysis?; analysisError?: string; current: number; playing: boolean; ready: boolean; expanded: number | null; liveShot: number; openShot: ShotRef | null; onToggleRally: (index: number) => void; onOpenShot: (ref: ShotRef) => void; onMatchSummary: () => void; matchSummaryActive: boolean }`

- [ ] **Step 1: Implement** the rail:
  - Header row above `matchColumns`: button "Match summary" (`aria-pressed={matchSummaryActive}`).
  - Rally row button gains `aria-expanded={index === expanded}` and calls `onToggleRally(index)`; its `aria-label` ends "Show shots." / "Hide shots." instead of "Zoom in.".
  - When expanded, render beneath the row an `<ol>` of `ShotRow`s for `analysis.rallies[rally.id]?.shots` (`current` = matches `openShot`, `live` = `index === liveShot && playing && !openShot`), or a `railMessage`: "Loading shot data…" (no analysis, no error), `analysisError`, or "No shots were reconstructed for this rally.".
  - Keep the scroll-into-view effect; also run it when `expanded` changes.
- [ ] **Step 2: CSS**: indent the nested shot list (`.railShots`), adjust `.shotRow` grid to 4 columns inside the rail, style the header button like `.viewSwitch` buttons.
- [ ] **Step 3: Run** `pnpm --filter @mintonix/web typecheck` — Expected: errors only at the `MatchRail` call site in `rally-player.tsx` (fixed in Task 6). Do not commit yet; Task 6 commits both.

---

### Task 6: Wire the viewer and remove the zoom levels

**Files:**
- Modify: `rally-player.tsx`
- Modify: `rally-player.module.css`
- Modify: `analysis/analysis-views.tsx` (`AnalysisDeck`; delete `ZoomTrail`, `ShotRail`)
- Modify: `analysis/summary.ts` (delete `Zoom`, `ZOOMS`)
- Modify: `analysis/rally-level.tsx` (remove the "Pick a shot to zoom in." hint or reword to "Pick a shot in the sidebar to replay it in 3D.")
- Modify: `analysis/analysis.module.css` (delete `.zoomTrail*`, `.railHeader`, `.rallyNav`, `.navButton`, `.rallyFacts`, `.shotColumns` if unused)

**Interfaces:**
- Consumes: Task 1 (`useOpenShot`, `setOpenShot`, `resolveShot`, `shotCueTime`), Task 4 (`ShotStage` default export), Task 5 (`MatchRail`, `ShotRow`).
- Produces: `AnalysisDeck` props become `{ deck: "match" | "rally"; openShot: { shot: Shot; index: number } | null; match; analysis?; rally; rallyIndex; shots; activeIndex; time; onSelectRally: (index: number) => void; onSelectShot: (index: number) => void }`. With `openShot` it renders `ShotDetail` (its `onStep` opens neighbouring shots) and `ShotComparison` only; else deck `"rally"` → `CourtDrawing` + `RallySummary`; else `MatchOverview`. The deck notice stays.

- [ ] **Step 1: Implement in `RallyPlayer`**:
  - Remove `zoom`, `zoomToRally`, `zoomToShot`, `ZoomTrail`, `ShotRail`. Add `deck` (`"match"`) and `expanded` (`number | null`) state. `const openRef = useOpenShot(); const open = analyzing ? resolveShot(analysis, openRef) : null; const openRallyIndex = open ? rallies.findIndex((r) => r.id === open.ref.rallyId) : -1`.
  - `openShot(ref)`: pause the player, `seek(shotCueTime(rallyStart(rally), shot))`, `setExpanded(rallyIndex)`, `setDeck("rally")`, `setOpenShot(ref)`.
  - `toggleRally(index)`: if `index === expanded` → `setExpanded(null)` and, if a shot is open, `setOpenShot(null)`; else `setExpanded(index)`, `setDeck("rally")`, `setOpenShot(null)`, `selectRally(index)`.
  - `closeShot()`: `setOpenShot(null)` (video already paused and cued).
  - When `open` changes to non-null (including from a shared URL) and `ready`, cue the video once: effect keyed on `[open?.ref.rallyId, open?.ref.index, ready]` that pauses and seeks to `shotCueTime`. Also sync `expanded`/`deck` to the open shot's rally in that effect.
  - Deck rally: while a shot is open, `focusIndex = openRallyIndex`; otherwise current behaviour, but when `expanded !== null` and not playing, show the expanded rally.
  - Stage: give the mount `data-hidden={open ? true : undefined}`; when `open` render `<ShotStage match shot={open.shot} index={open.ref.index} count={shots-in-rally} onStep={(i) => openShot({ rallyId, index: i })} onClose={closeShot} />` loaded with `const ShotStage = dynamic(() => import("./analysis/shot-stage"), { ssr: false, loading: () => <div className={styles.stageLoading}>Loading 3D replay…</div> })`. When `analyzing && openRef && !analysis && !analysisError`, show the loading placeholder in the stage instead.
  - Sidebar in analyze: only `MatchRail` with the Task 5 props (`liveShot = activeShot` for the focus rally).
- [ ] **Step 2: CSS**: `.embed[data-hidden] { visibility: hidden; }`, `.stageLoading` (centred, `--text-secondary`). The replay control bar sits below `.stage` inside `.workspace`'s first column — wrap stage + bar in a `.stageColumn` grid cell so the sidebar's height still follows the stage (`.rallyPanel` uses `contain: size`).
- [ ] **Step 3: Run** `pnpm --filter @mintonix/web typecheck`, `lint`, `test` — Expected: all pass; `grep -rn "Zoom\b\|ZoomTrail\|ShotRail" apps/web/components` returns nothing.
- [ ] **Step 4: Commit** — `git commit -m "feat: replay shots in 3D from the match rail"`.

---

### Task 7: Docs and end-to-end verification

**Files:**
- Modify: `AGENTS.md` (Product scope)
- Modify: `docs/product-experiences.md`

- [ ] **Step 1: Update docs.** AGENTS.md product scope: replace "an Analyze view beside the same video shows the Engine's per-shot measurements…" with a sentence saying the Analyze view lists rallies with expandable shots beside the video, and opening a shot replaces the embed with a 3D reconstruction of its measured flight, with that shot's measurements below. Mirror it in `docs/product-experiences.md` where the Analyze view is described.
- [ ] **Step 2: Run from repo root** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — Expected: all succeed.
- [ ] **Step 3: Run the app** (`pnpm --filter @mintonix/web dev`) and, on a match with `analysis.json`, check: rally expand/collapse; opening a shot hides the embed and shows the replay; presets, orbit, scrub, speed, prev/next, Space/←/→/Escape; "Back to video" shows the paused embed at the shot; browser Back closes the shot; reload with `?view=analyze&shot=<id>.<n>` opens it; a bad `shot` value shows the video; a shot with empty path shows the message; fullscreen shows the embed; "Match summary" restores the overview; ≤800px layout.
- [ ] **Step 4: Commit** — `git commit -m "docs: describe the 3D shot replay"`.
