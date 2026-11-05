import { and, asc, eq, gt, sql } from "drizzle-orm";
import { type Database, rowsOf } from "@/server/db/database";
import { changes } from "@/server/db/schema";
import { type ChangeLogRepository } from "../application/sync-service";

export function postgresChangeLog(db: Database): ChangeLogRepository {
  return {
    async append(session, batch) {
      const payload = JSON.stringify(batch.map((c) => ({ id: c.id, iv: c.iv, ct: c.ciphertext })));
      // The per-ledger advisory lock (held until this statement commits) makes pushes for one ledger
      // commit in sequence order, so a pull can never skip a lower seq that commits later.
      const result = await db.execute(sql`
        with lock as (select pg_advisory_xact_lock(hashtextextended(${session.ledgerId}::text, 0)))
        insert into ${changes} (ledger_id, id, device_id, iv, ciphertext)
        select ${session.ledgerId}::uuid, v.id::uuid, ${session.deviceId}::uuid, v.iv, v.ct
        from lock, jsonb_to_recordset(${payload}::jsonb) as v(id text, iv text, ct text)
        on conflict (ledger_id, id) do nothing
        returning seq`);
      return rowsOf(result).length;
    },

    async after(ledgerId, after, limit) {
      const rows = await db
        .select({
          seq: changes.seq,
          id: changes.id,
          iv: changes.iv,
          ciphertext: changes.ciphertext,
          deviceId: changes.deviceId,
        })
        .from(changes)
        .where(and(eq(changes.ledgerId, ledgerId), gt(changes.seq, after)))
        .orderBy(asc(changes.seq))
        .limit(limit);
      return rows.map((r) => ({ ...r, seq: BigInt(r.seq) }));
    },
  };
}
