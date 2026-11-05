import { v7 as uuidv7 } from "uuid";
import { type Cents } from "@/core/money";
import { type Clock, systemClock } from "@/core/time";
import { type LocalDb } from "@/infrastructure/local-db/local-db";
import { type CreditPolicy, DEFAULT_POLICY } from "../domain/account";
import { type CustomerId, type EntryId } from "../domain/ids";
import { type ChangeOutbox, type LedgerChange, type LedgerDeps } from "../application/ports";

export const POLICY_KEY = "creditPolicy";

/** Ledger ports backed by the phone's IndexedDB. */
export function indexedDbLedger(db: LocalDb, clock: Clock = systemClock): LedgerDeps & { outbox: ChangeOutbox & { markSent(seqs: number[]): Promise<void> } } {
  const outbox = {
    async enqueue(change: LedgerChange) {
      const entityId = change.type === "entry.added" ? change.entry.id : change.customer.id;
      await db.outbox.add({ entityId, change, createdAt: clock.now() });
    },
    async isPending(entityId: string) {
      return (await db.outbox.where("entityId").equals(entityId).count()) > 0;
    },
    async pendingIds() {
      return new Set((await db.outbox.toArray()).map((r) => r.entityId));
    },
    async discard(entityId: string) {
      // Only changes not yet sealed into an uploading bundle can be withdrawn.
      return (await db.outbox.where("entityId").equals(entityId).filter((r) => !r.bundleId).delete()) > 0;
    },
    async markSent(seqs: number[]) {
      await db.outbox.bulkDelete(seqs);
    },
  };

  return {
    customers: {
      get: (id) => db.customers.get(id),
      list: () => db.customers.toArray(),
      save: async (c) => void (await db.customers.put(c)),
    },
    entries: {
      get: (id) => db.entries.get(id),
      listByCustomer: (cid) => db.entries.where("customerId").equals(cid).toArray(),
      listAll: () => db.entries.toArray(),
      add: async (e) => void (await db.entries.add(e)),
      removeUnsynced: (id) => db.entries.delete(id),
    },
    outbox,
    settings: {
      async getPolicy(): Promise<CreditPolicy> {
        const row = await db.settings.get(POLICY_KEY);
        const v = row?.value as Partial<CreditPolicy> | undefined;
        return {
          defaultLimit: (v?.defaultLimit ?? DEFAULT_POLICY.defaultLimit) as Cents,
          overdueAfterDays: v?.overdueAfterDays ?? DEFAULT_POLICY.overdueAfterDays,
        };
      },
    },
    uow: {
      // One IndexedDB transaction over every table a ledger write can touch.
      run: (work) => db.transaction("rw", [db.customers, db.entries, db.outbox, db.settings], work),
    },
    ids: {
      customerId: () => uuidv7() as CustomerId,
      entryId: () => uuidv7() as EntryId,
    },
    clock,
  };
}
