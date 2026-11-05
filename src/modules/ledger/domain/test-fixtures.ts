import { type Cents } from "@/core/money";
import { type Entry, type EntryKind } from "./entry";
import { type CustomerId, type EntryId } from "./ids";

export const NENA = "00000000-0000-7000-8000-000000000001" as CustomerId;

let seq = 0;
export function eid(): EntryId {
  seq += 1;
  return `00000000-0000-7000-8000-${String(seq).padStart(12, "0")}` as EntryId;
}

/** Manila date at noon, so tests are not affected by the runner's time zone. */
export const day = (ymd: string) => new Date(`${ymd}T04:00:00Z`);

export function e(
  ymd: string,
  kind: EntryKind,
  pesos: number,
  extra: Partial<Pick<Entry, "id" | "note" | "voidsEntryId" | "recordedAt">> = {},
): Entry {
  const sign = kind === "utang" ? 1 : -1;
  const amount = (kind === "void" ? pesos * 100 : sign * pesos * 100) as Cents;
  return {
    id: extra.id ?? eid(),
    customerId: NENA,
    kind,
    amount,
    note: extra.note ?? null,
    voidsEntryId: extra.voidsEntryId ?? null,
    occurredAt: day(ymd),
    recordedAt: extra.recordedAt ?? day(ymd),
  };
}

/** Aling Nena's page from the approved design: paid off Sep 30, owes ₱2,300 on Nov 5, 2026. */
export function nenaLedger(): Entry[] {
  const softdrinks = e("2026-11-03", "utang", 100, { note: "Softdrinks" });
  return [
    e("2026-09-12", "utang", 650, { note: "Bigas 5kg" }),
    e("2026-09-30", "bayad", 650, { note: "Bayad, GCash" }),
    e("2026-10-02", "utang", 800, { note: "Grocery" }),
    e("2026-10-20", "utang", 1500, { note: "LPG refill" }),
    e("2026-10-28", "bayad", 500, { note: "Bayad, cash" }),
    softdrinks,
    e("2026-11-03", "void", -100, { voidsEntryId: softdrinks.id, note: "Entered twice" }),
    e("2026-11-03", "utang", 350, { note: "Bigas 2kg, mantika" }),
    e("2026-11-05", "utang", 150, { note: "Load" }),
  ];
}
