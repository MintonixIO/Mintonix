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

## Hero actions

The hero's main action, **Try the demo**, opens the first available local match
(or the library when none is configured). The match-link field below it is
disabled and labelled "Coming soon": processing a new match from its link is not
implemented, so the page must not accept a link or suggest a job was created.

## Preview data

Synthetic match data lives in `components/rally-player/test-fixtures.ts` for contract and domain tests. Watch pages read match files instead.

## Matches

Published matches are committed under `content/matches/<matchId>/` and deployed
with the app. To read a different set while developing, set
`MINTONIX_LOCAL_MATCHES_DIR` to an absolute directory in `.env.local`; it
replaces the published set.
The server reads `<directory>/<matchId>/metadata.json`, and the live court
fetches `<rallyId>.json` per rally when present (see `contracts/README.md`). No video
is read or served: `/watch/<matchId>` embeds the match's YouTube source with
the YouTube IFrame Player API and drives it for rally selection, scrubbing,
fullscreen, and gap skipping. YouTube's embed policy does not allow drawing over
the player, so the score and rally readouts sit in the controls below it.
Match IDs are restricted; server filesystem paths are never sent to the client.

Write match folders from the Engine:

```sh
cd ../Engine
python util/export_match.py --video dl1 --match-id denmark-open-2025-ms-sf \
  --title "VICTOR Denmark Open 2025, men’s singles semifinal" \
  --player p1="Shi Yu Qi" --player p0="Viktor Axelsen" \
  --youtube 9WVwZSzixh0 --duration 5120.021 --rallies annotations
```

`--rallies annotations` exports the hand-reviewed rallies (`review: reviewed`);
the default exports the engine's own (`review: automatic`). When the Engine
has `annotations/<stem>/hits.csv`, each exported rally starts at most 1 s
before its first racket hit; `--no-trim-starts` keeps the stored starts.

Match ids follow `{tournament}-{year}-{event}-{round}`, all lowercase: the
tournament name without its sponsor (`denmark-open`, `malaysia-open`), the
year, the BWF event code (`ms`, `ws`, `md`, `wd`, `xd`) and the round (`r32`,
`r16`, `qf`, `sf`, `f`; when a tournament has two semifinals in the set, `sf1` and
`sf2` in BFMD's listing order), e.g. `malaysia-open-2025-ms-f`. Library order is
alphabetical by id, and the first match is the homepage demo.

To publish a match, export it with the Engine's `util/export_match.py` and commit
its `metadata.json` (and rally files) under `content/matches/<matchId>/`. The tests validate every published match.

The published sample, `/watch/denmark-open-2025-ms-sf`, plays the BWF TV upload of the VICTOR Denmark Open 2025 semifinal, Shi Yu Qi vs Viktor Axelsen (YouTube `9WVwZSzixh0`), with reviewed rallies and shot data.
`/watch/malaysia-open-2025-ms-f` plays the PETRONAS Malaysia Open 2025 final, Shi Yu Qi vs Anders Antonsen (YouTube `eKPtHLGFxLE`), with engine-detected rallies (`review: automatic`) whose hits come from the BFMD dataset.
`/watch/indonesia-open-2025-ms-f` plays the KAPAL API Indonesia Open 2025 final, Chou Tien Chen vs Anders Antonsen (YouTube `PSEgVtdtLJ0`), the same way.
The other ten BFMD men's singles matches are published the same way, with BWF TV uploads: the Indonesia, Malaysia, China and All England Open 2025 semifinals (`-ms-sf1`, `-ms-sf2`) and the China and All England Open 2025 finals (`-ms-f`).

Keep all media, unpublished match files, and `.env.local` outside Git.

## Technical blog

Visit `/blog`. Add one `.md` file per article under `content/blog/`; the filename is the slug. See `docs/blogging.md` for the required frontmatter. No CMS or database is needed.

## Checks

CI installs with the frozen lockfile, then checks lint, TypeScript, domain tests, and the production build. Tests cover match and analysis validation, the generated contracts, and playback across segments, particularly gaps and rally boundaries. A deployment must run these checks before relying on its artifact.

## Vercel

- Connect the canonical Git repository.
- Select Next.js as the framework and leave the Root Directory at the repository root.
- Use the repository's pnpm lockfile. The build command is `pnpm build`.
- Matches come from `content/matches`. Set the server-only `OPENROUTER_API_KEY`
  to enable natural-language search; without it, local keyword suggestions work.
  Optionally override `OPENROUTER_SEARCH_MODEL` (see `.env.example`).
- Published matches are read from disk at request time. `outputFileTracingIncludes` in `next.config.ts` ships `content/matches` with the server routes; keep it when moving that directory.

No Vercel project is created or deployed by this scaffold.

## Rally and shot search

The match viewer searches the current match using local JSON and OpenRouter;
there is no database or ingestion job. Copy `.env.example` to `.env.local` and
set `OPENROUTER_API_KEY` for full language understanding. Never use a
`NEXT_PUBLIC_` prefix. The key is read only by the server search route.

See [search design and benchmark](natural-language-search.md) for the decision
scorer, subjective terms, limitations, caching, and the reproducible live benchmark.

## Search and link previews

`components/site/site.ts` holds the site name, default description and public
origin (`https://mintonix.io`, or `SITE_URL` when set). Give each new page its
metadata with `pageMetadata({ title, description, path })`, which sets the
canonical link and the share-preview tags, and add the page to `app/sitemap.ts`
unless it is an article or a match (those are listed automatically).
`app/robots.ts` keeps Vercel preview deployments out of search results; only
the production deployment is indexable. Link-preview cards are drawn by
`components/site/share-image.tsx`; articles and matches get their own.
