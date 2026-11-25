# Split stage: watch the match beside the live court

Date: 2026-11-24 · Status: approved (user), with the minimize option · Builds on `feat/live-court` (2026-11-24-player-tracks-design.md)

## Intent

The watch page's main job is to watch the match **with the visualization and easy control**
(user). Today, at 1440×900, the header takes ≈265 px before the video, so the video's
bottom and YouTube's own controls fall below the fold. The live court is a 295×185 px
thumbnail at the top of the 320 px sidebar, and the rally list under it shows about three
rows. Play, mute, skip gaps and fullscreen sit in the sidebar header. Previous/next rally
exists only in the fullscreen dock, and the court is hidden in fullscreen.

The redesign makes the video and the live court equal partners on one stage, with one
control bar under both. All of it fits in a laptop viewport without scrolling.

## Goals

- At 1280×720 and larger, the stage (video + court) and the control bar are fully visible
  without scrolling.
- The court is the same height as the video, next to it, in sync as it is today.
- All rally control lives in one bar under the stage: play/pause, previous/next rally,
  a rally strip to jump anywhere, skip gaps, mute, the rally list, fullscreen.
- Fullscreen shows the same split stage and control bar, with the court visible.

## Non-goals

- Changing the live court itself (camera, tags, distance, loading, caption wording).
- Reworking the Analyze view's rail, deck, shot replay or match summary.
- New data, contract or Engine changes.

## Anti-goals

- Anything drawn over the YouTube embed (`AGENTS.md`). This also retires today's
  fullscreen dock and floating rally panel, which sit over the picture.
- Hiding YouTube's native controls: seeking inside a rally, volume and quality stay with them.
- A watch page that gets heavier for matches without skeletons. They keep loading no three.js.
- Losing the estimate caption, or presenting skeletons or stroke types as measured.

## Approaches considered

- **A. Split stage — chosen (user).** The video (≈62%) and the court (≈38%) are side by side
  at the same height, with one control bar under both and the rally list in a drawer.
  It's the only option that keeps the video, the court and the controls all on screen.
- B. Court band under a full-width video. At full width, the video plus the band don't fit
  in 900 px, so the video has to shrink anyway, and a wide band suits the court less than a
  corner view does.
- C. Keep the sidebar, widen it to ~40%. It's the smallest change, but the court and list
  still compete for one column, and the controls stay spread out.

## Layout

```
 mintonix                                                     ← All matches
 All England Open 2025 · MS final   ● Hao 17 19  ● Qi 21 21 ✓   72 rallies · YouTube ↗
┌[Watch|Analyze] [ Find a rally or shot………………………………………………………………… ]─────────────────┐
│ ┌──────────────── video 16:9 ────────────────┐ ┌──────── live court ──────────┐ │
│ │                                            │ │                              │ │
│ │          (YouTube embed, native controls)  │ │   3D court, same height      │ │
│ │                                            │ │                              │ │
│ └────────────────────────────────────────────┘ │ ● Hao 18.4 m     Qi 22.1 m ● │ │
│                                                 └──────────────────────────────┘ │
│ ▶  ⏮  ⏭   Rally 12 / 72 · G1 6–3   G1 ▮▮▯▮▮▮▮▮▮ │ G2 ▮▮▮▮▮▮▮▮▮   Skip gaps ◉  🔊  ☰  ⛶ │
└───────────────────────────────────────────────────────────────────────────────────┘
 3D estimate from the broadcast, not checked by hand. … · 6 of 78 points weren't detected …
```

### Header (my call)

The match header shrinks to one line: event, both players with their game scores (winner
marked as today), rally count and the YouTube link. The two-row scoreboard is what pushes
the stage below the fold. The `<h1>` and the screen-reader table semantics stay. Phones
keep a two-line version.

### Stage

- A grid: the video column keeps 16:9, and the court column takes the rest, stretched
  to the video's height. Proportion ≈ 62/38 (builder tunes it within 58–66%).
- The stage height is capped so the stage plus the control bar fit in
  `100svh − (nav + header + toolbar)`. When the cap applies, the video shrinks and keeps
  16:9, and the court column stays the video's height.
- The court column holds the canvas (filling the column minus the distance line), then the
  distance line. The caption moves out of the column to the notice line under the viewer.
  It is still always shown whenever the court is.
- **No skeletons** (or WebGL unavailable and no distances): the video takes the full width
  of the stage. Without WebGL but with rally files, the column shows the distance line only,
  as today, and shrinks to a narrow column.
- **Analyze view (my call):** the stage's right column shows the Analyze rail instead of the
  court, as today's sidebar does. The deck stays below. Analyze gets the same control bar. Its
  layout is otherwise unchanged, and whether the court joins Analyze is a later decision.

### Minimizing the court (user)

The court can be minimized so the video gets the stage to itself.

- Two controls: a **›** button in the court's top-right corner, and a **Court** toggle
  (`aria-pressed`) in the control bar, just before Rallies. Both toggle the same state.
- Minimized, the side column collapses to a 48 px rail: a **‹** button that restores the
  court, a vertical "3D court" label, and both players' running distances. The video column
  takes the remaining width, still 16:9 and still capped by the viewport height (centred,
  with black at the sides when the cap applies).
- The canvas is unmounted while minimized (no WebGL work). The rally file for the current
  rally keeps loading so the distances stay live and restoring is instant. The camera view
  the viewer chose is kept across minimize/restore.
