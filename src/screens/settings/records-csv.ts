import { ledgerDay } from "@/core/time";
import { type Customer, formatPhilippineMobile } from "@/modules/ledger/domain/customer";
import { type Entry } from "@/modules/ledger/domain/entry";

/**
 * "Download all records": every entry, one row each, oldest first, readable in Excel or Google
 * Sheets. Voided entries stay in (as the ledger shows them) with the void as its own row, so the
 * file adds up to the same balances as the app.
 */
const HEADER = [
  "Borrower",
  "Mobile",
  "Date",
  "Type",
  "Amount (PHP)",
  "Note",
  "Voids entry",
  "Entry ID",
  "Recorded at (UTC)",
].join(",");

const TYPE: Record<Entry["kind"], string> = { utang: "Utang", bayad: "Bayad", void: "Void" };

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

/** Signed pesos with two decimals and no grouping, so spreadsheets read it as a number. */
const pesos = (cents: number) => (cents / 100).toFixed(2);

export function recordsToCsv(customers: readonly Customer[], entries: readonly Entry[]): string {
  const byId = new Map(customers.map((c) => [c.id, c]));
  const rows = [...entries]
    .sort(
      (a, b) =>
        a.occurredAt.getTime() - b.occurredAt.getTime() ||
        a.recordedAt.getTime() - b.recordedAt.getTime(),
    )
    .map((e) => {
      const c = byId.get(e.customerId);
      return [
        text(c?.name ?? "(unknown borrower)"),
        c?.phone ? formatPhilippineMobile(c.phone) : "",
        ledgerDay(e.occurredAt),
        TYPE[e.kind],
        pesos(e.amount),
        text(e.note ?? ""),
        e.voidsEntryId ?? "",
        e.id,
        e.recordedAt.toISOString(),
      ].join(",");
    });
  // The byte-order mark makes Excel open the file as UTF-8 (₱, ñ and the like survive).
  return "﻿" + [HEADER, ...rows].join("\r\n") + "\r\n";
}
