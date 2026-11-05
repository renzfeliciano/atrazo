import { sql } from "drizzle-orm";
import { type Database, rowsOf } from "../db/database";

/**
 * Daily housekeeping, run by the scheduled job (see app/api/cron/purge). It keeps the promises in
 * the Privacy Policy and keeps the free database small:
 *   - a store that no phone has opened for `inactiveStoreDays` is deleted, and with it (by cascade)
 *     its phones and every encrypted backup;
 *   - rate-limit windows older than `rateLimitHours` are dropped.
 * A store's own "Delete store" is immediate and doesn't wait for this job.
 */
export const RETENTION = { inactiveStoreDays: 365, rateLimitHours: 48 } as const;

export interface PurgeResult {
  readonly storesDeleted: number;
  readonly rateLimitsDeleted: number;
}

export async function purgeExpired(
  db: Database,
  now: Date,
  policy = RETENTION,
): Promise<PurgeResult> {
  const storeCutoff = new Date(now.getTime() - policy.inactiveStoreDays * 86_400_000).toISOString();
  const limitCutoff = new Date(now.getTime() - policy.rateLimitHours * 3_600_000).toISOString();

  const stores = rowsOf<{ id: string }>(
    await db.execute(sql`
      delete from stores s
      where s.created_at < ${storeCutoff}::timestamptz
        and not exists (
          select 1 from devices d
          where d.store_id = s.id and d.last_seen_at >= ${storeCutoff}::timestamptz
        )
      returning s.id`),
  );
  const limits = rowsOf<{ key: string }>(
    await db.execute(
      sql`delete from rate_limits where window_start < ${limitCutoff}::timestamptz returning key`,
    ),
  );
  return { storesDeleted: stores.length, rateLimitsDeleted: limits.length };
}
