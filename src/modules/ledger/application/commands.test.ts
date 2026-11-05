import { afterEach, describe, expect, it } from "vitest";
import { ErrorCode } from "@/core/errors";
import { type Cents } from "@/core/money";
import { LocalDb } from "@/infrastructure/local-db/local-db";
import { type CustomerId, type EntryId } from "../domain/ids";
import { indexedDbLedger } from "../infrastructure/indexeddb-ledger";
import { ledgerCommands } from "./commands";
import { inMemoryLedger } from "./in-memory";
import { type LedgerDeps } from "./ports";
import { ledgerQueries } from "./queries";

const P = (pesos: number) => (pesos * 100) as Cents;

interface Harness {
  deps: LedgerDeps;
  markAllSent(): Promise<void>;
  close(): Promise<void>;
}

/** Every adapter must behave identically; this suite is the contract. */
const adapters: [string, (now: () => Date) => Harness][] = [
  [
    "in-memory",
    (now) => {
      const m = inMemoryLedger({ now });
      return {
        deps: m.deps,
        markAllSent: async () => m.outbox.markAllSent(),
        close: async () => {},
      };
    },
  ],
  [
    "indexeddb",
    (now) => {
      const db = new LocalDb(`test-${crypto.randomUUID()}`);
      const deps = indexedDbLedger(db, { now });
      return {
        deps,
        markAllSent: async () =>
          deps.outbox.markSent((await db.outbox.toArray()).map((r) => r.seq!)),
        close: async () => {
          db.close();
          await db.delete();
        },
      };
    },
  ],
];

