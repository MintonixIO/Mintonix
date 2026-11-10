# Mintonix

A BWF match viewer focused on uninterrupted gameplay: detect rally boundaries, skip the time between rallies and broadcast replays, and navigate by score.

This repository contains the Mintonix app. The backend is maintained separately. The website preserves the original logos and visual design tokens.

## Local development

Use Node.js 24+ and pnpm 12.9.1 (the version pinned in `package.json`).

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. No environment variables or cloud accounts are needed for the preview.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

## Repository

| Directory | Purpose | Status |
| --- | --- | --- |
| `app`, `components`, `styles`, `public` | Next.js website and custom rally viewer | Match playback |
| `content` | Blog articles (`content/blog`) and published matches (`content/matches`) | Implemented |
| `contracts` | Match and shot-analysis schemas (generated from the app's zod contract) | Implemented |
| `docs` | Scope, architecture, brand, and deployment guidance | Implemented |

The app is a single Next.js package at the repository root. Feature code is grouped under `components/` (`rally-player`, `home`, `blog`, `site`, `ui`); routes in `app/` assemble those components.

The homepage's main action opens the demo match and explains the viewer components. The match-link field is disabled and labelled as coming soon; no processing job can be submitted. Published matches are committed under `content/matches` and served at `/watch/[matchId]`; set `MINTONIX_LOCAL_MATCHES_DIR` in `.env.local` to read another directory instead (see `docs/development.md`). The published sample is `dl1` (reviewed rallies and shot data from the Engine). There is no upload, account, or cloud integration in the website yet.

The technical blog is available at `/blog`. Each article is a simple `.md` file under `content/blog`; see `docs/blogging.md` for frontmatter and authoring instructions.

## First deployment

Import this repository into Vercel and select **Next.js**. The app is at the repository root, so no Root Directory setting is needed. No credentials or environment variables are required for this preview. See `docs/development.md`.

See `docs/architecture.md` for the app architecture and playback model.
