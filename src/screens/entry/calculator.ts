import { type Cents, fromPesos } from "@/core/money";

/**
 * The entry screen's calculator: a small expression like "3×25+75" typed on the keypad or a keyboard.
 * × and ÷ bind tighter than + and −. The result is rounded to centavos. Pure, so it is unit-tested.
 */
export type CalcKey =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "00"
  | "."
  | "+"
  | "-"
  | "×"
  | "÷"
  | "C"
  | "⌫"
  | "=";

const OP = /[+\-×÷]/;
const MAX_DIGITS = 7;

export function evaluate(expr: string): number {
  const tokens = expr.match(/\d*\.?\d+|\d+\.|[+\-×÷]/g) ?? [];
  while (tokens.length && OP.test(tokens[tokens.length - 1]!)) tokens.pop();
  while (tokens.length && OP.test(tokens[0]!)) tokens.shift();
  if (!tokens.length) return 0;
  const terms: number[] = [];
  let current = parseFloat(tokens[0]!) || 0;
  let sign = 1;
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i]!;
    const n = parseFloat(tokens[i + 1] ?? "0") || 0;
    if (op === "×") current *= n;
    else if (op === "÷") current = n === 0 ? 0 : current / n;
    else {
      terms.push(sign * current);
      sign = op === "+" ? 1 : -1;
      current = n;
    }
  }
  terms.push(sign * current);
  return terms.reduce((a, b) => a + b, 0);
}

/** The amount to record: never negative, in centavos. */
export function amountOf(expr: string): Cents {
  return fromPesos(Math.max(0, evaluate(expr)));
}

export function hasOperator(expr: string): boolean {
  return OP.test(expr);
}

/** Applies one key press and returns the new expression. Invalid presses leave it unchanged. */
export function press(expr: string, key: CalcKey): string {
  if (key === "C") return "";
  if (key === "⌫") return expr.slice(0, -1);
  if (key === "=") {
    const total = amountOf(expr);
    return total
      ? (total / 100)
          .toFixed(2)
          .replace(/\.00$/, "")
          .replace(/(\.\d)0$/, "$1")
      : "";
  }
  if (OP.test(key)) {
    if (!expr) return expr;
    return OP.test(expr.at(-1)!) ? expr.slice(0, -1) + key : expr + key;
  }
  const lastNumber = expr.split(OP).at(-1) ?? "";
  if (key === "." && lastNumber.includes(".")) return expr;
  if (/\.\d\d$/.test(lastNumber)) return expr; // centavos have two digits at most
  if (lastNumber.replace(".", "").length + key.length > MAX_DIGITS) return expr;
  if (key === "." && lastNumber === "") return expr + "0.";
  if (lastNumber === "0" && key !== ".") return expr.slice(0, -1) + (key === "00" ? "0" : key);
  return expr + key;
}

/** Maps a physical keyboard key to a calculator key (desktop and tablet keyboards). */
export function keyFromKeyboard(e: { key: string }): CalcKey | null {
  const k = e.key;
  if (/^[0-9]$/.test(k)) return k as CalcKey;
  if (k === "." || k === ",") return ".";
  if (k === "+") return "+";
  if (k === "-") return "-";
  if (k === "*" || k === "x" || k === "X") return "×";
  if (k === "/") return "÷";
  if (k === "Backspace") return "⌫";
  if (k === "Delete" || k === "c" || k === "C") return "C";
  if (k === "=") return "=";
  return null;
}

/** "3×25+75" → "3 × 25 + 75 =" for the tape. */
export function displayExpression(expr: string): string {
  return expr.replace(/([+\-×÷])/g, " $1 ").replace(/-/g, "−") + " =";
}
