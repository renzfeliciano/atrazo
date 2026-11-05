import { type LocalDb } from "@/infrastructure/local-db/local-db";
import { type CodecRegistry, type WireRecord } from "../domain/bundle";
import { type Inbox, type SealedBundle, type SyncOutbox } from "../application/phone-ports";

const BUNDLE_KEY = "sync.lockedBundle";
const CURSOR_KEY = "sync.cursor";

/** The outbox as the sync engine sees it. `toWire` maps a module's stored change to a wire record. */
export function indexedDbSyncOutbox(
  db: LocalDb,
  toWire: (change: unknown) => WireRecord,
): SyncOutbox {
  return {
    async peek(limit) {
      const rows = await db.outbox
        .orderBy("seq")
        .filter((r) => !r.bundleId)
        .limit(limit)
        .toArray();
      return rows.map((r) => ({ seq: r.seq!, record: toWire(r.change) }));
    },
    async lockIntoBundle(bundle, seqs) {
      await db.transaction("rw", [db.outbox, db.device], async () => {
        await db.device.put({ key: BUNDLE_KEY, value: bundle });
        await db.outbox
          .where("seq")
          .anyOf([...seqs])
          .modify({ bundleId: bundle.id });
      });
    },
    async lockedBundle() {
      return (await db.device.get(BUNDLE_KEY))?.value as SealedBundle | undefined;
    },
    async confirmBundle(bundleId) {
      await db.transaction("rw", [db.outbox, db.device], async () => {
        await db.outbox.where("bundleId").equals(bundleId).delete();
        await db.device.delete(BUNDLE_KEY);
      });
    },
    pendingCount: () => db.outbox.count(),
  };
}

/**
 * Applies pulled records through the codec registry, keeping unknown or malformed records in
 * `deferred` (never dropping data), and advances the cursor in the same transaction. After an
 * app update, `replayDeferred` applies the kept records this version now understands.
 */
export function indexedDbInbox<Ctx extends { db: LocalDb }>(
  db: LocalDb,
  registry: CodecRegistry<Ctx>,
  ctx: Ctx,
): Inbox {
  return {
    async cursor() {
      return ((await db.device.get(CURSOR_KEY))?.value as string | undefined) ?? "0";
    },
    async applyPage(records, nextCursor) {
      let applied = 0;
      let deferred = 0;
      await db.transaction(
        "rw",
        [db.customers, db.entries, db.entryNotes, db.settings, db.deferred, db.device],
        async () => {
          for (const r of records) {
            const codec = registry.find(r);
            const parsed = codec?.schema.safeParse(r.d);
            if (codec && parsed?.success) {
              await codec.apply(parsed.data, ctx);
              applied += 1;
            } else {
              await db.deferred.add({ type: r.t, version: r.v, data: r.d, receivedAt: new Date() });
              deferred += 1;
            }
          }
          await db.device.put({ key: CURSOR_KEY, value: nextCursor });
        },
      );
      return { applied, deferred };
    },
    async replayDeferred() {
      let applied = 0;
      await db.transaction(
        "rw",
        [db.customers, db.entries, db.entryNotes, db.settings, db.deferred],
        async () => {
          // Oldest first, as they arrived, so a later record still wins over an earlier one.
          for (const row of await db.deferred.orderBy("id").toArray()) {
            const codec = registry.find({ t: row.type, v: row.version, d: row.data });
            const parsed = codec?.schema.safeParse(row.data);
            if (!codec || !parsed?.success) continue;
            await codec.apply(parsed.data, ctx);
            await db.deferred.delete(row.id!);
            applied += 1;
          }
        },
      );
      return applied;
    },
  };
}
