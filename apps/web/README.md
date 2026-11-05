# Mintonix web

Fresh Next.js App Router application with TypeScript, Tailwind CSS, ESLint, Turbopack, and React Compiler. There is no `src` directory.

```text
app/                          Routes, root layout, and global CSS
components/match-link/        Match-link entry form and local preview feedback
components/rally-player/      Rally player, its styling, domain logic, and tests
components/blog/              Markdown loader and article styling
components/site/              Shared header and footer
components/ui/                Components reused across the website
content/blog/                 One Markdown file per technical article
styles/tokens/                Original Mintonix design tokens
public/brand/                 Original logo assets
```

Routes assemble feature components. A feature only needs its own page when users need a distinct URL for it. Timeline and score selection belong together in the match viewer.

Run `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` from the repository root. Synthetic manifest data lives directly in the timeline tests; local watch pages read configured v2 match manifests. See the root README and `docs/` for scope and deployment instructions.

The homepage contains the match-link form and component explanations. The form validates URL format but does not create a processing job. Set `MINTONIX_LOCAL_MATCHES_DIR` to an absolute directory in `.env.local` to enable `/watch/[matchId]`. Each match directory needs a v2 `manifest.json` matching the schema in `contracts/`. The server validates it; no video is read or served. The player embeds the manifest's YouTube source and supports rally selection, pause/play, fullscreen, source-video scrubbing, and optional gap skipping. Generated manifests and the local environment file stay outside Git.

The current local sample is `/watch/dl1s0`: the BWF TV upload of the VICTOR Denmark Open 2025 semifinal, Shi Yu Qi vs Viktor Axelsen (YouTube `9WVwZSzixh0`), with rallies between 6:10 and 11:09. Its 10 detected intervals and OCR score labels are automatic candidates, not manually reviewed ground truth. The `/library` page lists all configured matches with valid manifests, with links to their watch pages. Incomplete or invalid entries are omitted. The navigation, footer, and homepage hero link to Library, which shows an empty state when no matches are available. No cloud storage or public processing is connected.

The `/blog` index and `/blog/[slug]` articles read simple Markdown files with frontmatter from `content/blog/`. See `docs/blogging.md` at the repository root. The same header and footer appear on the homepage and blog.