- The choice persists per viewer in `localStorage` (guarded with try/catch; minimized is
  never the default).
- Opening Rallies while minimized brings the side column back at full width for the drawer,
  so the drawer still never covers the video. Closing it returns to the rail.
- The Court toggle and the rail show only when the match has skeletons. In Analyze the rail
  column holds the Analyze rail and can't be minimized.
- Phones: the toggle hides or shows the court under the bar.

Overlaying the court on the embed was considered and ruled out: `AGENTS.md` forbids drawing
over the player, the broadcast camera's per-frame pose isn't exported (so it couldn't line up),
and the 100 ms playhead polling would drift.

### Control bar

One row under the whole stage, outside the video. Left to right:

1. Play/pause (the existing `togglePlayback`, including the skip-gaps start logic).
2. Previous / next rally (the existing targets).
3. Position: "Rally 12 / 72", then the game and the score before it ("G1 · 6–3"); "–" between rallies.
4. **Rally strip**: one segment per rally in source order, grouped by game with a gap and
   label between games. Missing points show as a small dashed break, as in the list. A
   segment's width is proportional to the rally's length, with a minimum so short rallies
   stay clickable. The current rally is highlighted and fills as it plays (from `sourceTime`).
   Clicking or tapping a segment plays that rally (`playRally`). Hovering or focusing shows a
   tooltip like "G1 · 6–3 · 19 s · point to Qi" (point winner only when the match has it).
   It works from the keyboard as a single tab stop: ←/→ move between rallies, Enter plays,
   Home/End jump to the first/last.
5. Skip gaps switch.
6. Mute.
7. Court toggle (see Minimizing the court).
8. Rallies: opens the full rally list (today's list, unchanged rows) as a drawer anchored to
   the bar's right end, over the court column and **never over the video**. Esc or the close
   button closes it and returns focus. In Analyze the rail already lists rallies, so this button
   is hidden there.
9. Fullscreen.

Buttons are disabled until the player is ready, as today. Keyboard shortcuts are out of scope.

### Fullscreen

The viewer goes fullscreen as now (and keeps the window-filling fallback). Inside, the stage
fills the screen above the control bar. The video takes the width it needs at full height
(16:9, but never more than 70% of the width), and the court takes the rest. On screens
wider than about 2.5:1 the video fills the height; on ordinary screens the 70% cap leaves
black above and below it, so the court keeps a usable width. The court column is shown (lifting "hidden in
fullscreen" from the live-court design: it was hidden only because the panel floated over
the video). The floating `.rallyDock` and the floating panel are removed. The drawer opens
from the bar the same way it does on the page. The toolbar and notices stay hidden in
fullscreen. In a portrait phone's rotated immersive view, the same split applies.

### Phones (≤ 800 px)

Stacked: video, control bar, then the court (full width, 16:10), then the distance line and
caption. The strip in the bar scrolls horizontally if needed and keeps the current rally in
view. Buttons keep their 40 px targets; the position text can drop the score below 400 px.
In Analyze, today's phone stacking (deck, rail) stays below the bar.

## What changes in code

- `components/rally-player/rally-player.tsx`: the workspace becomes stage (video column +
  side column) + control bar. The sidebar's watch-mode header (play, mute, fullscreen, skip
  gaps, column labels) moves into the bar. The list moves into the drawer. The dock and the
  fullscreen-floating panel go. Extract the bar (and the strip) into
  `components/rally-player/control-bar.tsx` to keep the player readable.
- The strip's layout maths (segment widths with a minimum, game groups, missing-point breaks,
  progress inside the current rally) goes in a pure function with tests beside it
  (`rally-strip.ts` / `rally-strip.test.ts`). Hit-testing and markup are not unit-tested.
- `live-court.tsx`: accept being sized by its column (the canvas fills height instead of a
  fixed 16:10). The caption is rendered by the parent's notice line. No behaviour change.
- `rally-player.module.css`, `live-court.module.css`, `app/watch/[matchId]/watch.module.css`
  (compact header).
- The live-court spec's "hidden in fullscreen" line gets a note pointing here.

## Verification

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. In the browser, on a skeleton match
(All England final) and on a match without rally files, if any (otherwise a fixture with
`poses` removed): 1440×900, 1280×720, 390×844 portrait. Check fullscreen and the immersive
fallback. Check the strip by mouse and keyboard, the drawer's focus handling, and that skip
gaps, previous/next and play behave as before. Check that nothing overlaps the iframe at any
size. Analyze view: rail, deck, shot replay (which still replaces the video column) still work.

## Calls Claude made (check these)

- One-line compact header, so the stage fits a laptop screen.
- Court ≈38% wide, same height as the video, caption moved under the viewer.
- The rally list becomes a drawer from the bar, over the court column only.
- The rally strip: widths proportional to rally length, grouped by game, point winner in the tooltip.
- Analyze keeps its rail in the right column and gains the same control bar; the court stays Watch-only.
- Fullscreen shows the court; the floating dock and panel are removed.
- Phones: video → bar → court.
- Fullscreen: the video sizes to the full height (≤70% wide), and the court takes the rest.
- Minimized state remembered per viewer in localStorage.

## Left to the builder

- Exact column proportion, the strip's minimum segment width and colours (within design tokens).
- Drawer width and animation; tooltip implementation.
- Whether the header's compact line wraps or truncates at in-between widths.
