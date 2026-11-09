# Mintonix contributor guide

## Product scope

The first product is a BWF match viewer that plays rallies while skipping dead time and broadcast replays. Users navigate rallies by score and scrub the gameplay timeline. When a match has an `analysis.json`, an Analyze view beside the same video shows the Engine's per-shot measurements (speed, height, net clearance, placement) and per-player summaries with sample sizes. Shot types, sequences, accounts, billing, and user uploads are outside the current scope.

## Boundaries

- `apps/web` owns the website and player. Keep related feature code together in `components/rally-player` (analyze view: `components/rally-player/analysis`).
- This repository contains only the app. Backend implementation and deployment are maintained separately.
- `contracts/` defines the match data consumed by the app: `match.json` (required) and `analysis.json` (optional shot data), generated from `apps/web/components/rally-player/contract.ts`. Change the zod schemas there, run `pnpm --filter @mintonix/web contracts`, and update tests. Keep synthetic fixtures with the tests (`test-fixtures.ts`).
- Do not create shared packages or service scaffolds without an actual consumer or deployment requirement.
- Use one root pnpm workspace and lockfile.
- Keep videos, model weights, generated outputs, and credentials outside Git.
- Never expose server credentials to client bundles. Never re-host or stream broadcast video: playback embeds the match's YouTube `source`, and nothing may be drawn over the embedded player.
- Keep synthetic data and unimplemented product behavior clearly identified as preview. Do not imply a match was detected, hosted, or processed when it was not.

## Changes and verification

Preserve the original logos and design tokens. Put tests next to meaningful domain logic; avoid tests that merely duplicate visual markup. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` for changes to the web foundation. Respect generated Next.js guidance in `apps/web/AGENTS.md` and consult the installed version's documentation.
