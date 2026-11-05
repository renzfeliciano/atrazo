import { add, type Cents, negate, ZERO } from "@/core/money";
import { storeDay } from "@/core/time";
import { effectiveEntries } from "../domain/account";
import { type Customer } from "../domain/customer";
import { type Entry } from "../domain/entry";

/** Which entries a statement covers. Days are store (Manila) calendar days, inclusive. */
export type StatementPeriod =
  | { readonly kind: "all" }
  /** Everything after the moment the balance last reached zero (the ledger's "since paid"). */
  | { readonly kind: "since-paid"; readonly after: Date | null }
  | { readonly kind: "month"; readonly month: string /* "2026-11" */ };

export interface StatementRow {
  readonly entry: Entry;
  /** Balance after this entry. */
  readonly balance: Cents;
}

export interface Statement {
  readonly number: string;
  readonly customer: Customer;
  /** First and last store day covered; null = from the very first entry. */
  readonly from: string | null;
  readonly to: string;
  readonly opening: Cents;
  readonly rows: readonly StatementRow[];
  readonly totalUtang: Cents;
  readonly totalBayad: Cents;
  readonly balanceDue: Cents;
  readonly generatedAt: Date;
}

const lastDayOfMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return storeDay(new Date(Date.UTC(y, m, 0, 4)));
};

/**
 * A client's statement of account. Voided entries (and the voids) are left out, exactly as the
 * balance ignores them, so "Balance due" always equals the ledger balance at the end of the period.
 */
export function buildStatement(
  customer: Customer,
  entries: readonly Entry[],
  period: StatementPeriod,
  now: Date,
): Statement {
  const today = storeDay(now);
  const after = period.kind === "since-paid" ? period.after : null;
  const from =
    period.kind === "all"
      ? null
      : period.kind === "since-paid"
        ? after && storeDay(after)
        : `${period.month}-01`;
  const to = period.kind === "month" ? minDay(lastDayOfMonth(period.month), today) : today;

  let opening = ZERO;
  let balance = ZERO;
  let totalUtang = ZERO;
  let totalBayad = ZERO;
  const rows: StatementRow[] = [];
  for (const e of effectiveEntries(entries)) {
    const day = storeDay(e.occurredAt);
    if (day > to) break;
    balance = add(balance, e.amount);
    const before = after ? e.occurredAt.getTime() <= after.getTime() : from !== null && day < from;
    if (before) {
      opening = balance;
      continue;
    }
    rows.push({ entry: e, balance });
    if (e.kind === "utang") totalUtang = add(totalUtang, e.amount);
    else totalBayad = add(totalBayad, negate(e.amount));
  }

  return {
    number: `ST-${to.replace(/-/g, "")}-${customer.id.replace(/-/g, "").slice(-4).toUpperCase()}`,
    customer,
    from,
    to,
    opening,
    rows,
    totalUtang,
    totalBayad,
    balanceDue: balance,
    generatedAt: now,
  };
}

const minDay = (a: string, b: string) => (a < b ? a : b);
