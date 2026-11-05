import { sql } from "drizzle-orm";
import { type RateLimiter } from "@/modules/identity/application/ports";
import { type Database, rowsOf } from "@/server/db/database";
import { rateLimits } from "@/server/db/schema";

/**
 * Fixed-window rate limiter on Postgres: one atomic upsert per hit, no extra service needed
 * (keeps Atrazo on free tiers). Keys must already be hashed: no raw IPs are stored.
 */
export function postgresRateLimiter(
  db: Database,
  clock: { now(): Date } = { now: () => new Date() },
): RateLimiter {
  return {
    async hit(key, limit, windowSeconds) {
      const nowMs = clock.now().getTime();
      const windowMs = windowSeconds * 1000;
      const windowStart = new Date(Math.floor(nowMs / windowMs) * windowMs).toISOString();
      const result = await db.execute(sql`
        insert into ${rateLimits} (key, window_start, count)
        values (${key}, ${windowStart}::timestamptz, 1)
        on conflict (key) do update set
          count = case when ${rateLimits.windowStart} = excluded.window_start then ${rateLimits.count} + 1 else 1 end,
          window_start = excluded.window_start
        returning count`);
      const count = Number(rowsOf<{ count: number }>(result)[0]?.count ?? 1);

      // Occasionally clear windows older than a day, so the table stays tiny.
      if (Math.random() < 0.01) {
        await db.execute(
          sql`delete from ${rateLimits} where ${rateLimits.windowStart} < now() - interval '1 day'`,
        );
      }

      const retryAfterSeconds = Math.ceil((Date.parse(windowStart) + windowMs - nowMs) / 1000);
      return { allowed: count <= limit, retryAfterSeconds };
    },
  };
}
