import type { NextConfig } from "next";
import { posthogHosts, posthogKey, PROXY_PATH } from "./lib/analytics/config";

// Analytics go through our own site (/ingest) to PostHog, so blockers don't drop them; only when a
// PostHog key is set (docs/analytics.md).
const analytics = Boolean(posthogKey());

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // PostHog's API paths end in a slash; without this Next would redirect them.
  skipTrailingSlashRedirect: analytics,
  async rewrites() {
    if (!analytics) return [];
    const { ingest, assets } = posthogHosts();
    // The static and array rules must come before the catch-all.
    return [
      { source: `${PROXY_PATH}/static/:path*`, destination: `${assets}/static/:path*` },
      { source: `${PROXY_PATH}/array/:path*`, destination: `${assets}/array/:path*` },
      { source: `${PROXY_PATH}/:path*`, destination: `${ingest}/:path*` },
    ];
  },
};

export default nextConfig;
