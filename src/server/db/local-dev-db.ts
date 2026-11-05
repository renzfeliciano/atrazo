import "server-only";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Database } from "./database";

/**
 * Local development without a Neon account: a real Postgres engine (PGlite) persisted to ./.data,
 * migrated with the same SQL files as production. Enabled with DATABASE_URL=pglite (or pglite:<name>
 * for a separate database); refused in production.
 *
 * PGlite is single-process: two dev servers opening the same folder corrupt it. A lock file records
 * the owning process, and a second server gets a clear error instead of a damaged database.
 */
// One database per folder per process, cached on globalThis under a key that never changes, so hot
// reloads reuse the open instance. (Opening a second PGlite on the same folder corrupts it.)
const globalForDb = globalThis as unknown as { __atrazoDevDbs?: Map<string, Promise<Database>> };
const open = (globalForDb.__atrazoDevDbs ??= new Map());

export class DevDatabaseInUseError extends Error {
  constructor(dir: string, pid: number) {
    super(
      `The local database in ${dir} is already used by another dev server (process ${pid}). ` +
        `Stop that server, or give this one its own database with DATABASE_URL=pglite:<name>.`,
    );
    this.name = "DevDatabaseInUseError";
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function claim(dir: string): void {
  const lock = join(dir, "atrazo-dev.lock");
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, "utf8"));
    if (pid && pid !== process.pid && isAlive(pid)) throw new DevDatabaseInUseError(dir, pid);
  }
  writeFileSync(lock, String(process.pid));
}

export function localDevDatabase(url: string): Promise<Database> {
  const name = url.startsWith("pglite:")
    ? url.slice("pglite:".length).replace(/[^a-z0-9-]/gi, "") || "pglite"
    : "pglite";
  const dir = join(process.cwd(), ".data", name);
  const cached = open.get(dir);
  if (cached) return cached;
  const opening = (async () => {
    mkdirSync(dir, { recursive: true }); // PGlite does not create parent folders
    claim(dir);
    const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
      import("@electric-sql/pglite"),
      import("drizzle-orm/pglite"),
      import("drizzle-orm/pglite/migrator"),
    ]);
    const pg = new PGlite(dir);
    const db = drizzle(pg);
    await migrate(db, { migrationsFolder: "drizzle" });
    return db as unknown as Database;
  })().catch((e: unknown) => {
    open.delete(dir); // let the next request retry instead of caching the failure
    throw e;
  });
  open.set(dir, opening);
  return opening;
}
