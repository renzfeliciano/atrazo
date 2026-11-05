import { describe, expect, it } from "vitest";
import {
  amountOf,
  type CalcKey,
  displayExpression,
  evaluate,
  keyFromKeyboard,
  press,
} from "./calculator";

const typeKeys = (keys: CalcKey[]) => keys.reduce(press, "");

describe("calculator", () => {
  it("respects operator precedence", () => {
    expect(evaluate("3×25+75")).toBe(150);
    expect(evaluate("100-20×2")).toBe(60);
    expect(evaluate("90÷4")).toBe(22.5);
  });

  it("ignores dangling operators and division by zero", () => {
    expect(evaluate("150+")).toBe(150);
    expect(evaluate("+150")).toBe(150);
    expect(evaluate("5÷0")).toBe(0);
    expect(evaluate("")).toBe(0);
  });

  it("returns centavos, never negative", () => {
    expect(amountOf("0.1+0.2")).toBe(30);
    expect(amountOf("10÷3")).toBe(333);
    expect(amountOf("5-20")).toBe(0);
  });

  it("builds expressions from key presses", () => {
    expect(typeKeys(["3", "×", "2", "5", "+", "7", "5"])).toBe("3×25+75");
    expect(typeKeys(["1", "+", "×", "2"])).toBe("1×2");
    expect(typeKeys(["+", "5"])).toBe("5");
    expect(typeKeys(["0", "0", "7"])).toBe("7");
    expect(typeKeys([".", "5"])).toBe("0.5");
  });

  it("limits to two decimal places, one point and seven digits", () => {
    expect(typeKeys(["1", ".", "2", "3", "4"])).toBe("1.23");
    expect(typeKeys(["1", ".", ".", "5"])).toBe("1.5");
    expect(typeKeys(["9", "9", "9", "9", "9", "9", "9", "9"])).toBe("9999999");
  });

  it("supports clear, backspace and equals", () => {
    expect(press("3×25+75", "=")).toBe("150");
    expect(press("10÷4", "=")).toBe("2.5");
    expect(press("150", "⌫")).toBe("15");
    expect(press("150", "C")).toBe("");
  });

  it("maps physical keyboard keys", () => {
    expect(keyFromKeyboard({ key: "7" })).toBe("7");
    expect(keyFromKeyboard({ key: "*" })).toBe("×");
    expect(keyFromKeyboard({ key: "/" })).toBe("÷");
    expect(keyFromKeyboard({ key: "Backspace" })).toBe("⌫");
    expect(keyFromKeyboard({ key: "Enter" })).toBeNull();
  });

  it("formats the tape", () => {
    expect(displayExpression("3×25-5")).toBe("3 × 25 − 5 =");
  });
});
