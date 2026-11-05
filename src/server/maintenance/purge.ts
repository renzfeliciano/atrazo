import { sql } from "drizzle-orm";
import { type Database, rowsOf } from "../db/database";

/**
 * Daily housekeeping, run by the scheduled job (see app/api/cron/purge). It keeps the promises in
 * the Privacy Policy and keeps the free database small:
 *   - a ledger that no phone has opened for `inactiveLedgerDays` is deleted, and with it (by cascade)
 *     its phones and every encrypted backup;
 *   - rate-limit windows older than `rateLimitHours` are dropped.
 * A listahan's own "Delete listahan" is immediate and doesn't wait for this job.
 */
export const RETENTION = { inactiveLedgerDays: 365, rateLimitHours: 48 } as const;

export interface PurgeResult {
  readonly ledgersDeleted: number;
  readonly rateLimitsDeleted: number;
}

export async function purgeExpired(
  db: Database,
  now: Date,
  policy = RETENTION,
): Promise<PurgeResult> {
  const ledgerCutoff = new Date(
    now.getTime() - policy.inactiveLedgerDays * 86_400_000,
  ).toISOString();
  const limitCutoff = new Date(now.getTime() - policy.rateLimitHours * 3_600_000).toISOString();

  const ledgers = rowsOf<{ id: string }>(
    await db.execute(sql`
      delete from ledgers s
      where s.created_at < ${ledgerCutoff}::timestamptz
        and not exists (
          select 1 from devices d
          where d.ledger_id = s.id and d.last_seen_at >= ${ledgerCutoff}::timestamptz
        )
      returning s.id`),
  );
  const limits = rowsOf<{ key: string }>(
    await db.execute(
      sql`delete from rate_limits where window_start < ${limitCutoff}::timestamptz returning key`,
    ),
  );
  return { ledgersDeleted: ledgers.length, rateLimitsDeleted: limits.length };
}
