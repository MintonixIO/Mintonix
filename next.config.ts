import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  cacheComponents: true,
  partialPrefetching: true,
  // Published matches are read from disk at request time, so ship them with the server routes.
  outputFileTracingIncludes: { "/*": ["./content/matches/**/*.json"] },
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
