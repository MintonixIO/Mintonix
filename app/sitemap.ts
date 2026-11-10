import type { MetadataRoute } from "next";
import { getPosts } from "@/components/blog/posts";
import { listLocalMatches } from "@/components/rally-player/local-match";
import { absoluteUrl } from "@/components/site/site";

/** Every public page: the site pages, each article, and each published match. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const matches = await listLocalMatches();
  return [
    { url: absoluteUrl("/"), priority: 1 },
    { url: absoluteUrl("/library"), priority: 0.8 },
    ...matches.map((match) => ({ url: absoluteUrl(`/watch/${match.matchId}`), priority: 0.8 })),
    { url: absoluteUrl("/blog"), priority: 0.6 },
    ...getPosts().map((post) => ({ url: absoluteUrl(`/blog/${post.slug}`), lastModified: post.date, priority: 0.6 })),
  ];
}
