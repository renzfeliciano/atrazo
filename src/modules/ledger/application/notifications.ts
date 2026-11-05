import { type Cents } from "@/core/money";
import { calendarDaysBetween, storeDay } from "@/core/time";
import { type CustomerOverview, type WeekTotals } from "./queries";

/**
 * In-app notifications, worked out on the phone from the store's own records. Nothing is sent
 * anywhere, and Atrazo never contacts clients by itself.
 *
 * Each notification has a stable `key`: it changes only when the situation changes (a client goes
 * over the limit again after paying, a new week starts), so "read" survives refreshes and a
 * recurring problem shows up as new.
 */
export type NotificationKind = "over-limit" | "overdue" | "weekly";
export type Severity = "danger" | "info" | "success" | "neutral";

export interface LedgerNotification {
  readonly key: string;
  readonly kind: NotificationKind;
  readonly severity: Severity;
  readonly at: Date;
  readonly customerId?: string;
  readonly customerName?: string;
  readonly balance?: Cents;
  readonly limit?: Cents;
  readonly overBy?: Cents;
  readonly daysUnpaid?: number;
  readonly lastBayadAt?: Date | null;
  readonly week?: WeekTotals & { readonly totalOwed: Cents };
}

const atMorning = (day: string) => new Date(`${day}T00:00:00+08:00`);

export function ledgerNotifications(
  customers: readonly CustomerOverview[],
  week: WeekTotals,
  totalOwed: Cents,
  overdueAfterDays: number,
  now: Date,
): LedgerNotification[] {
  const out: LedgerNotification[] = [];
  for (const { customer: c, account: a } of customers) {
    if (a.isOverLimit && a.lastEntryAt) {
      out.push({
        key: `over-limit:${c.id}:${a.openSince?.getTime() ?? 0}:${a.limit}`,
        kind: "over-limit",
        severity: "danger",
        at: a.lastEntryAt,
        customerId: c.id,
        customerName: c.name,
        balance: a.balance,
        limit: a.limit,
        overBy: a.overLimitBy,
      });
    }
    if (a.isOverdue && a.openSince) {
      // Overdue from the morning the limit of days was reached.
      const since = new Date(a.openSince.getTime() + overdueAfterDays * 86_400_000);
      out.push({
        key: `overdue:${c.id}:${a.openSince.getTime()}`,
        kind: "overdue",
        severity: "danger",
        at: atMorning(storeDay(since)),
        customerId: c.id,
        customerName: c.name,
        balance: a.balance,
        daysUnpaid: a.daysUnpaid,
        lastBayadAt: a.lastBayadAt,
      });
    }
  }
  if (week.utangCount + week.bayadCount > 0) {
    // One summary per week, dated Monday morning (store time).
    const today = storeDay(now);
    const weekday = (new Date(`${today}T12:00:00+08:00`).getUTCDay() + 6) % 7; // Mon = 0
    const monday = storeDay(new Date(now.getTime() - weekday * 86_400_000));
    out.push({
      key: `weekly:${monday}`,
      kind: "weekly",
      severity: "neutral",
      at: atMorning(monday),
      week: { ...week, totalOwed },
    });
  }
  return out.sort((x, y) => y.at.getTime() - x.at.getTime());
}

/** "Today" or "Earlier", for grouping. */
export const isToday = (at: Date, now: Date) => calendarDaysBetween(at, now) === 0;
