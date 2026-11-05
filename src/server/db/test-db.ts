import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { type Database } from "./database";

/**
 * A real Postgres engine in-process (PGlite), migrated with the same SQL files production uses.
 * Integration tests run against this instead of mocks.
 */
export async function createTestDatabase(): Promise<{
  db: Database;
  reset(): Promise<void>;
  close(): Promise<void>;
}> {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "drizzle" });
  return {
    db: db as unknown as Database,
    reset: async () =>
      void (await db.execute(sql`truncate ledgers, devices, changes, rate_limits cascade`)),
    close: () => client.close(),
  };
}
