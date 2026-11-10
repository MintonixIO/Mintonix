import type { Metadata } from "next";

/**
 * The public origin used for canonical links, the sitemap and share previews.
 * Set `SITE_URL` to serve the site from another origin.
 */
const siteUrl = (process.env.SITE_URL || "https://mintonix.io").replace(/\/+$/, "");

export const site = {
  name: "Mintonix",
  url: siteUrl,
  title: "Mintonix — Badminton rally viewer and shot analysis",
  tagline: "Watch the rally. Read the game.",
  description: "Watch badminton matches rally by rally. Skip the time between points, jump to any rally by score, and open a shot to see its speed, height and 3D flight.",
  logo: "/brand/logo-full.png",
} as const;

/** Only the production deployment is indexed; preview deployments stay out of search results. */
export const indexable = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === "production";

export function absoluteUrl(path = "/") {
  return new URL(path, `${site.url}/`).toString();
}

type PageMetadata = {
  /** Omit on the home page to keep the site's default title. */
  title?: string;
  description: string;
  /** Canonical path, starting with a slash. */
  path: string;
  /** Publication date (YYYY-MM-DD); marks the page as an article. */
  publishedTime?: string;
};

/**
 * Title, description, canonical link and share-preview tags for one page.
 * A page's `openGraph` replaces the root layout's, so each page states it in full.
 */
export function pageMetadata({ title, description, path, publishedTime }: PageMetadata): Metadata {
  // Pages without their own share image use the site's; a route's `opengraph-image` file takes precedence.
  const shared = { title: title ?? site.title, description, images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${site.name}: ${site.tagline}` }] };
  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: path },
    openGraph: {
      ...shared,
      url: path,
      siteName: site.name,
      locale: "en_US",
      ...(publishedTime ? { type: "article" as const, publishedTime } : { type: "website" as const }),
    },
    twitter: { card: "summary_large_image", ...shared },
  };
}
