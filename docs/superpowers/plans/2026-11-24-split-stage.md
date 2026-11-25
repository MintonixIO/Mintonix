# Split Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The watch page shows the video and the live court side by side, with one control bar under both, a minimizable court, and the same split in fullscreen.

**Architecture:** `RallyPlayer` keeps all playback state. Its layout becomes a stage grid (video column + side column) followed by a new `ControlBar`. The side column holds the live court, the minimized court rail, or the Analyze rail. The rally list becomes a drawer anchored over the side column. The strip's maths is a pure module with tests.

**Tech Stack:** Next.js 16.4 (App Router), React, CSS modules, three.js (live court, unchanged), node:test.

**Spec:** `docs/superpowers/specs/2026-11-24-split-stage-design.md`

## Global Constraints

- Nothing drawn over the YouTube embed at any size, including in fullscreen: no dock, no floating panel, no drawer over the video column.
- The estimate caption is always shown when the court is: "3D estimate from the broadcast, not checked by hand. Distance run this rally; stroke types are a model’s inference."
- Matches without `poses` load no three.js and show no court, rail or Court toggle.
- Design tokens only (`styles/tokens/*.css`); 40 px control targets.
- `localStorage` access wrapped in try/catch; minimized is never the default.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Review Focus

- Rally with no `scoreBefore` (the tooltip and position read "No score", not "undefined–undefined"). Test in Task 1.
- Very short rallies (≤ 1 s) and one 40 s rally: every segment gets the minimum weight, so short ones stay clickable. Test in Task 1.
- Playhead between rallies or before the first: progress is 0 or 1, never NaN or out of range; the position reads "–". Test in Task 1.
- A match whose rallies all lack `winner`: the tooltip omits "point to …". Test in Task 1.
- The drawer opened while the court is minimized must still not cover the video (the side column widens for it). Checked in the browser in Task 4.

---

### Task 1: Rally strip model

**Files:**
- Create: `components/rally-player/rally-strip.ts`
- Test: `components/rally-player/rally-strip.test.ts`

**Interfaces:**
- Produces:
  - `type StripItem = { kind: "rally"; index: number; weight: number } | { kind: "missing"; count: number }`
  - `type StripGame = { game: number; items: StripItem[]; weight: number }` (weight = sum of its rally weights)
  - `rallyStrip(rallies: readonly Rally[], missingBefore: readonly number[], minSeconds = 4): StripGame[]` — groups by consecutive `game`; a `missing` item precedes a rally when `missingBefore[i] > 0`; `weight = max(rallySeconds, minSeconds)`.
  - `rallyProgress(rally: Rally, time: number): number` — 0 before the rally starts, 1 at or after its end, otherwise the elapsed share of its span (first start to last end).
  - `rallyScore(match: Match, index: number): string` — "6–3" in `match.players` order, or "No score".
  - `rallyTip(match: Match, index: number): string` — `G${game} · ${score} · ${round(rallySeconds)} s` plus ` · point to ${shortName(winner)}` when `winner` is set.

