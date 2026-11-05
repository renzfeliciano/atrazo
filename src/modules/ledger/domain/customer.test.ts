import { describe, expect, it } from "vitest";
import { type Cents } from "@/core/money";
import {
  createCustomer,
  formatPhilippineMobile,
  hideCustomer,
  normalizePhilippineMobile,
  restoreCustomer,
  sameName,
  updateCustomer,
} from "./customer";
import { day, NENA } from "./test-fixtures";

const now = day("2026-11-05");

describe("Philippine mobile numbers", () => {
  it.each(["0917 123 4567", "+63 917-123-4567", "639171234567", "9171234567", "(0917) 123.4567"])(
    "normalizes %s",
    (raw) => expect(normalizePhilippineMobile(raw)).toBe("+639171234567"),
  );

  it.each(["1234", "0817 123 4567", "+1 917 123 4567", "0917 123 456", "abc"])("rejects %s", (raw) =>
    expect(normalizePhilippineMobile(raw)).toBeNull(),
  );

  it("formats for display", () => expect(formatPhilippineMobile("+639171234567")).toBe("0917 123 4567"));
});

describe("customers", () => {
  it("creates a clean customer", () => {
    const r = createCustomer(NENA, { name: "  Aling   Nena Santos ", phone: "0917 123 4567", creditLimit: 300_000 as Cents }, now);
    expect(r.ok && r.value).toMatchObject({ name: "Aling Nena Santos", phone: "+639171234567", creditLimit: 300_000, hiddenAt: null });
  });

  it("collects every invalid field at once", () => {
    const r = createCustomer(NENA, { name: " ", phone: "12", creditLimit: -1 as Cents, note: "x".repeat(201) }, now);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.issues.map((i) => i.field)).toEqual(["name", "phone", "note", "creditLimit"]);
  });

  it("updates, hides and restores without losing identity", () => {
    const c = createCustomer(NENA, { name: "Nena" }, now);
    if (!c.ok) throw c.error;
    const later = day("2026-11-06");
    const u = updateCustomer(c.value, { name: "Aling Nena Santos" }, later);
    expect(u.ok && u.value).toMatchObject({ id: NENA, createdAt: now, updatedAt: later, name: "Aling Nena Santos" });
    const hidden = hideCustomer(c.value, later);
    expect(hidden.hiddenAt).toEqual(later);
    expect(restoreCustomer(hidden, later).hiddenAt).toBeNull();
  });

  it("detects duplicate names regardless of case and spacing", () => {
    expect(sameName("Aling Nena  Santos", "aling nena santos")).toBe(true);
    expect(sameName("Nena", "Nena Santos")).toBe(false);
  });
});
