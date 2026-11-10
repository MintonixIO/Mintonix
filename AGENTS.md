# Mintonix contributor guide

## Product scope

The first product is a BWF match viewer that plays rallies while skipping dead time and broadcast replays. Users navigate rallies by score and scrub the gameplay timeline. When a match has an `analysis.json`, an Analyze view lists rallies beside the same video, each expanding to its shots; opening a shot replaces the embed with a 3D reconstruction of its measured flight, with that shot's measurements (speed, height, net clearance, placement) below, and per-player summaries with sample sizes. When the analysis carries `shotTypes`, each racket shot shows its stroke type (smash, lift, net shot…) as inferred by the engine's model, with its probability, and the match summary shows each player's mix of stroke types. A rally shows its shots as a sequence of stroke types; an opened shot is compared with the hitter's other shots of the same type, with the match's patterns around it (what the hitter tends to play against the previous stroke, what the opponent tends to reply, how often the type ends rallies). Always present these as model inferences that were not checked by hand, mark low-confidence picks, and state patterns only from adequate samples. Accounts, billing, and user uploads are outside the current scope.

## Boundaries

- The app is a single Next.js package at the repository root (`app`, `components`, `content`, `styles`, `public`). Keep related feature code together in `components/rally-player` (analyze view: `components/rally-player/analysis`).
- This repository contains only the app. Backend implementation and deployment are maintained separately.
- `contracts/` defines the match data consumed by the app: `match.json` (required) and `analysis.json` (optional shot data), generated from `components/rally-player/contract.ts`. Change the zod schemas there, run `pnpm contracts`, and update tests. Keep synthetic fixtures with the tests (`test-fixtures.ts`).
- Do not create shared packages or service scaffolds without an actual consumer or deployment requirement.
- Keep the app a single package at the repository root, with one lockfile.
- Keep videos, model weights, generated outputs, and credentials outside Git. The one exception is published matches: `content/matches/<matchId>/{match.json, analysis.json}` are committed and deployed with the app.
- Never expose server credentials to client bundles. Never re-host or stream broadcast video: playback embeds the match's YouTube `source`, and nothing may be drawn over the embedded player.
- Keep synthetic data and unimplemented product behavior clearly identified as preview. Do not imply a match was detected, hosted, or processed when it was not.

## Changes and verification

Preserve the original logos and design tokens. Put tests next to meaningful domain logic; avoid tests that merely duplicate visual markup. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` for changes to the web foundation. Respect the generated Next.js guidance below and consult the installed version's documentation.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
