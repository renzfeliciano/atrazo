import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit doesn't read Next's env files; load .env.local so `pnpm db:migrate` uses the same
// settings as the app. Values already set in the shell (e.g. in CI) are kept.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

/** `pnpm db:generate` writes SQL migrations to ./drizzle; `pnpm db:migrate` applies them using the direct URL. */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
