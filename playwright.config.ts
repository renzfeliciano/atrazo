import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: real browser, real Next.js server, real API, real (local) Postgres.
 *
 *   pnpm test:e2e                      starts its own dev server on :6080 with a fresh database
 *   E2E_BASE_URL=http://… pnpm test:e2e  runs against a server you started yourself
 *
 * The "setup" project starts one store and saves the browser state (cookie + IndexedDB) for the
 * other tests, so a run creates a single store (the API allows only a few per hour per network).
 * Locally the installed Google Chrome is used; CI installs Playwright's Chromium.
 */
const PORT = 6080;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const ci = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  retries: ci ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: ci ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(ci ? {} : { channel: "chrome" }),
  },
  projects: [
    { name: "setup", testMatch: /store\.setup\.ts/ },
    {
      name: "phone",
      use: { ...devices["Pixel 7"], ...(ci ? {} : { channel: "chrome" }) },
      dependencies: ["setup"],
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // A fresh local database every run, so rate limits and data never carry over.
        command: `node -e "require('fs').rmSync('.data/e2e',{recursive:true,force:true})" && next dev -p ${PORT}`,
        url: `${baseURL}/api/health`,
        timeout: 180_000,
        reuseExistingServer: false,
        env: {
          DATABASE_URL: "pglite:e2e",
          NEXT_PUBLIC_APP_URL: baseURL,
          NEXT_DIST_DIR: ".next-e2e",
          NEXT_TELEMETRY_DISABLED: "1",
        },
      },
});
