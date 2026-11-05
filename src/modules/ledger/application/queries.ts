import { add, type Cents, negate, ZERO } from "@/core/money";
import { calendarDaysBetween } from "@/core/time";
import {
  type AccountSummary,
  buildLedger,
  effectiveEntries,
  type LedgerRow,
  summarizeAccount,
} from "../domain/account";
import { type Customer, sameName } from "../domain/customer";
import { type Entry } from "../domain/entry";
import { type CustomerId } from "../domain/ids";
import { type ActivityFeed, activityFeed } from "./activity";
import { type LedgerDeps } from "./ports";

export interface CustomerOverview {
  readonly customer: Customer;
  readonly account: AccountSummary;
}

export interface WeekTotals {
  readonly utang: Cents;
  readonly bayad: Cents;
  readonly utangCount: number;
  readonly bayadCount: number;
}

export interface Dashboard {
  readonly totalOwed: Cents;
  readonly owingCount: number;
  readonly customers: readonly CustomerOverview[];
  /** Overdue borrowers, longest unpaid first. */
  readonly toCollect: readonly CustomerOverview[];
  readonly overdueTotal: Cents;
  /** The last 7 ledger days, today included. Voided entries are excluded. */
  readonly week: WeekTotals;
}

export interface CustomerLedger {
  readonly customer: Customer;
  readonly account: AccountSummary;
  readonly rows: readonly LedgerRow[];
  readonly counts: { readonly all: number; readonly utang: number; readonly bayad: number };
}

function groupByCustomer(entries: readonly Entry[]): Map<CustomerId, Entry[]> {
  const m = new Map<CustomerId, Entry[]>();
  for (const e of entries) {
    const list = m.get(e.customerId);
    if (list) list.push(e);
    else m.set(e.customerId, [e]);
  }
  return m;
}

export function weekTotals(entries: readonly Entry[], now: Date): WeekTotals {
  let utang = ZERO;
  let bayad = ZERO;
  let utangCount = 0;
  let bayadCount = 0;
  for (const e of effectiveEntries(entries)) {
    if (calendarDaysBetween(e.occurredAt, now) > 6) continue;
    if (e.kind === "utang") {
      utang = add(utang, e.amount);
      utangCount += 1;
    } else if (e.kind === "bayad") {
      bayad = add(bayad, negate(e.amount));
      bayadCount += 1;
    }
  }
  return { utang, bayad, utangCount, bayadCount };
}

/** Read-side use cases. They only read, so the UI can re-run them whenever local data changes. */
export function ledgerQueries(
  deps: Pick<LedgerDeps, "customers" | "entries" | "outbox" | "settings" | "clock">,
) {
  const { customers, entries, outbox, settings, clock } = deps;

  return {
    /** Ledger-wide feed for the Activity tab: the last `days` ledger days, newest first. */
    async activity(days = 7): Promise<ActivityFeed> {
      const [all, list] = await Promise.all([customers.list(), entries.listAll()]);
      return activityFeed(list, all, clock.now(), days);
    },

    async dashboard(): Promise<Dashboard> {
      const now = clock.now();
      const [all, allEntries, policy] = await Promise.all([
        customers.list(),
        entries.listAll(),
        settings.getPolicy(),
      ]);
      const byCustomer = groupByCustomer(allEntries);
      const visible = all.filter((c) => !c.hiddenAt);
      const overviews = visible.map((c) => ({
        customer: c,
        account: summarizeAccount(byCustomer.get(c.id) ?? [], policy, c.creditLimit, now),
      }));

      let totalOwed = ZERO;
      let overdueTotal = ZERO;
      for (const o of overviews) {
        if (o.account.balance > 0) totalOwed = add(totalOwed, o.account.balance);
        if (o.account.isOverdue) overdueTotal = add(overdueTotal, o.account.balance);
      }
      const visibleIds = new Set(visible.map((c) => c.id));

      return {
        totalOwed,
        owingCount: overviews.filter((o) => o.account.balance > 0).length,
        customers: overviews,
        toCollect: overviews
          .filter((o) => o.account.isOverdue)
          .sort((a, b) => b.account.daysUnpaid - a.account.daysUnpaid),
        overdueTotal,
        week: weekTotals(
          allEntries.filter((e) => visibleIds.has(e.customerId)),
          now,
        ),
      };
    },

    async customerLedger(id: CustomerId): Promise<CustomerLedger | undefined> {
      const c = await customers.get(id);
      if (!c) return undefined;
      const [list, policy, pending] = await Promise.all([
        entries.listByCustomer(id),
        settings.getPolicy(),
        outbox.pendingIds(),
      ]);
      const counted = effectiveEntries(list);
      return {
        customer: c,
        account: summarizeAccount(list, policy, c.creditLimit, clock.now()),
        rows: buildLedger(list, (eid) => pending.has(eid)),
        counts: {
          all: counted.length,
          utang: counted.filter((e) => e.kind === "utang").length,
          bayad: counted.filter((e) => e.kind === "bayad").length,
        },
      };
    },

    settings: () => settings.get(),

    /** One borrower's entries as the app shows them (newest notes included), voids too. */
    entriesOf: (id: CustomerId): Promise<Entry[]> => entries.listByCustomer(id),

    /** Every borrower and entry as the app shows them (newest notes included), for exports. */
    async records(): Promise<{ customers: Customer[]; entries: Entry[] }> {
      const [all, list] = await Promise.all([customers.list(), entries.listAll()]);
      return { customers: all, entries: list };
    },

    /** Visible customers with the same name, for the "already exists" warning. */
    async findSameName(name: string): Promise<Customer[]> {
      if (!name.trim()) return [];
      return (await customers.list()).filter((c) => !c.hiddenAt && sameName(c.name, name));
    },
  };
}

export type LedgerQueries = ReturnType<typeof ledgerQueries>;
