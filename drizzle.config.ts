import { defineConfig } from "drizzle-kit";

/** `pnpm db:generate` writes SQL migrations to ./drizzle; `pnpm db:migrate` applies them using the direct URL. */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
