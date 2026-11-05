import { type PgDatabase, type PgQueryResultHKT } from "drizzle-orm/pg-core";

/**
 * Any Drizzle Postgres database: Neon over HTTP in production, PGlite in tests.
 * Repositories depend on this type only, never on a specific driver.
 */
export type Database = PgDatabase<PgQueryResultHKT>;

/** Postgres unique-violation, unwrapping Drizzle's error wrapper. */
export function isUniqueViolation(e: unknown): boolean {
  for (let cur: unknown = e, depth = 0; cur && depth < 4; depth++) {
    if (typeof cur === "object" && (cur as { code?: unknown }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

/** Rows from `db.execute`, which every supported driver returns as `{ rows }`. */
export function rowsOf<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}
