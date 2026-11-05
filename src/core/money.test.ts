import { describe, expect, it } from "vitest";
import { add, cents, formatPeso, fromPesos, negate } from "./money";

describe("money", () => {
  it("rejects non-integer centavos", () => {
    expect(() => cents(1.5)).toThrow(RangeError);
    expect(() => cents(Number.NaN)).toThrow(RangeError);
  });

  it("converts pesos to centavos without float drift", () => {
    expect(fromPesos(0.1 + 0.2)).toBe(30);
    expect(fromPesos(1.005)).toBe(101);
    expect(fromPesos(980.5)).toBe(98_050);
    expect(fromPesos(-12.345)).toBe(-1_235);
  });

  it("adds and negates", () => {
    expect(add(cents(150_00), cents(-50_00))).toBe(100_00);
    expect(negate(cents(500))).toBe(-500);
    expect(Object.is(negate(cents(0)), 0)).toBe(true);
  });

  it("formats pesos the way the designs show them", () => {
    expect(formatPeso(cents(230_000))).toBe("₱2,300.00");
    expect(formatPeso(cents(15_000), { sign: "always" })).toBe("+₱150.00");
    expect(formatPeso(cents(-50_000))).toBe("−₱500.00");
    expect(formatPeso(cents(-50_000), { sign: "never" })).toBe("₱500.00");
    expect(formatPeso(cents(0), { sign: "always" })).toBe("₱0.00");
    expect(formatPeso(cents(300_000), { whole: true })).toBe("₱3,000");
    expect(formatPeso(cents(15_000), { symbol: false, sign: "always" })).toBe("+150.00");
  });
});
