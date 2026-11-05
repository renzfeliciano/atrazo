import { describe, expect, it } from "vitest";
import { calendarDaysBetween, formatStoreDay, storeDay } from "./time";

describe("store calendar (Asia/Manila)", () => {
  it("uses Manila days, not UTC days", () => {
    // 2026-11-04T17:30Z is already Nov 5, 01:30 in Manila (UTC+8).
    expect(storeDay(new Date("2026-11-04T17:30:00Z"))).toBe("2026-11-05");
  });

  it("counts calendar days, not 24-hour periods", () => {
    const lateNight = new Date("2026-11-04T15:50:00Z"); // Nov 4, 23:50 Manila
    const nextMorning = new Date("2026-11-05T00:10:00Z"); // Nov 5, 08:10 Manila
    expect(calendarDaysBetween(lateNight, nextMorning)).toBe(1);
    expect(
      calendarDaysBetween(new Date("2026-09-02T02:00:00Z"), new Date("2026-11-05T02:00:00Z")),
    ).toBe(64);
  });

  it("never returns negative days", () => {
    expect(
      calendarDaysBetween(new Date("2026-11-06T00:00:00Z"), new Date("2026-11-05T00:00:00Z")),
    ).toBe(0);
  });
});

describe("formatStoreDay", () => {
  const now = new Date("2026-11-05T04:00:00Z");
  it("omits the year inside the current store year", () => {
    expect(formatStoreDay(new Date("2026-01-02T04:00:00Z"), now)).toBe("Jan 2");
  });
  it("adds the year for other years, so 2025 and 2026 never look the same", () => {
    expect(formatStoreDay(new Date("2025-11-05T04:00:00Z"), now)).toBe("Nov 5, 2025");
    expect(formatStoreDay(new Date("2027-01-01T04:00:00Z"), now)).toBe("Jan 1, 2027");
  });
  it("uses Manila's calendar at the year boundary", () => {
    // 2026-12-31 17:00 UTC is already 2027-01-01 01:00 in Manila.
    const manilaNewYear = new Date("2026-12-31T17:00:00Z");
    expect(formatStoreDay(manilaNewYear, new Date("2027-01-01T04:00:00Z"))).toBe("Jan 1");
    expect(formatStoreDay(manilaNewYear, now)).toBe("Jan 1, 2027");
  });
});
