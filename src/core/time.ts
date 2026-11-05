/** Time is injected (never read from `new Date()` inside domain or use cases) so rules are testable. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** The ledger's calendar. Atrazo serves lenders in the Philippines, so day boundaries follow Manila time. */
export const LEDGER_TIME_ZONE = "Asia/Manila";

const ymd = new Intl.DateTimeFormat("en-CA", {
  timeZone: LEDGER_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "2026-11-05" for the ledger's local calendar day of `d`. */
export function ledgerDay(d: Date): string {
  return ymd.format(d);
}

/** Whole calendar days from `from` to `to` in the ledger's time zone (0 if same day, never negative). */
export function calendarDaysBetween(from: Date, to: Date): number {
  const a = Date.parse(ledgerDay(from) + "T00:00:00Z");
  const b = Date.parse(ledgerDay(to) + "T00:00:00Z");
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

const shortDay = new Intl.DateTimeFormat("en-PH", {
  timeZone: LEDGER_TIME_ZONE,
  month: "short",
  day: "numeric",
});
const shortDayWithYear = new Intl.DateTimeFormat("en-PH", {
  timeZone: LEDGER_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});

/**
 * "Nov 5" for a day in the current ledger year, "Nov 5, 2025" otherwise, so a date shown on its own
 * is never ambiguous across years. (Rows under a "November 2026" heading can use the short form.)
 */
export function formatLedgerDay(d: Date, now: Date): string {
  return ledgerDay(d).slice(0, 4) === ledgerDay(now).slice(0, 4)
    ? shortDay.format(d)
    : shortDayWithYear.format(d);
}
