import { describe, expect, it } from "vitest";
import { type Cents } from "@/core/money";
import { type AccountSummary } from "../domain/account";
import { type Customer } from "../domain/customer";
import { type CustomerId } from "../domain/ids";
import { ledgerNotifications } from "./notifications";
import { type CustomerOverview } from "./queries";

const NOW = new Date("2026-11-06T04:00:00Z"); // Friday, noon in Manila
const c = (id: string, name: string): Customer => ({
  id: id as CustomerId,
  name,
  phone: null,
  note: null,
  creditLimit: null,
  createdAt: NOW,
  updatedAt: NOW,
  hiddenAt: null,
});
const account = (a: Partial<AccountSummary>): AccountSummary =>
  ({
    balance: 0 as Cents,
    limit: 100000 as Cents,
    openSince: null,
    daysUnpaid: 0,
    settledAt: null,
    utangSinceSettled: 0 as Cents,
    bayadSinceSettled: 0 as Cents,
    lastBayadAt: null,
    lastEntryAt: null,
    isOverdue: false,
    isOverLimit: false,
    overLimitBy: 0 as Cents,
    isPaidAhead: false,
    limitUsedPercent: 0,
    ...a,
  }) as AccountSummary;

const jose: CustomerOverview = {
  customer: c("c1", "Mang Jose"),
  account: account({
    balance: 185000 as Cents,
    limit: 150000 as Cents,
    isOverLimit: true,
    overLimitBy: 35000 as Cents,
    openSince: new Date("2026-11-01T02:00:00Z"),
    lastEntryAt: new Date("2026-11-06T01:50:00Z"),
  }),
};
const ben: CustomerOverview = {
  customer: c("c2", "Kuya Ben"),
  account: account({
    balance: 145000 as Cents,
    isOverdue: true,
    daysUnpaid: 64,
    openSince: new Date("2026-09-03T02:00:00Z"),
    lastBayadAt: new Date("2026-09-02T02:00:00Z"),
  }),
};
const fine: CustomerOverview = {
  customer: c("c3", "Ate Joy"),
  account: account({ balance: 5000 as Cents }),
};
const week = { utang: 296000 as Cents, bayad: 214000 as Cents, utangCount: 31, bayadCount: 9 };

describe("ledgerNotifications", () => {
  const list = ledgerNotifications([jose, ben, fine], week, 1245000 as Cents, 30, NOW);

  it("raises over-limit and overdue alerts, newest first, and nothing for borrowers in good standing", () => {
    expect(list.map((n) => n.kind)).toEqual(["over-limit", "weekly", "overdue"]);
    expect(list.some((n) => n.customerId === "c3")).toBe(false);
    expect(list[0]).toMatchObject({ customerName: "Mang Jose", overBy: 35000, severity: "danger" });
    expect(list.find((n) => n.kind === "overdue")).toMatchObject({ daysUnpaid: 64 });
  });

  it("dates the weekly summary Monday morning in Manila, one per week", () => {
    const weekly = list.find((n) => n.kind === "weekly")!;
    expect(weekly.key).toBe("weekly:2026-11-02");
    expect(weekly.week).toMatchObject({ utangCount: 31, totalOwed: 1245000 });
  });

  it("keeps the same key while the situation is unchanged, and a new one when it recurs", () => {
    const again = ledgerNotifications(
      [jose],
      week,
      0 as Cents,
      30,
      new Date("2026-11-07T04:00:00Z"),
    );
    expect(again[0]!.key).toBe(list[0]!.key);
    const reopened: CustomerOverview = {
      ...jose,
      account: { ...jose.account, openSince: new Date("2026-11-20T02:00:00Z") },
    };
    expect(ledgerNotifications([reopened], week, 0 as Cents, 30, NOW)[0]!.key).not.toBe(
      list[0]!.key,
    );
  });

  it("skips the weekly summary in a week with no entries", () => {
    const quiet = ledgerNotifications(
      [],
      { utang: 0 as Cents, bayad: 0 as Cents, utangCount: 0, bayadCount: 0 },
      0 as Cents,
      30,
      NOW,
    );
    expect(quiet).toEqual([]);
  });
});
