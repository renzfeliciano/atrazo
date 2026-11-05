import { describe, expect, it } from "vitest";
import { type Cents } from "@/core/money";
import { buildLedger, DEFAULT_POLICY, summarizeAccount } from "./account";
import { day, e, nenaLedger } from "./test-fixtures";

const NOV5 = day("2026-11-05");

describe("summarizeAccount", () => {
  it("matches Aling Nena's numbers in the design", () => {
    const s = summarizeAccount(nenaLedger(), DEFAULT_POLICY, 300_000 as Cents, NOV5);
    expect(s.balance).toBe(230_000);
    expect(s.utangSinceSettled).toBe(280_000);
    expect(s.bayadSinceSettled).toBe(50_000);
    expect(s.settledAt).toEqual(day("2026-09-30"));
    expect(s.openSince).toEqual(day("2026-10-02"));
    expect(s.lastBayadAt).toEqual(day("2026-10-28"));
    expect(s.limitUsedPercent).toBe(77);
    expect(s.isOverLimit).toBe(false);
  });

  it("restarts days-unpaid after the borrower is fully paid (old debt never makes them overdue)", () => {
    const entries = [
      e("2026-06-01", "utang", 500),
      e("2026-06-20", "bayad", 500),
      e("2026-11-01", "utang", 200),
    ];
    const s = summarizeAccount(entries, DEFAULT_POLICY, null, NOV5);
    expect(s.openSince).toEqual(day("2026-11-01"));
    expect(s.daysUnpaid).toBe(4);
    expect(s.isOverdue).toBe(false);
  });

  it("keeps counting from the first unpaid utang while a balance remains", () => {
    const entries = [
      e("2026-09-02", "utang", 1450),
      e("2026-10-01", "bayad", 200),
      e("2026-10-15", "utang", 200),
    ];
    const s = summarizeAccount(entries, DEFAULT_POLICY, null, NOV5);
    expect(s.daysUnpaid).toBe(64);
    expect(s.isOverdue).toBe(true);
  });

  it("flags over limit with the amount over", () => {
    const s = summarizeAccount(
      [e("2026-11-01", "utang", 1850)],
      DEFAULT_POLICY,
      150_000 as Cents,
      NOV5,
    );
    expect(s.isOverLimit).toBe(true);
    expect(s.overLimitBy).toBe(35_000);
    expect(s.limitUsedPercent).toBe(100);
  });

  it("uses the ledger default limit when the borrower has none", () => {
    const s = summarizeAccount([e("2026-11-01", "utang", 1200)], DEFAULT_POLICY, null, NOV5);
    expect(s.limit).toBe(100_000);
    expect(s.isOverLimit).toBe(true);
  });

  it("reports paid-ahead balances", () => {
    const s = summarizeAccount(
      [e("2026-11-01", "utang", 100), e("2026-11-02", "bayad", 150)],
      DEFAULT_POLICY,
      null,
      NOV5,
    );
    expect(s.balance).toBe(-5_000);
    expect(s.isPaidAhead).toBe(true);
    expect(s.daysUnpaid).toBe(0);
    expect(s.limitUsedPercent).toBe(0);
  });

  it("ignores voided entries entirely, including for days-unpaid", () => {
    const wrong = e("2026-08-01", "utang", 900);
    const entries = [
      wrong,
      e("2026-08-02", "void", -900, { voidsEntryId: wrong.id }),
      e("2026-11-03", "utang", 50),
    ];
    const s = summarizeAccount(entries, DEFAULT_POLICY, null, NOV5);
    expect(s.balance).toBe(5_000);
    expect(s.openSince).toEqual(day("2026-11-03"));
  });

  it("is a clean zero for a borrower with no entries", () => {
    const s = summarizeAccount([], DEFAULT_POLICY, null, NOV5);
    expect(s).toMatchObject({
      balance: 0,
      daysUnpaid: 0,
      openSince: null,
      lastEntryAt: null,
      isOverdue: false,
    });
  });

  it("does not depend on the order entries are stored in", () => {
    const shuffled = [...nenaLedger()].reverse();
    expect(summarizeAccount(shuffled, DEFAULT_POLICY, null, NOV5).balance).toBe(230_000);
  });
});

describe("buildLedger", () => {
  it("lists newest first with running balances, folded voids and a fully-paid marker", () => {
    const rows = buildLedger(nenaLedger());
    const summary = rows.map((r) =>
      r.type === "entry"
        ? `${r.entry.note}:${r.balanceAfter}`
        : r.type === "voided"
          ? `void:${r.entry.note}:${r.reason}`
          : "settled",
    );
    expect(summary).toEqual([
      "Load:230000",
      "Bigas 2kg, mantika:215000",
      "void:Softdrinks:Entered twice",
      "Bayad, cash:180000",
      "LPG refill:230000",
      "Grocery:80000",
      "settled",
      "Bayad, GCash:0",
      "Bigas 5kg:65000",
    ]);
  });

  it("marks entries that are not backed up yet", () => {
    const entries = nenaLedger();
    const last = entries.at(-1)!;
    const rows = buildLedger(entries, (id) => id === last.id);
    expect(rows[0]).toMatchObject({ type: "entry", pending: true });
    expect(rows[1]).toMatchObject({ type: "entry", pending: false });
  });
});
