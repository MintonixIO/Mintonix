# Development and deployment

## Tools

Use Node.js 24+ (`.nvmrc` selects 24) and pnpm 12.9.1. The root `packageManager` field pins pnpm. Install that version using your usual Node/package-manager setup if it is not already available.

Run all commands from the repository root:

```sh
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm dev` serves the web app on port 3000 by default. `pnpm start` serves an existing production build. The test command uses Node's built-in TypeScript support and test runner, so it requires Node 24+.

There is one pnpm workspace and one lockfile for the web app. The backend is maintained separately.

## Match link form

The hero form validates HTTP/HTTPS URL syntax locally. It does not verify that a link is a BWF match, fetch the URL, enqueue a job, or claim a view was generated. A valid submission explains that no processing job has been created. No default development helper text is displayed below the form. Automatic processing is not connected.

## Preview data

Synthetic match data lives in `apps/web/components/rally-player/test-fixtures.ts` for contract and domain tests. Local watch pages read configured match files instead.

## Local match viewer

Set `MINTONIX_LOCAL_MATCHES_DIR` to an absolute directory in `apps/web/.env.local`.
The server reads `<directory>/<matchId>/match.json` and, when present,
`analysis.json` (see `contracts/README.md`). No video
is read or served: `/watch/<matchId>` embeds the match's YouTube source with
the YouTube IFrame Player API and drives it for rally selection, scrubbing,
fullscreen, and gap skipping. YouTube's embed policy does not allow drawing over
the player, so the score and rally readouts sit in the controls below it.
Match IDs are restricted; server filesystem paths are never sent to the client.
With no configured directory, the library is empty.

Write match folders from the Engine:

```sh
cd ../Engine
python util/export_match.py --video dl1 --match-id dl1 \
  --title "VICTOR Denmark Open 2025, men’s singles semifinal" \
  --player p1="Shi Yu Qi" --player p0="Viktor Axelsen" \
  --youtube 9WVwZSzixh0 --duration 5120.021 --rallies annotations
```

`--rallies annotations` exports the hand-reviewed rallies (`review: reviewed`);
the default exports the engine's own (`review: automatic`).

The local sample, `/watch/dl1`, plays the BWF TV upload of the VICTOR Denmark Open 2025 semifinal, Shi Yu Qi vs Viktor Axelsen (YouTube `9WVwZSzixh0`), with reviewed rallies and shot data.

Keep all media, match files generated from real footage, and `.env.local` outside Git.

## Technical blog

Visit `/blog`. Add one `.md` file per article under `apps/web/content/blog/`; the filename is the slug. See `docs/blogging.md` for the required frontmatter. No CMS or database is needed.

## Checks

CI installs with the frozen lockfile, then checks lint, TypeScript, domain tests, and the production build. Tests cover match and analysis validation, the generated contracts, and playback across segments, particularly gaps and rally boundaries. A deployment must run these checks before relying on its artifact.

## Vercel

- Connect the canonical Git repository.
- Select `apps/web` as the Root Directory and Next.js as the framework.
- Use the repository's pnpm lockfile. The app build command is `pnpm build` when run from `apps/web`.
- Leave environment variables empty for the scaffold.
- Contract changes affect the website even though they are outside the JavaScript workspace. Do not enable an ignore rule that skips `contracts/**` changes. Automatic workspace-only deployment skipping may treat them as global changes; this is acceptable initially.

No Vercel project is created or deployed by this scaffold. There is no Git remote configured.
