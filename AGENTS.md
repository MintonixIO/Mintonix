# Mintonix contributor guide

## Product scope

The first product is a BWF match viewer that plays rallies while skipping dead time and broadcast replays. Users navigate rallies by score and scrub the gameplay timeline. Broader analytics, 3D reconstruction, accounts, billing, and user uploads are outside the initial scope.

## Boundaries

- `apps/web` owns the website and player. Keep related feature code together in `components/rally-player`.
- `workers/rally-detection` owns the headless batch detector for Vast.ai. It automatically fits court coordinates and emits the v1 manifest; storage, provisioning, and public job dispatch are not connected. Run its Python tests and compile its native court fitter when changing worker logic.
- `contracts/rally-manifest.schema.json` owns the cross-runtime data shape. Update the example, frontend validation, and tests with contract changes.
- Do not create shared packages, worker stages, or service scaffolds without an actual consumer or deployment requirement.
- Use one root pnpm workspace and lockfile. Python dependencies belong to the worker when its implementation begins.
- Keep videos, model weights, generated outputs, and credentials outside Git.
- Never expose B2 or Vast credentials to client bundles. Playback URLs will be resolved separately from persisted rally timestamps.
- Keep synthetic data and unimplemented product behavior clearly identified as preview. Do not imply a match was detected, hosted, or processed when it was not.

## Changes and verification

Preserve the original logos and design tokens. Put tests next to meaningful domain logic; avoid tests that merely duplicate visual markup. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` for changes to the web foundation. Respect generated Next.js guidance in `apps/web/AGENTS.md` and consult the installed version's documentation.
