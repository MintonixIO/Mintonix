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

Run `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` from the repository root. Tests retain the synthetic contract fixture in `../../contracts`; local watch pages read actual detector output. See the root README and `docs/` for scope and deployment instructions.

The homepage contains the match-link form and component explanations. The form validates URL format but does not create a processing job. Set `MINTONIX_LOCAL_MATCHES_DIR` to an absolute directory in `.env.local` to enable `/watch/[matchId]`. Each match directory needs `manifest.json` (worker output) and `video.mp4` (a local file or symlink). The server validates the manifest and streams video with byte ranges, enabling real playback and seeking. The player supports rally selection, pause/play, fullscreen, original-video scrubbing, and optional gap skipping. Generated media/manifests and the local environment file stay outside Git.

The current local sample is `/watch/dl1s0`: `dl1c0` through `dl1c10` concatenated in numeric order, 297.3 seconds at 30 fps. Its 10 detected intervals and OCR score labels are automatic candidates, not manually reviewed ground truth. The homepage shows a sample link when local matches are configured. No cloud storage or public processing is connected.

The `/blog` index and `/blog/[slug]` articles read simple Markdown files with frontmatter from `content/blog/`. See `docs/blogging.md` at the repository root. The same header and footer appear on the homepage and blog.
