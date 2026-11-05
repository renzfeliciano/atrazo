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
    [nena],
    [
      entry("e3", "void", -15000, "2026-11-05", { voidsEntryId: "e2" as EntryId }),
      entry("e1", "utang", 50000, "2026-11-03", { note: "Bigas, mantika" }),
      entry("e2", "utang", 15000, "2026-11-04"),
      entry("e4", "bayad", -20000, "2026-11-05", { note: '=HYPERLINK("x")' }),
    ],
  );
  const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n");

  it("starts with a BOM and a header, one row per entry, oldest first", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines[0]).toBe(
      "Borrower,Mobile,Date,Type,Amount (PHP),Note,Voids entry,Entry ID,Recorded at (UTC)",
    );
    expect(lines).toHaveLength(5);
    expect(lines.slice(1).map((l) => l.split(",").at(-2))).toEqual(["e1", "e2", "e3", "e4"]);
  });

  it("quotes commas and quotes, and writes signed plain numbers", () => {
    expect(lines[1]).toBe(
      '"Aling ""Nena"", Santos",0917 123 4567,2026-11-03,Utang,500.00,"Bigas, mantika",,e1,2026-11-03T04:00:00.000Z',
    );
    expect(lines[3]).toContain(",Void,-150.00,,e2,e3,");
  });

  it("defuses spreadsheet formulas in notes", () => {
    expect(lines[4]).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it("adds up to the ledger balance", () => {
    const total = lines
      .slice(1)
      .reduce((sum, l) => sum + Number(l.match(/,(-?\d+\.\d{2}),/)![1]), 0);
    expect(total).toBe(300); // 500 + 150 − 150 − 200
  });
});
