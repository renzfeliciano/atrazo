import { add, type Cents, ZERO } from "@/core/money";
import { calendarDaysBetween } from "@/core/time";
import { compareChronological, type Entry } from "./entry";
import { type EntryId } from "./ids";

/** Store-wide credit rules, set in Settings. */
export interface CreditPolicy {
  readonly defaultLimit: Cents;
  readonly overdueAfterDays: number;
}

export const DEFAULT_POLICY: CreditPolicy = { defaultLimit: 100_000 as Cents, overdueAfterDays: 30 };

export interface AccountSummary {
  readonly balance: Cents;
  readonly limit: Cents;
  /** First utang after the balance last reached zero; null when nothing is owed. */
  readonly openSince: Date | null;
  /** Calendar days since `openSince` (0 when nothing is owed). */
  readonly daysUnpaid: number;
  /** When the balance last went from owing to ₱0 or less. */
  readonly settledAt: Date | null;
  readonly utangSinceSettled: Cents;
  readonly bayadSinceSettled: Cents;
  readonly lastBayadAt: Date | null;
  readonly lastEntryAt: Date | null;
  readonly isOverdue: boolean;
  readonly isOverLimit: boolean;
  readonly overLimitBy: Cents;
  readonly isPaidAhead: boolean;
  /** 0–100, for the limit meter. */
  readonly limitUsedPercent: number;
}

/** Entries that still count: voided entries and the voids that cancel them net to zero and drop out. */
export function effectiveEntries(entries: readonly Entry[]): Entry[] {
  const voided = new Set<EntryId>();
  for (const e of entries) if (e.kind === "void" && e.voidsEntryId) voided.add(e.voidsEntryId);
  return entries.filter((e) => e.kind !== "void" && !voided.has(e.id)).sort(compareChronological);
}

export function summarizeAccount(
  entries: readonly Entry[],
  policy: CreditPolicy,
  customerLimit: Cents | null,
  now: Date,
): AccountSummary {
  const timeline = effectiveEntries(entries);
  let balance: Cents = ZERO;
  let openSince: Date | null = null;
  let settledAt: Date | null = null;
  let utang: Cents = ZERO;
  let bayad: Cents = ZERO;
  let lastBayadAt: Date | null = null;

  for (const e of timeline) {
    const before = balance;
    balance = add(balance, e.amount);
    if (e.amount > 0) utang = add(utang, e.amount);
    else bayad = add(bayad, (-e.amount) as Cents);
    if (e.kind === "bayad") lastBayadAt = e.occurredAt;

    if (balance > 0 && openSince === null) openSince = e.occurredAt;
    if (balance <= 0) {
      if (before > 0) settledAt = e.occurredAt;
      openSince = null;
      utang = ZERO;
      bayad = ZERO;
    }
  }

  const limit = customerLimit ?? policy.defaultLimit;
  const daysUnpaid = openSince ? calendarDaysBetween(openSince, now) : 0;
  const overLimitBy = (balance > limit ? balance - limit : 0) as Cents;
  const last = timeline.at(-1);
  return {
    balance,
    limit,
    openSince,
    daysUnpaid,
    settledAt,
    utangSinceSettled: utang,
    bayadSinceSettled: bayad,
    lastBayadAt,
    lastEntryAt: last ? last.occurredAt : null,
    isOverdue: balance > 0 && daysUnpaid >= policy.overdueAfterDays,
    isOverLimit: overLimitBy > 0,
    overLimitBy,
    isPaidAhead: balance < 0,
    limitUsedPercent: balance <= 0 || limit <= 0 ? (balance > 0 ? 100 : 0) : Math.min(100, Math.round((balance / limit) * 100)),
  };
}

export type LedgerRow =
  | { readonly type: "entry"; readonly entry: Entry; readonly balanceAfter: Cents; readonly pending: boolean }
  | { readonly type: "voided"; readonly entry: Entry; readonly reason: string | null; readonly pending: boolean }
  | { readonly type: "settled"; readonly at: Date };

/**
 * The client's page, newest first: every entry with the balance after it, voided entries shown
 * struck through (their void rows are folded into them), and a "fully paid" marker each time the
 * balance came back to zero.
 */
export function buildLedger(entries: readonly Entry[], isPending: (id: EntryId) => boolean = () => false): LedgerRow[] {
  const voids = new Map<EntryId, Entry>();
  for (const e of entries) if (e.kind === "void" && e.voidsEntryId) voids.set(e.voidsEntryId, e);

  const rows: LedgerRow[] = [];
  let balance: Cents = ZERO;
  for (const e of [...entries].filter((x) => x.kind !== "void").sort(compareChronological)) {
    const v = voids.get(e.id);
    if (v) {
      rows.push({ type: "voided", entry: e, reason: v.note, pending: isPending(e.id) || isPending(v.id) });
      continue;
    }
    const before = balance;
    balance = add(balance, e.amount);
    rows.push({ type: "entry", entry: e, balanceAfter: balance, pending: isPending(e.id) });
    if (before > 0 && balance <= 0) rows.push({ type: "settled", at: e.occurredAt });
  }
  return rows.reverse();
}
