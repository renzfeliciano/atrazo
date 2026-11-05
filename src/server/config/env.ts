import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once on first use.
 * A missing or malformed value fails fast with a message naming the key (never the value),
 * instead of failing later inside a user's request.
 */
const postgresUrl = z
  .url()
  .refine(
    (v) => v.startsWith("postgres://") || v.startsWith("postgresql://"),
    "must be a Postgres URL",
  );

/** An empty line in .env ("KEY=") means "not set". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.url(),
  /** A Neon Postgres URL, or "pglite" / "pglite:<name>" for a local development database in ./.data. */
  DATABASE_URL: z.union([
    postgresUrl,
    z.string().regex(/^pglite(:[a-z0-9-]+)?$/i, "must be a Postgres URL or pglite[:name]"),
  ]),
  DATABASE_URL_UNPOOLED: optional(postgresUrl),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /** Optional. Phones running an older app version are asked to update. */
  MIN_CLIENT_VERSION: optional(z.string().regex(/^\d+\.\d+\.\d+$/, "must look like 1.2.0")),
  /** Optional. Authorises the daily retention job (Vercel Cron sends it as a Bearer token). Unset = job off. */
  CRON_SECRET: optional(z.string().min(32, "must be at least 32 characters")),
});

export type ServerEnv = z.infer<typeof EnvSchema>;

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid server environment. Fix .env.local or the Vercel settings:\n${problems}`,
    );
  }
  cached = parsed.data;
  return cached;
}
