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

There is one pnpm workspace and one lockfile. The Python worker is not a pnpm package. No Turborepo or Nx is needed for one web application and one batch worker.

## Match link form

The hero form validates HTTP/HTTPS URL syntax locally. It does not verify that a link is a BWF match, fetch the URL, enqueue a job, or claim a view was generated. A valid submission explains that no processing job has been created. No default development helper text is displayed below the form. Automatic processing is not connected.

## Preview data

Synthetic manifest data lives directly in `apps/web/components/rally-player/timeline.test.ts` for contract/domain tests. Local watch pages use actual detector output instead.

## Local match viewer

Set `MINTONIX_LOCAL_MATCHES_DIR` to an absolute directory in `apps/web/.env.local`.
The server reads `<directory>/<matchId>/manifest.json` (contract v2). No video
is read or served: `/watch/<matchId>` embeds the manifest's YouTube source with
the YouTube IFrame Player API and drives it for rally selection, scrubbing,
fullscreen, and gap skipping. YouTube's embed policy does not allow drawing over
the player, so the score and rally readouts sit in the controls below it.
Match IDs are restricted; server filesystem paths are never sent to the client.
With no configured directory, the library is empty.

The current local sample, `/watch/dl1s0`, plays the BWF TV upload of the VICTOR
Denmark Open 2025 semifinal, Shi Yu Qi vs Viktor Axelsen (YouTube
`9WVwZSzixh0`). Its rallies were originally detected on `dl1c0.mp4` through
`dl1c10.mp4` concatenated, and were then mapped onto the upload's timeline.
Each clip is a whole-second cut of `dl1.mp4`, the full 5,120-second upload,
starting at 370, 386, 402, 419, 450, 466, 504, 538, 573, 601, and 628 seconds;
frame matching confirmed each offset. The pre-conversion manifest is kept beside
it as `manifest.v1-local.json`.
The combined source is `RESEARCH/dataset/videos/dl1s0.mp4` in the enclosing
workspace: 8,919 frames, 1080p, 30 fps, 297.3 seconds, with no audio in the
source clips. The worker ran directly on the combined source with automatic
court fitting and OCR scores enabled. Its job, log, manifest, and video symlink
are under the ignored repository directory `data/matches/dl1s0`. It detected
10 candidate intervals; that count is detector output and is not asserted to
match the 11 input clips. Boundaries and scores still require review.

Keep all media, manifests generated from real footage, and `.env.local` outside
Git. This integration uses local disk and does not configure B2 or public jobs.

## Technical blog

Visit `/blog`. Add one `.md` file per article under `apps/web/content/blog/`; the filename is the slug. See `docs/blogging.md` for the required frontmatter. No CMS or database is needed.

## Checks

CI installs with the frozen lockfile, then checks lint, TypeScript, domain tests, and the production build. Tests cover manifest validation and source/gameplay mapping, particularly gaps and rally boundaries. A deployment must run these checks before relying on its artifact.

## Vercel

- Connect the canonical Git repository.
- Select `apps/web` as the Root Directory and Next.js as the framework.
- Use the repository's pnpm lockfile. The app build command is `pnpm build` when run from `apps/web`.
- Leave environment variables empty for the scaffold.
- Contract changes affect the website even though they are outside the JavaScript workspace. Do not enable an ignore rule that skips `contracts/**` changes. Automatic workspace-only deployment skipping may treat them as global changes; this is acceptable initially.

No Vercel project is created or deployed by this scaffold. There is no Git remote configured.

## Worker and storage

The batch worker has a Python CLI, native automatic court fitter, Dockerfile, and its own CI tests. See `workers/rally-detection/README.md` for setup and job format. Its local output can be loaded into the viewer, but public dispatch and B2 are not connected; full-broadcast evaluation and deployment orchestration remain to be implemented. Supply credentials through the deployment platform's secret store. Do not put media, model weights, `.env` files, or private signed URLs into the repository.