describe.each(adapters)("ledger use cases (%s)", (_name, make) => {
  let h: Harness;
  let now = new Date("2026-11-05T04:00:00Z");
  const setup = () => {
    now = new Date("2026-11-05T04:00:00Z");
    h = make(() => now);
    return { cmd: ledgerCommands(h.deps), q: ledgerQueries(h.deps), deps: h.deps };
  };
  afterEach(() => h?.close());

  async function nena(cmd: ReturnType<typeof setup>["cmd"]) {
    const r = await cmd.createCustomer({
      name: "Aling Nena Santos",
      phone: "0917 123 4567",
      creditLimit: P(3000),
    });
    if (!r.ok) throw r.error;
    return r.value;
  }

  it("creates a customer and queues it for backup", async () => {
    const { cmd, deps } = setup();
    const c = await nena(cmd);
    expect(c.phone).toBe("+639171234567");
    expect(await deps.outbox.pendingIds()).toEqual(new Set([c.id]));
    expect(await deps.customers.get(c.id)).toEqual(c);
  });

  it("saves a starting balance as the first utang", async () => {
    const { cmd, q } = setup();
    const r = await cmd.createCustomer({ name: "Lorna", startingBalance: P(980) });
    if (!r.ok) throw r.error;
    const ledger = await q.customerLedger(r.value.id);
    expect(ledger?.account.balance).toBe(P(980));
    expect(ledger?.rows[0]).toMatchObject({
      type: "entry",
      pending: true,
      entry: { note: "Starting balance" },
    });
  });

  it("does not write anything when validation fails", async () => {
    const { cmd, deps } = setup();
    expect((await cmd.createCustomer({ name: "", startingBalance: P(-1) })).ok).toBe(false);
    expect(await deps.customers.list()).toHaveLength(0);
    expect((await deps.outbox.pendingIds()).size).toBe(0);
  });

  it("records utang and bayad and returns the new balance for the toast", async () => {
    const { cmd } = setup();
    const c = await nena(cmd);
    await cmd.recordEntry({ customerId: c.id, kind: "utang", amount: P(2150) });
    const r = await cmd.recordEntry({
      customerId: c.id,
      kind: "utang",
      amount: P(150),
      note: "Load",
    });
    expect(r.ok && r.value.account.balance).toBe(P(2300));
    const b = await cmd.recordEntry({ customerId: c.id, kind: "bayad", amount: P(500) });
    expect(b.ok && b.value.entry.amount).toBe(-P(500));
    expect(b.ok && b.value.account.balance).toBe(P(1800));
  });

  it("refuses entries for unknown or hidden customers", async () => {
    const { cmd } = setup();
    const missing = await cmd.recordEntry({
      customerId: "00000000-0000-7000-8000-999999999999" as CustomerId,
      kind: "utang",
      amount: P(1),
    });
    expect(!missing.ok && missing.error.code).toBe(ErrorCode.NotFound);
    const c = await nena(cmd);
    await cmd.setHidden(c.id, true);
    const hidden = await cmd.recordEntry({ customerId: c.id, kind: "utang", amount: P(1) });
    expect(!hidden.ok && hidden.error.code).toBe(ErrorCode.NotFound);
  });

  it("undo removes an entry that never left the phone, as if it never happened", async () => {
    const { cmd, q, deps } = setup();
    const c = await nena(cmd);
    const r = await cmd.recordEntry({ customerId: c.id, kind: "utang", amount: P(150) });
    if (!r.ok) throw r.error;
    const u = await cmd.undoEntry(r.value.entry.id);
    expect(u.ok && u.value).toBe("removed");
    expect((await q.customerLedger(c.id))?.rows).toHaveLength(0);
    expect(await deps.outbox.pendingIds()).toEqual(new Set([c.id]));
  });

  it("undo voids an entry that was already backed up, so other phones see the correction", async () => {
    const { cmd, q } = setup();
    const c = await nena(cmd);
    const r = await cmd.recordEntry({ customerId: c.id, kind: "utang", amount: P(150) });
    if (!r.ok) throw r.error;
    await h.markAllSent();
    const u = await cmd.undoEntry(r.value.entry.id);
    expect(u.ok && u.value).toBe("voided");
    const ledger = await q.customerLedger(c.id);
    expect(ledger?.account.balance).toBe(0);
    expect(ledger?.rows[0]).toMatchObject({ type: "voided", reason: "Undone", pending: true });
  });

  it("undo reports a missing entry", async () => {
    const { cmd } = setup();
    const u = await cmd.undoEntry("11111111-0000-7000-8000-000000000999" as EntryId);
    expect(!u.ok && u.error.code).toBe(ErrorCode.NotFound);
  });

  it("voids once and only once", async () => {
    const { cmd } = setup();
    const c = await nena(cmd);
    const r = await cmd.recordEntry({ customerId: c.id, kind: "utang", amount: P(100) });
    if (!r.ok) throw r.error;
    expect((await cmd.voidEntry(r.value.entry.id, "Entered twice")).ok).toBe(true);
    const again = await cmd.voidEntry(r.value.entry.id);
    expect(!again.ok && again.error.code).toBe(ErrorCode.Conflict);
  });

  it("updates and hides customers through validation", async () => {
    const { cmd } = setup();
    const c = await nena(cmd);
    expect((await cmd.updateCustomer(c.id, { name: " " })).ok).toBe(false);
    const good = await cmd.updateCustomer(c.id, { name: "Nena Santos", creditLimit: null });
    expect(good.ok && good.value.creditLimit).toBeNull();
    const hidden = await cmd.setHidden(c.id, true);
    expect(hidden.ok && hidden.value.hiddenAt).not.toBeNull();
  });

  it("builds the dashboard: total owed, overdue list, this week", async () => {
    const { cmd, q } = setup();
    now = new Date("2026-09-02T04:00:00Z");
    const ben = await cmd.createCustomer({ name: "Kuya Ben", creditLimit: P(1500) });
    const joy = await cmd.createCustomer({ name: "Joy" });
    if (!ben.ok || !joy.ok) throw new Error("setup");
    await cmd.recordEntry({ customerId: ben.value.id, kind: "utang", amount: P(1450) });

    now = new Date("2026-11-05T04:00:00Z");
    await cmd.recordEntry({ customerId: joy.value.id, kind: "utang", amount: P(100) });
    await cmd.recordEntry({ customerId: joy.value.id, kind: "bayad", amount: P(150) });

    const d = await q.dashboard();
    expect(d.totalOwed).toBe(P(1450));
    expect(d.owingCount).toBe(1);
    expect(d.toCollect.map((o) => o.customer.name)).toEqual(["Kuya Ben"]);
    expect(d.toCollect[0]?.account.daysUnpaid).toBe(64);
    expect(d.overdueTotal).toBe(P(1450));
    expect(d.week).toEqual({ utang: P(100), bayad: P(150), utangCount: 1, bayadCount: 1 });
  });

  it("excludes hidden customers from totals", async () => {
    const { cmd, q } = setup();
    const c = await nena(cmd);
    await cmd.recordEntry({ customerId: c.id, kind: "utang", amount: P(500) });
    await cmd.setHidden(c.id, true);
    const d = await q.dashboard();
    expect(d.totalOwed).toBe(0);
    expect(d.week.utangCount).toBe(0);
  });

  it("finds customers with the same name for the duplicate warning", async () => {
    const { cmd, q } = setup();
    await nena(cmd);
    expect(await q.findSameName("aling nena  santos")).toHaveLength(1);
    expect(await q.findSameName("Nena")).toHaveLength(0);
  });
});
