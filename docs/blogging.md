# Technical blog

Each article is one Markdown file in `content/blog/`. There is no CMS, database, or MDX runtime.

## Add an article

Create a file such as `content/blog/my-article.md`:

```md
---
title: "My article title"
description: "A short summary for the blog listing and page metadata."
date: "2026-11-03"
category: "Engineering"
---

Opening paragraph.

## A section

Write ordinary Markdown, including lists, links, blockquotes, and fenced code blocks.
```

The filename becomes `/blog/my-article`. Use lowercase letters, numbers, and hyphens. The four frontmatter fields are required; quote the date so YAML treats it as a string. Files with names that do not follow this convention are not listed.

The listing sorts by publication date, newest first, then by title. Reading time is estimated from the body. Dates are displayed consistently without a timezone-dependent day shift.

Articles are rendered on the server with `react-markdown`. Raw HTML is skipped, and Markdown links use the renderer's default URL safety rules. Frontmatter is read with `gray-matter`.

## Preview and deploy

Run `pnpm dev` from the repository root, then visit `/blog`. Refresh the page after editing content; restart the dev server if a newly added file is not visible. `pnpm build` generates the known article pages. Redeploy after publishing or editing a post.

The Markdown loader stays on the server. Article bodies are not bundled into the homepage's client JavaScript. There is no remote content fetching or user-submitted Markdown.

Keep technical claims grounded in the current implementation. Describe planned features as plans and candidate detector outputs as candidates; do not invent accuracy, speed, or evaluation results.
