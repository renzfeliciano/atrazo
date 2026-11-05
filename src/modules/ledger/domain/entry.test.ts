import { describe, expect, it } from "vitest";
import { ErrorCode } from "@/core/errors";
import { type Cents } from "@/core/money";
import { recordEntry, voidEntry } from "./entry";
import { day, e, eid, NENA } from "./test-fixtures";

const now = day("2026-11-05");
const draft = { id: eid(), customerId: NENA, kind: "utang" as const, amount: 15_000 as Cents, occurredAt: now };

describe("recordEntry", () => {
  it("signs amounts by kind", () => {
    const u = recordEntry(draft, now);
    const b = recordEntry({ ...draft, id: eid(), kind: "bayad", amount: 50_000 as Cents }, now);
    expect(u.ok && u.value.amount).toBe(15_000);
    expect(b.ok && b.value.amount).toBe(-50_000);
  });

  it("cleans the note and stores none when blank", () => {
    const r = recordEntry({ ...draft, note: "   Bigas   2kg  " }, now);
    expect(r.ok && r.value.note).toBe("Bigas 2kg");
    const blank = recordEntry({ ...draft, note: "   " }, now);
    expect(blank.ok && blank.value.note).toBeNull();
  });

  it.each([
    ["zero", 0],
    ["negative", -100],
    ["fractional centavos", 10.5],
    ["absurdly large", 1_000_000_001],
  ])("rejects a %s amount", (_label, amount) => {
    const r = recordEntry({ ...draft, amount: amount as Cents }, now);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe(ErrorCode.Validation);
    expect(!r.ok && r.error.issues[0]?.field).toBe("amount");
  });

  it("rejects dates more than a day in the future but allows back-dating", () => {
    expect(recordEntry({ ...draft, occurredAt: day("2026-11-07") }, now).ok).toBe(false);
    expect(recordEntry({ ...draft, occurredAt: day("2026-01-02") }, now).ok).toBe(true);
  });

  it("rejects notes over 120 characters", () => {
    expect(recordEntry({ ...draft, note: "x".repeat(121) }, now).ok).toBe(false);
  });
});

describe("voidEntry", () => {
  it("cancels exactly the original amount", () => {
    const original = e("2026-11-03", "utang", 100);
    const r = voidEntry(original, [original], { id: eid(), reason: "Entered twice" }, now);
    expect(r.ok && r.value).toMatchObject({ kind: "void", amount: -10_000, voidsEntryId: original.id, note: "Entered twice" });
  });

  it("refuses to void twice or to void a void", () => {
    const original = e("2026-11-03", "bayad", 100);
    const first = voidEntry(original, [original], { id: eid() }, now);
    if (!first.ok) throw first.error;
    expect(voidEntry(original, [original, first.value], { id: eid() }, now).ok).toBe(false);
    const again = voidEntry(first.value, [original, first.value], { id: eid() }, now);
    expect(!again.ok && again.error.code).toBe(ErrorCode.Conflict);
  });
});
