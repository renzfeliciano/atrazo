import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  reactStrictMode: true,
  /** Loaded from node_modules at runtime (local dev database only); never bundled. */
  serverExternalPackages: ["@electric-sql/pglite"],
  /** Sent by the phone on every API call; the server can ask old versions to update. */
  env: { NEXT_PUBLIC_APP_VERSION: version },
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
