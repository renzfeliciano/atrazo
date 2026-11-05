import { describe, expect, it } from "vitest";
import { type Cents } from "@/core/money";
import { type Customer } from "@/modules/ledger/domain/customer";
import { type Entry } from "@/modules/ledger/domain/entry";
import { type CustomerId, type EntryId } from "@/modules/ledger/domain/ids";
import { recordsToCsv } from "./records-csv";

const at = (iso: string) => new Date(iso);
const nena: Customer = {
  id: "c1" as CustomerId,
  name: 'Aling "Nena", Santos',
  phone: "+639171234567",
  note: null,
  creditLimit: null,
  createdAt: at("2026-11-01T00:00:00Z"),
  updatedAt: at("2026-11-01T00:00:00Z"),
  hiddenAt: null,
};
const ben: Customer = { ...nena, id: "c2" as CustomerId, name: "Ben Cruz", phone: null };
const entry = (
  id: string,
  kind: Entry["kind"],
  amount: number,
  day: string,
  extra: Partial<Entry> = {},
): Entry => ({
  id: id as EntryId,
  customerId: nena.id,
  kind,
  amount: amount as Cents,
  note: null,
  voidsEntryId: null,
  occurredAt: at(`${day}T04:00:00Z`),
  recordedAt: at(`${day}T04:00:00Z`),
  ...extra,
});

describe("recordsToCsv", () => {
  const csv = recordsToCsv(
    [nena, ben],
    [
      entry("e3", "void", -15000, "2026-11-05", { voidsEntryId: "e2" as EntryId }),
      entry("e1", "utang", 50000, "2026-11-03", { note: "Bigas, mantika" }),
      entry("e2", "utang", 15000, "2026-11-04"),
      entry("e4", "bayad", -20000, "2026-11-05", { note: '=HYPERLINK("x")' }),
      entry("e5", "utang", 7550, "2026-11-02", { customerId: ben.id }),
    ],
  );
  const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n");

  it("starts with a BOM and a plain header, with no ids or timestamps", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines[0]).toBe("Borrower,Date,Type,Utang,Bayad,Balance,Note");
    expect(csv).not.toMatch(/\be\d\b|T04:00|\+639/);
  });

  it("groups by borrower A–Z, oldest first, and leaves voided entries out", () => {
    expect(lines.slice(1)).toEqual([
      '"Aling ""Nena"", Santos","Nov 3, 2026",Utang,500.00,,500.00,"Bigas, mantika"',
      `"Aling ""Nena"", Santos","Nov 5, 2026",Bayad,,200.00,300.00,"'=HYPERLINK(""x"")"`,
      'Ben Cruz,"Nov 2, 2026",Utang,75.50,,75.50,',
    ]);
  });

  it("ends each borrower on what the app shows they owe", () => {
    const last = (name: string) =>
      lines
        .filter((l) => l.includes(name))
        .at(-1)!
        .split(",");
    expect(last("Nena").at(-2)).toBe("300.00");
    expect(last("Ben Cruz").at(-2)).toBe("75.50");
  });
});
