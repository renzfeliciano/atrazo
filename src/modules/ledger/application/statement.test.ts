import { describe, expect, it } from "vitest";
import { type Cents } from "@/core/money";
import { type Customer } from "../domain/customer";
import { type Entry } from "../domain/entry";
import { type CustomerId, type EntryId } from "../domain/ids";
import { buildStatement } from "./statement";

const NOW = new Date("2026-11-20T06:00:00Z");
const nena: Customer = {
  id: "0193a1b2-c3d4-7e5f-8a9b-0c1d2e3fabcd" as CustomerId,
  name: "Aling Nena",
  phone: null,
  note: null,
  creditLimit: null,
  createdAt: NOW,
  updatedAt: NOW,
  hiddenAt: null,
};
let n = 0;
const e = (kind: Entry["kind"], pesos: number, day: string, extra: Partial<Entry> = {}): Entry => ({
  id: `e${++n}` as EntryId,
  customerId: nena.id,
  kind,
  amount: (pesos * 100) as Cents,
  note: null,
  voidsEntryId: null,
  occurredAt: new Date(`${day}T04:00:00Z`),
  recordedAt: new Date(`${day}T04:00:00Z`),
  ...extra,
});

const oct1 = e("utang", 500, "2026-10-01");
const oct20 = e("bayad", -200, "2026-10-20");
const nov3 = e("utang", 350, "2026-11-03");
const mistake = e("utang", 999, "2026-11-04");
const voidIt = e("void", -999, "2026-11-04", { voidsEntryId: mistake.id });
const nov10 = e("bayad", -100, "2026-11-10");
const all = [nov10, oct1, voidIt, nov3, mistake, oct20];

describe("buildStatement", () => {
  it("covers everything, leaving voided entries out, and ends at the ledger balance", () => {
    const s = buildStatement(nena, all, { kind: "all" }, NOW);
    expect(s.rows.map((r) => r.entry.id)).toEqual([oct1.id, oct20.id, nov3.id, nov10.id]);
    expect(s.rows.map((r) => r.balance)).toEqual([50000, 30000, 65000, 55000]);
    expect(s).toMatchObject({
      opening: 0,
      totalUtang: 85000,
      totalBayad: 30000,
      balanceDue: 55000,
    });
    expect(s.from).toBeNull();
    expect(s.to).toBe("2026-11-20");
  });

  it("a month starts from the balance carried over", () => {
    const s = buildStatement(nena, all, { kind: "month", month: "2026-11" }, NOW);
    expect(s.opening).toBe(30000); // 500 − 200 from October
    expect(s.rows.map((r) => r.entry.id)).toEqual([nov3.id, nov10.id]);
    expect(s).toMatchObject({ totalUtang: 35000, totalBayad: 10000, balanceDue: 55000 });
    expect([s.from, s.to]).toEqual(["2026-11-01", "2026-11-20"]);
  });

  it("a past month ends on its last day, with its own balance due", () => {
    const s = buildStatement(nena, all, { kind: "month", month: "2026-10" }, NOW);
    expect([s.from, s.to]).toEqual(["2026-10-01", "2026-10-31"]);
    expect(s).toMatchObject({ opening: 0, balanceDue: 30000 });
  });

  it("since paid starts right after the balance reached zero, even on the same day", () => {
    const a = e("utang", 300, "2026-11-12");
    const paid = e("bayad", -300, "2026-11-12", { occurredAt: new Date("2026-11-12T05:00:00Z") });
    const again = e("utang", 120, "2026-11-12", { occurredAt: new Date("2026-11-12T07:00:00Z") });
    const s = buildStatement(
      nena,
      [a, paid, again],
      { kind: "since-paid", after: paid.occurredAt },
      NOW,
    );
    expect(s.opening).toBe(0);
    expect(s.rows.map((r) => r.entry.id)).toEqual([again.id]);
    expect(s).toMatchObject({
      totalUtang: 12000,
      totalBayad: 0,
      balanceDue: 12000,
      from: "2026-11-12",
    });
  });

  it("has a stable statement number for the client and closing day", () => {
    const s = buildStatement(nena, all, { kind: "all" }, NOW);
    expect(s.number).toBe("ST-20261120-ABCD");
  });
});
