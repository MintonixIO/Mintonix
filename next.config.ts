import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  cacheComponents: true,
  partialPrefetching: true,
  // Match metadata is read from disk at request time, so ship it with the server routes. Rally
  // files (~100 MB of skeletons) are prerendered by their route at build; their reads are
  // marked turbopackIgnore so no function traces them.
  outputFileTracingIncludes: { "/*": ["./content/matches/*/metadata.json"] },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**/hqdefault.jpg", search: "" }],
  },
  turbopack: {
    rules: {
      // Transform the Tailwind entry only; preserve native CSS Module exports.
      "globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
