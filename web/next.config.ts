import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Off: on Next 16.4.2 the experimental partial prefetching hangs `next build` for good on some
  // pages, depending on their content (seen on a basketball game page). Re-test before re-enabling.
  partialPrefetching: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
