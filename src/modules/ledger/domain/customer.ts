import { AppError, ErrorCode, type FieldIssue } from "@/core/errors";
import { type Cents, MAX_ENTRY_CENTS } from "@/core/money";
import { err, ok, type Result } from "@/core/result";
import { type CustomerId } from "./ids";

/** A person who buys on credit from the store. One customer keeps one ledger for life. */
export interface Customer {
  readonly id: CustomerId;
  readonly name: string;
  /** E.164 Philippine mobile number, e.g. "+639171234567". */
  readonly phone: string | null;
  readonly note: string | null;
  /** null = use the store's default credit limit. */
  readonly creditLimit: Cents | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Hidden customers keep their entries and can be restored. Nothing is ever hard-deleted. */
  readonly hiddenAt: Date | null;
}

export interface CustomerDraft {
  readonly name: string;
  readonly phone?: string | null;
  readonly note?: string | null;
  readonly creditLimit?: Cents | null;
}

export const NAME_MAX = 80;
export const NOTE_MAX = 200;

/** Collapses inner whitespace and trims; returns null for empty input. */
export function cleanText(v: string | null | undefined): string | null {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t.length ? t : null;
}

/**
 * Accepts the ways Filipinos write mobile numbers ("0917 123 4567", "+63 917-123-4567", "9171234567")
 * and returns E.164, or null if it is not a PH mobile number.
 */
export function normalizePhilippineMobile(raw: string): string | null {
  const digits = raw.replace(/[\s\-().]/g, "");
  const m = /^(?:\+?63|0)?(9\d{9})$/.exec(digits);
  return m ? `+63${m[1]}` : null;
}

/** "+639171234567" → "0917 123 4567" */
export function formatPhilippineMobile(e164: string): string {
  const local = "0" + e164.slice(3);
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

export interface ValidCustomerFields {
  readonly name: string;
  readonly phone: string | null;
  readonly note: string | null;
  readonly creditLimit: Cents | null;
}

export function validateCustomerDraft(draft: CustomerDraft): Result<ValidCustomerFields, AppError> {
  const issues: FieldIssue[] = [];
  const name = cleanText(draft.name);
  if (!name) issues.push({ field: "name", message: "Enter the borrower's name" });
  else if (name.length > NAME_MAX)
    issues.push({ field: "name", message: `Use ${NAME_MAX} characters or fewer` });

  let phone: string | null = null;
  const rawPhone = cleanText(draft.phone);
  if (rawPhone) {
    phone = normalizePhilippineMobile(rawPhone);
    if (!phone)
      issues.push({ field: "phone", message: "Enter a PH mobile number, like 0917 123 4567" });
  }

  const note = cleanText(draft.note);
  if (note && note.length > NOTE_MAX)
    issues.push({ field: "note", message: `Use ${NOTE_MAX} characters or fewer` });

  const limit = draft.creditLimit ?? null;
  if (limit !== null && (!Number.isSafeInteger(limit) || limit < 0 || limit > MAX_ENTRY_CENTS)) {
    issues.push({ field: "creditLimit", message: "Enter a limit between ₱0 and ₱10,000,000" });
  }

  if (issues.length || !name) {
    return err(new AppError(ErrorCode.Validation, "Customer details are invalid", issues));
  }
  return ok({ name, phone, note, creditLimit: limit });
}

export function createCustomer(
  id: CustomerId,
  draft: CustomerDraft,
  now: Date,
): Result<Customer, AppError> {
  const v = validateCustomerDraft(draft);
  if (!v.ok) return v;
  return ok({ id, ...v.value, createdAt: now, updatedAt: now, hiddenAt: null });
}

export function updateCustomer(
  current: Customer,
  draft: CustomerDraft,
  now: Date,
): Result<Customer, AppError> {
  const v = validateCustomerDraft(draft);
  if (!v.ok) return v;
  return ok({ ...current, ...v.value, updatedAt: now });
}

export function hideCustomer(current: Customer, now: Date): Customer {
  return current.hiddenAt ? current : { ...current, hiddenAt: now, updatedAt: now };
}

export function restoreCustomer(current: Customer, now: Date): Customer {
  return current.hiddenAt ? { ...current, hiddenAt: null, updatedAt: now } : current;
}

/** Case- and spacing-insensitive name comparison, used to warn about duplicates. */
export function sameName(a: string, b: string): boolean {
  const k = (s: string) => s.replace(/\s+/g, " ").trim().toLocaleLowerCase("en-PH");
  return k(a) === k(b);
}
