import { type CreditPolicy, DEFAULT_POLICY } from "../domain/account";
import { type Customer } from "../domain/customer";
import { type Entry } from "../domain/entry";
import { type CustomerId, type EntryId } from "../domain/ids";
import { type ChangeOutbox, type LedgerChange, type LedgerDeps } from "./ports";

/**
 * In-memory adapters for the ledger ports. Used by use-case tests; the real IndexedDB adapters
 * must pass the same repository contract tests.
 */
export function inMemoryLedger(opts: { now?: () => Date; policy?: CreditPolicy } = {}) {
  const customers = new Map<CustomerId, Customer>();
  const entries = new Map<EntryId, Entry>();
  const queue: { entityId: string; change: LedgerChange; sent: boolean }[] = [];
  let n = 0;
  const nextId = (prefix: string) => `${prefix}-0000-7000-8000-${String(++n).padStart(12, "0")}`;

  const outbox: ChangeOutbox & { readonly queue: typeof queue; markAllSent(): void } = {
    queue,
    async enqueue(change) {
      const entityId = change.type === "entry.added" ? change.entry.id : change.customer.id;
      queue.push({ entityId, change, sent: false });
    },
    async isPending(entityId) {
      return queue.some((i) => i.entityId === entityId && !i.sent);
    },
    async pendingIds() {
      return new Set(queue.filter((i) => !i.sent).map((i) => i.entityId));
    },
    async discard(entityId) {
      const before = queue.length;
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i]!.entityId === entityId && !queue[i]!.sent) queue.splice(i, 1);
      }
      return queue.length < before;
    },
    markAllSent() {
      for (const i of queue) i.sent = true;
    },
  };

  const deps: LedgerDeps = {
    customers: {
      get: async (id) => customers.get(id),
      list: async () => [...customers.values()],
      save: async (c) => void customers.set(c.id, c),
    },
    entries: {
      get: async (id) => entries.get(id),
      listByCustomer: async (cid) => [...entries.values()].filter((e) => e.customerId === cid),
      listAll: async () => [...entries.values()],
      async add(e) {
        if (entries.has(e.id)) throw new Error(`Duplicate entry ${e.id}`);
        entries.set(e.id, e);
      },
      removeUnsynced: async (id) => void entries.delete(id),
    },
    outbox,
    settings: { getPolicy: async () => opts.policy ?? DEFAULT_POLICY },
    uow: { run: (work) => work() },
    ids: {
      customerId: () => nextId("00000000") as CustomerId,
      entryId: () => nextId("11111111") as EntryId,
    },
    clock: { now: opts.now ?? (() => new Date("2026-11-05T04:00:00Z")) },
  };

  return { deps, outbox, store: { customers, entries } };
}
