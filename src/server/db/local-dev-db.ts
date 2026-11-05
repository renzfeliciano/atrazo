import "server-only";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type Database } from "./database";

/**
 * Local development without a Neon account: a real Postgres engine (PGlite) persisted to ./.data,
 * migrated with the same SQL files as production. Enabled with DATABASE_URL=pglite; refused in production.
 */
const globalForDb = globalThis as unknown as { atrazoDevDb?: Promise<Database> };

export function localDevDatabase(): Promise<Database> {
  // Kept on globalThis so hot reloads reuse one database instead of opening it again.
  globalForDb.atrazoDevDb ??= (async () => {
    const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
      import("@electric-sql/pglite"),
      import("drizzle-orm/pglite"),
      import("drizzle-orm/pglite/migrator"),
    ]);
    const dir = join(process.cwd(), ".data", "pglite");
    mkdirSync(dir, { recursive: true }); // PGlite does not create parent folders
    const client = new PGlite(dir);
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "drizzle" });
    return db as unknown as Database;
  })().catch((e: unknown) => {
    globalForDb.atrazoDevDb = undefined; // let the next request retry instead of caching the failure
    throw e;
  });
  return globalForDb.atrazoDevDb;
}
