import { describe, expect, it } from "vitest";
import { calendarDaysBetween, storeDay } from "./time";

describe("store calendar (Asia/Manila)", () => {
  it("uses Manila days, not UTC days", () => {
    // 2026-11-04T17:30Z is already Nov 5, 01:30 in Manila (UTC+8).
    expect(storeDay(new Date("2026-11-04T17:30:00Z"))).toBe("2026-11-05");
  });

  it("counts calendar days, not 24-hour periods", () => {
    const lateNight = new Date("2026-11-04T15:50:00Z"); // Nov 4, 23:50 Manila
    const nextMorning = new Date("2026-11-05T00:10:00Z"); // Nov 5, 08:10 Manila
    expect(calendarDaysBetween(lateNight, nextMorning)).toBe(1);
    expect(calendarDaysBetween(new Date("2026-09-02T02:00:00Z"), new Date("2026-11-05T02:00:00Z"))).toBe(64);
  });

  it("never returns negative days", () => {
    expect(calendarDaysBetween(new Date("2026-11-06T00:00:00Z"), new Date("2026-11-05T00:00:00Z"))).toBe(0);
  });
});
