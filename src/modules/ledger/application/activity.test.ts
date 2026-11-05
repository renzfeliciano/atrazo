import { describe, expect, it } from "vitest";
import { type Cents } from "@/core/money";
import { type Customer } from "../domain/customer";
import { type Entry } from "../domain/entry";
import { type CustomerId, type EntryId } from "../domain/ids";
import { activityFeed } from "./activity";

const NOW = new Date("2026-11-05T06:00:00Z"); // 2 PM in Manila
const customer = (id: string, name: string, hiddenAt: Date | null = null): Customer => ({
  id: id as CustomerId,
  name,
  phone: null,
  note: null,
  creditLimit: null,
  createdAt: NOW,
  updatedAt: NOW,
  hiddenAt,
});
let seq = 0;
const entry = (
  who: string,
  kind: Entry["kind"],
  pesos: number,
  iso: string,
  extra: Partial<Entry> = {},
): Entry => ({
  id: `e${++seq}` as EntryId,
  customerId: who as CustomerId,
  kind,
  amount: (pesos * 100) as Cents,
  note: null,
  voidsEntryId: null,
  occurredAt: new Date(iso),
  recordedAt: new Date(iso),
  ...extra,
});

const nena = customer("c1", "Aling Nena");
const ben = customer("c2", "Kuya Ben");
const gone = customer("c3", "Hidden Client", NOW);

describe("activityFeed", () => {
  const today = entry("c1", "utang", 150, "2026-11-05T02:00:00Z");
  const todayBayad = entry("c2", "bayad", -200, "2026-11-05T03:00:00Z");
  const mistake = entry("c1", "utang", 999, "2026-11-04T02:00:00Z");
  const voidIt = entry("c1", "void", -999, "2026-11-04T05:00:00Z", {
    voidsEntryId: mistake.id,
    note: "Entered twice",
  });
  const lastWeek = entry("c2", "utang", 50, "2026-10-30T02:00:00Z"); // 6 days ago: inside 7 days
  const old = entry("c1", "utang", 70, "2026-10-20T02:00:00Z");
  const hidden = entry("c3", "utang", 500, "2026-11-05T01:00:00Z");
  const feed = activityFeed(
    [old, lastWeek, mistake, voidIt, today, todayBayad, hidden],
    [nena, ben, gone],
    NOW,
    7,
  );

  it("groups the last 7 store days, newest first, and leaves voids and hidden clients out", () => {
    expect(feed.days.map((d) => d.day)).toEqual(["2026-11-05", "2026-11-04", "2026-10-30"]);
    expect(feed.days[0]!.items.map((i) => i.entry.id)).toEqual([todayBayad.id, today.id]);
    expect(feed.days.flatMap((d) => d.items).some((i) => i.entry.kind === "void")).toBe(false);
    expect(feed.days.flatMap((d) => d.items).some((i) => i.customer.id === gone.id)).toBe(false);
    expect([feed.from, feed.to]).toEqual(["2026-10-30", "2026-11-05"]);
    expect(feed.hasEarlier).toBe(true);
  });

  it("keeps a voided entry visible with its reason, but out of every total", () => {
    const item = feed.days[1]!.items[0]!;
    expect(item).toMatchObject({ voided: true, voidedReason: "Entered twice" });
    expect(feed.days[1]).toMatchObject({ utang: 0, bayad: 0 });
    expect(feed.totals).toEqual({
      utang: 20000,
      bayad: 20000,
      utangCount: 2,
      bayadCount: 1,
      net: 0,
    });
  });

  it("totals each day with bayad as a positive amount", () => {
    expect(feed.days[0]).toMatchObject({ utang: 15000, bayad: 20000 });
  });

  it("widens to earlier days on request", () => {
    const wider = activityFeed([old, today], [nena], NOW, 30);
    expect(wider.days.map((d) => d.day)).toEqual(["2026-11-05", "2026-10-20"]);
    expect(wider.hasEarlier).toBe(false);
  });
});