- [ ] **Step 1: Write failing tests** with `matchFixture()` parsed by `parseMatch`: the groups (`[{game:1, items:[r0 weight 12, r1 weight 17]}, {game:2, items:[r2 weight 9]}]`); the minimum weight (a 1 s rally gets 4); a `missing` item when `missingBefore` is `[0,2,0]`; progress for r1 (span 34–48) at 30 → 0, 41 → 0.5, 48 → 1, 200 → 1; `rallyScore(match, 0) === "0–0"`, `rallyScore(match, 2) === "No score"`; `rallyTip(match, 0) === "G1 · 0–0 · 12 s · point to B"`, `rallyTip(match, 1)` has no "point to".
- [ ] **Step 2:** Add `components/rally-player/rally-strip.test.ts` (it's already matched by the `test` glob). Run `pnpm test`; expect FAIL (module missing).
- [ ] **Step 3:** Implement the module.
- [ ] **Step 4:** Run `pnpm test`; expect PASS.
- [ ] **Step 5:** Commit `feat: adds the rally strip model`.

### Task 2: Control bar

**Files:**
- Create: `components/rally-player/control-bar.tsx`, `components/rally-player/control-bar.module.css`
- Move: the `Icon` component and `iconPaths` from `rally-player.tsx` into `components/rally-player/icons.tsx` (add `court`, `chevronLeft`, `chevronRight` paths) so both files use it.

**Interfaces:**
- Consumes: Task 1's `rallyStrip`, `rallyProgress`, `rallyScore`, `rallyTip`.
- Produces: `ControlBar(props: { match: Match; missingBefore: number[]; selectedIndex: number; time: number; ready: boolean; playing: boolean; muted: boolean; skipGaps: boolean; canPrevious: boolean; canNext: boolean; isFullscreen: boolean; court: "shown" | "minimized" | null; listOpen: boolean | null; listId: string; onPlay(): void; onPrevious(): void; onNext(): void; onSelectRally(index: number): void; onMute(): void; onSkipGaps(on: boolean): void; onCourt(): void; onList(): void; onFullscreen(): void; listButtonRef: Ref<HTMLButtonElement> })`. `court: null` hides the Court toggle; `listOpen: null` hides Rallies (Analyze).

- [ ] **Step 1:** Build the bar, left to right: play, previous, next, the position ("Rally 12 / 72", then `G1 · 6–3`, or "–" between rallies), the strip, Skip gaps (the existing switch markup and styles move here), mute, Court (`aria-pressed`), Rallies (`aria-expanded`, `aria-controls`), fullscreen. All are disabled until `ready`, as today.
- [ ] **Step 2:** The strip is a `role="group"` with `aria-label="Rallies by game"`. Each game is a flex row weighted by `weight`, labelled `G1`/`G2`. Each rally is a `<button>` with `flex: weight 1 0`, `min-width: 4px`, `aria-label={rallyTip}` and `title={rallyTip}`, plus `aria-current` on the current one. The current rally shows a fill at `rallyProgress × 100%` and a tooltip. Make it one tab stop (roving `tabIndex`: the current rally, else the first). ←/→ move focus to the neighbouring rally, Home/End jump to the first/last, Enter or a click calls `onSelectRally`. A missing item is a dashed 6 px break with `title` "N points not captured".
- [ ] **Step 3:** On phones (≤ 640 px), the bar wraps to two rows (buttons, then the strip). The strip scrolls horizontally with a 6 px minimum segment width and keeps the current rally in view.
- [ ] **Step 4:** Run `pnpm lint && pnpm typecheck`; expect a clean run.
- [ ] **Step 5:** Commit `feat: adds the control bar` (folded into Task 3's commit if the bar has no consumer yet).

### Task 3: Split-stage layout, drawer, minimize, fullscreen

**Files:**
- Modify: `components/rally-player/rally-player.tsx`, `components/rally-player/rally-player.module.css`
- Modify: `components/rally-player/live-court/live-court.tsx`, `live-court.module.css` (fills its column; accepts `caption={false}`)

**Interfaces:**
- Consumes: Task 2's `ControlBar`.
- Produces: none for later tasks.

- [ ] **Step 1: Layout.** `.workspace` becomes `.stageGrid` with `grid-template-columns: minmax(0, 62fr) minmax(0, 38fr)`. When there's no side column (no skeletons, Watch view), use `1fr`. When minimized, use `minmax(0,1fr) 48px`. The video column keeps 16:9 and `max-height: calc(100svh - <chrome>)`; the side column stretches to its height. Under the grid: `ControlBar`, then `.deckArea` (Analyze), then the notices. The live-court caption joins the notices.
- [ ] **Step 2: Side column.** In Watch with `match.poses`, show `<LiveCourt>`, or when minimized, the rail: a ‹ button ("Show the 3D court"), a vertical "3D court" label, and both distances. To make the distances available, lift a `onDistances?(d: { id: string; metres: number | null }[])` callback out of LiveCourt, or keep LiveCourt mounted with the canvas hidden. **Chosen:** add a `minimized` prop to LiveCourt, which then renders the rail itself and skips the canvas and scene. The skeleton loading and distance maths stay in one place. Add a › minimize button at the top-right of the court stage. In Analyze, show `MatchRail` as today.
- [ ] **Step 3: Minimized state.** `const [courtMinimized, setCourtMinimized]` is initialised to false. An effect reads `localStorage["mintonix.courtMinimized"] === "1"` after mount, and toggling writes it back; both are in try/catch.
- [ ] **Step 4: Rally drawer.** Today's watch list (the game sections and rows, without the header's play, mute, fullscreen and skip-gaps controls) becomes `<aside role="dialog" aria-labelledby=… id={panelId}>`. It sits absolutely over the side column: `top:0; right:0; bottom:0; width: 38%` on desktop, inside `.stageGrid`. While it's open and the court is minimized, the grid uses the 62/38 columns. Esc or the close button closes it and returns focus to the Rallies button. Picking a row plays that rally and keeps the drawer open. On phones (≤ 800 px) the drawer drops below the bar in flow, `max-height: 460px`. Remove `.rallyDock`, `.panelHeader` controls, and the fullscreen-floating `.rallyPanel` rules.
- [ ] **Step 5: Fullscreen.** `.viewer[data-fullscreen]` is a flex column: the grid (`flex: 1`), then the bar. Inside fullscreen, the grid's video column is `min(70%, (100vh − bar) × 16/9)` wide (`grid-template-columns: minmax(0, min(70%, calc((100dvh - 57px) * 16 / 9))) minmax(0, 1fr)`), and the court is shown (drop the `!isFullscreen` from `liveCourt`). `analyzing` keeps `!isFullscreen`, so fullscreen always shows Watch. Without skeletons, the video fills the grid. Keep the immersive rotation rules.
- [ ] **Step 6:** Keep `revealStage`, search, shot replay (`.stageColumn[data-replay]` hides the stage; the replay takes the video column) and list auto-scroll working; the auto-scroll effect now runs when the drawer opens.
- [ ] **Step 7:** Run `pnpm lint && pnpm typecheck && pnpm test`; expect all to pass.
- [ ] **Step 8:** Commit `feat: puts the live court beside the video with one control bar`.

### Task 4: Compact header and verification

**Files:**
- Modify: `app/watch/[matchId]/page.tsx`, `app/watch/[matchId]/watch.module.css`

- [ ] **Step 1:** Put the header on one line: the event (`.event`), then the scoreboard table as an inline row per player (keep the `<table>` semantics; render the two rows side by side with `display:flex` on `tbody`), then the summary and the YouTube link. Phones keep two lines.
- [ ] **Step 2:** Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`; expect all to pass.
- [ ] **Step 3:** Take headless Chrome screenshots (swiftshader WebGL) of `/watch/all-england-open-2025-ms-f` at 1440×900, 1280×720 and 390×844, of `?view=analyze`, and of a match without rally files if one exists. Check that the stage plus the bar fit at 1280×720 and that nothing overlaps the iframe. For the drawer and minimized states, set `localStorage` / click through the Chrome DevTools protocol (headless `--remote-debugging-port`) rather than changing code.
- [ ] **Step 4:** Commit `feat: compacts the watch header so the stage fits a laptop screen`.
