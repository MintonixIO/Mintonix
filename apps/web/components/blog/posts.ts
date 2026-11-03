import "server-only";

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { cache } from "react";

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  date: string;
  category: string;
  readingMinutes: number;
  body: string;
};

const directory = path.join(process.cwd(), "content/blog");
const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Cached per request: metadata and the page body both read the same post. */
export const getPost = cache((slug: string): BlogPost | undefined => {
  if (!validSlug.test(slug)) return undefined;
  const filename = path.join(directory, `${slug}.md`);
  if (!existsSync(filename)) return undefined;
  const { data, content } = matter(readFileSync(filename, "utf8"));
  for (const field of ["title", "description", "date", "category"]) {
    if (typeof data[field] !== "string" || !data[field].trim()) {
      throw new Error(`${slug}.md needs a nonempty ${field} in its frontmatter`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || Number.isNaN(Date.parse(data.date)) || new Date(data.date).toISOString().slice(0, 10) !== data.date) {
    throw new Error(`${slug}.md needs a valid date in YYYY-MM-DD format`);
  }
  return {
    slug,
    title: data.title,
    description: data.description,
    date: data.date,
    category: data.category,
    readingMinutes: Math.max(1, Math.ceil(content.trim().split(/\s+/).length / 220)),
    body: content.trim(),
  };
});

export function getPosts(): BlogPost[] {
  return readdirSync(directory)
    .filter((filename) => filename.endsWith(".md") && validSlug.test(filename.slice(0, -3)))
    .map((filename) => getPost(filename.slice(0, -3)))
    .filter((post): post is BlogPost => post !== undefined)
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

export function formatPostDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}
