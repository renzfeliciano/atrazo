import { add, type Cents, negate, ZERO } from "@/core/money";
import { LEDGER_TIME_ZONE } from "@/core/time";
import { effectiveEntries } from "@/modules/ledger/domain/account";
import { type Customer } from "@/modules/ledger/domain/customer";
import { type Entry } from "@/modules/ledger/domain/entry";

/**
 * "Download records": what a lender would copy into a notebook, one row per utang or bayad.
 *
 *   Borrower | Date | Type | Utang | Bayad | Balance | Note
 *
 * Grouped by borrower (A–Z), oldest first, with each borrower's running balance, so the last row
 * of a borrower is what they owe today. Voided entries are left out (as on statements), so every
 * balance matches the app. Amounts are plain numbers, ready to add up in Excel or Google Sheets.
 */
const HEADER = ["Borrower", "Date", "Type", "Utang", "Bayad", "Balance", "Note"].join(",");

const dateFmt = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: LEDGER_TIME_ZONE,
});

/** Quotes a cell when needed (commas, quotes, line breaks). */
function quote(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Typed text (names, notes) also has spreadsheet formulas defused: a note like "=HYPERLINK(…)"
 * would otherwise run when the file is opened. Amounts are written as plain numbers instead.
 */
function text(value: string): string {
  return quote(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);
}

/** Pesos with two decimals and no grouping, so spreadsheets read it as a number. */
const pesos = (cents: number) => (cents / 100).toFixed(2);

export function recordsToCsv(customers: readonly Customer[], entries: readonly Entry[]): string {
  const byCustomer = new Map<string, Entry[]>();
  for (const e of entries) {
    const list = byCustomer.get(e.customerId) ?? [];
    list.push(e);
    byCustomer.set(e.customerId, list);
  }
  const borrowers = [...customers].sort((a, b) =>
    a.name.localeCompare(b.name, "en-PH", { sensitivity: "base" }),
  );

  const rows: string[] = [];
  for (const c of borrowers) {
    let balance: Cents = ZERO;
    for (const e of effectiveEntries(byCustomer.get(c.id) ?? [])) {
      balance = add(balance, e.amount);
      const isUtang = e.kind === "utang";
      rows.push(
        [
          text(c.name),
          quote(dateFmt.format(e.occurredAt)),
          isUtang ? "Utang" : "Bayad",
          isUtang ? pesos(e.amount) : "",
          isUtang ? "" : pesos(negate(e.amount)),
          pesos(balance),
          text(e.note ?? ""),
        ].join(","),
      );
    }
  }
  // The byte-order mark makes Excel open the file as UTF-8 (₱, ñ and the like survive).
  return "﻿" + [HEADER, ...rows].join("\r\n") + "\r\n";
}
