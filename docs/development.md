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

The app is a single package at the repository root. The backend is maintained separately.

## Match link form

The hero form validates HTTP/HTTPS URL syntax locally. It does not verify that a link is a BWF match, fetch the URL, enqueue a job, or claim a view was generated. A valid submission explains that no processing job has been created. No default development helper text is displayed below the form. Automatic processing is not connected.

## Preview data

Synthetic match data lives in `components/rally-player/test-fixtures.ts` for contract and domain tests. Watch pages read match files instead.

## Matches

Published matches are committed under `content/matches/<matchId>/` and deployed
with the app. To read a different set while developing, set
`MINTONIX_LOCAL_MATCHES_DIR` to an absolute directory in `.env.local`; it
replaces the published set.
The server reads `<directory>/<matchId>/match.json` and, when present,
`analysis.json` (see `contracts/README.md`). No video
is read or served: `/watch/<matchId>` embeds the match's YouTube source with
the YouTube IFrame Player API and drives it for rally selection, scrubbing,
fullscreen, and gap skipping. YouTube's embed policy does not allow drawing over
the player, so the score and rally readouts sit in the controls below it.
Match IDs are restricted; server filesystem paths are never sent to the client.

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

To publish a match, commit its `match.json` (and `analysis.json`) under
`content/matches/<matchId>/`. The tests validate every published match.

The published sample, `/watch/dl1`, plays the BWF TV upload of the VICTOR Denmark Open 2025 semifinal, Shi Yu Qi vs Viktor Axelsen (YouTube `9WVwZSzixh0`), with reviewed rallies and shot data.

Keep all media, unpublished match files, and `.env.local` outside Git.

## Technical blog

Visit `/blog`. Add one `.md` file per article under `content/blog/`; the filename is the slug. See `docs/blogging.md` for the required frontmatter. No CMS or database is needed.

## Checks

CI installs with the frozen lockfile, then checks lint, TypeScript, domain tests, and the production build. Tests cover match and analysis validation, the generated contracts, and playback across segments, particularly gaps and rally boundaries. A deployment must run these checks before relying on its artifact.

## Vercel

- Connect the canonical Git repository.
- Select Next.js as the framework and leave the Root Directory at the repository root.
- Use the repository's pnpm lockfile. The build command is `pnpm build`.
- Leave environment variables empty: matches come from `content/matches`.
- Published matches are read from disk at request time. `outputFileTracingIncludes` in `next.config.ts` ships `content/matches` with the server routes; keep it when moving that directory.

No Vercel project is created or deployed by this scaffold.
