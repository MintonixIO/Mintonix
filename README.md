# Mintonix

A BWF match viewer focused on uninterrupted gameplay: detect rally boundaries, skip the time between rallies and broadcast replays, and navigate by score.

This is a fresh monorepo. The website preserves the original logos and visual design tokens. The batch rally detector ports the research preprocessing logic and archived native court fitter; the old application, database, and deployment configuration were not imported.

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
| `apps/web` | Next.js website and custom rally viewer | Local match playback and detector output integration |
| `workers/rally-detection` | Batch worker with automatic court fitting and research rally detection | Implemented; requires broadcast evaluation |
| `contracts` | Versioned rally manifest schema and illustrative fixture | Implemented |
| `docs` | Scope, architecture, brand, and deployment guidance | Implemented |

The homepage provides a match-link form and explains the viewer components. The form validates URL syntax locally but does not submit a processing job. Local detector output can be viewed at `/watch/[matchId]` with `MINTONIX_LOCAL_MATCHES_DIR` configured in `apps/web/.env.local`; see `docs/development.md`. The current local sample is `dl1s0`, assembled from 11 research clips. There is no upload, account, or cloud integration in the website yet.

The technical blog is available at `/blog`. Each article is a simple `.md` file under `apps/web/content/blog`; see `docs/blogging.md` for frontmatter and authoring instructions.

## First deployment

Import this repository into Vercel, select **Next.js**, and set the project's **Root Directory** to `apps/web`. Keep the repository-root pnpm workspace and lockfile. No credentials are required for this preview. See `docs/development.md`.

## Next implementation

Review the local detector output against the video for boundary accuracy and replay inclusion. The local viewer plays generated manifests, but those intervals and OCR scores are not yet manually verified. Public dispatch and cloud storage remain separate implementation work.

See `workers/rally-detection/README.md` to run the batch detector and `docs/architecture.md` for the intended Vast.ai and Backblaze B2 boundaries.
