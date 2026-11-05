import { type Brand } from "./brand";

/**
 * Money is always an integer number of centavos. Floating-point pesos never enter the ledger.
 * MAX_ENTRY guards against typos (₱10,000,000.00 is far above any sari-sari credit line).
 */
export type Cents = Brand<number, "Cents">;

export const MAX_ENTRY_CENTS = 1_000_000_000 as Cents;
export const ZERO = 0 as Cents;

export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value))
    throw new RangeError(`Cents must be a safe integer, got ${value}`);
  return value as Cents;
}

export function add(a: Cents, b: Cents): Cents {
  return cents(a + b);
}

export function negate(a: Cents): Cents {
  return cents(a === 0 ? 0 : -a);
}

/** Converts a peso amount (e.g. from a calculator result) to centavos, rounding half away from zero. */
export function fromPesos(pesos: number): Cents {
  if (!Number.isFinite(pesos)) throw new RangeError("Amount must be a finite number");
  const abs = Math.abs(pesos);
  const text = String(abs);
  // Shift the decimal point in the decimal string ("1.005e2" = 100.5), not in binary
  // (1.005 * 100 = 100.49999…), so half-centavos round the way a person expects.
  const scaled = Math.round(text.includes("e") ? abs * 100 : Number(`${text}e2`));
  return cents(pesos < 0 ? -scaled : scaled);
}

const MINUS = "−";
const grouping = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const wholeGrouping = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 });

export type SignDisplay = "auto" | "always" | "never";

/** "₱2,300.00", "+₱150.00", "−₱500.00" (true minus sign, not a hyphen). */
export function formatPeso(
  amount: Cents,
  {
    sign = "auto",
    symbol = true,
    whole = false,
  }: { sign?: SignDisplay; symbol?: boolean; whole?: boolean } = {},
): string {
  const abs = Math.abs(amount) / 100;
  const body =
    (symbol ? "₱" : "") + (whole ? wholeGrouping : grouping).format(whole ? Math.round(abs) : abs);
  if (sign === "never" || amount === 0) return body;
  if (amount < 0) return MINUS + body;
  return sign === "always" ? "+" + body : body;
}
