import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import { extraDevHosts } from "./src/server/config/dev-origins";
import { securityHeaders } from "./src/server/security/http-headers";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

const nextConfig: NextConfig = {
  /** Overridable so a second dev server (e.g. for debugging) can run without sharing .next. */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  /** Development only: a phone on the same Wi-Fi (or DEV_ALLOWED_ORIGINS) may load the dev server. */
  allowedDevOrigins:
    process.env.NODE_ENV === "production"
      ? []
      : extraDevHosts(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:6060"),
  /** Browser security headers on every response; see src/server/security/http-headers.ts. */
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders(process.env.NODE_ENV !== "production") },
      // The service worker must always be re-checked, so a new version reaches phones promptly.
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
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
