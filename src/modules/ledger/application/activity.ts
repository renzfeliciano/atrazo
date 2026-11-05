import { add, type Cents, negate, ZERO } from "@/core/money";
import { calendarDaysBetween, storeDay } from "@/core/time";
import { type Customer } from "../domain/customer";
import { type Entry } from "../domain/entry";

/** One utang or bayad in the store-wide feed. Voids aren't listed; the entry they cancel is marked. */
export interface ActivityItem {
  readonly entry: Entry;
  readonly customer: Pick<Customer, "id" | "name" | "hiddenAt">;
  /** The reason it was voided, or null if it still counts. */
  readonly voidedReason: string | null;
  readonly voided: boolean;
}

export interface ActivityDay {
  /** Store calendar day, "2026-11-05". */
  readonly day: string;
  readonly items: readonly ActivityItem[];
  /** Counted (not voided) utang and bayad that day, both positive. */
  readonly utang: Cents;
  readonly bayad: Cents;
}

export interface ActivityTotals {
  readonly utang: Cents;
  readonly bayad: Cents;
  readonly utangCount: number;
  readonly bayadCount: number;
  /** utang − bayad: how much more (or less) is owed than at the start of the range. */
  readonly net: Cents;
}

export interface ActivityFeed {
  readonly days: readonly ActivityDay[];
  readonly totals: ActivityTotals;
  /** First and last store day of the range. */
  readonly from: string;
  readonly to: string;
  /** Entries exist before the range ("Show earlier days"). */
  readonly hasEarlier: boolean;
}

/**
 * The last `days` store days, today included, newest first. Hidden clients' entries are left out,
 * matching the dashboard totals.
 */
export function activityFeed(
  entries: readonly Entry[],
  customers: readonly Customer[],
  now: Date,
  days: number,
): ActivityFeed {
  const byId = new Map(customers.map((c) => [c.id, c]));
  const voids = new Map<string, Entry>();
  for (const e of entries) if (e.kind === "void" && e.voidsEntryId) voids.set(e.voidsEntryId, e);

  const visible = entries.filter((e) => e.kind !== "void" && !byId.get(e.customerId)?.hiddenAt);
  const inRange = visible.filter((e) => calendarDaysBetween(e.occurredAt, now) < days);
  const hasEarlier = visible.length > inRange.length;

  const sorted = [...inRange].sort(
    (a, b) =>
      b.occurredAt.getTime() - a.occurredAt.getTime() ||
      b.recordedAt.getTime() - a.recordedAt.getTime(),
  );

  const groups = new Map<string, ActivityItem[]>();
  let utang = ZERO;
  let bayad = ZERO;
  let utangCount = 0;
  let bayadCount = 0;
  for (const entry of sorted) {
    const voidEntry = voids.get(entry.id);
    const c = byId.get(entry.customerId);
    const item: ActivityItem = {
      entry,
      customer: {
        id: entry.customerId,
        name: c?.name ?? "Unknown client",
        hiddenAt: c?.hiddenAt ?? null,
      },
      voided: !!voidEntry,
      voidedReason: voidEntry?.note ?? null,
    };
    const key = storeDay(entry.occurredAt);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
    if (voidEntry) continue;
    if (entry.kind === "utang") {
      utang = add(utang, entry.amount);
      utangCount += 1;
    } else {
      bayad = add(bayad, negate(entry.amount));
      bayadCount += 1;
    }
  }

  const dayList: ActivityDay[] = [...groups].map(([day, items]) => {
    let u = ZERO;
    let b = ZERO;
    for (const i of items) {
      if (i.voided) continue;
      if (i.entry.kind === "utang") u = add(u, i.entry.amount);
      else b = add(b, negate(i.entry.amount));
    }
    return { day, items, utang: u, bayad: b };
  });

  const to = storeDay(now);
  const from = storeDay(new Date(now.getTime() - (days - 1) * 86_400_000));
  return {
    days: dayList,
    totals: { utang, bayad, utangCount, bayadCount, net: add(utang, negate(bayad)) },
    from,
    to,
    hasEarlier,
  };
}
