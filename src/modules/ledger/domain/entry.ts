import { AppError, ErrorCode } from "@/core/errors";
import { type Cents, MAX_ENTRY_CENTS, negate } from "@/core/money";
import { err, ok, type Result } from "@/core/result";
import { cleanText } from "./customer";
import { type CustomerId, type EntryId } from "./ids";

/**
 * The ledger is append-only. An entry is never edited or deleted once it may have been backed up;
 * a mistake is corrected by a "void" entry that cancels it, so every balance can be traced.
 */
export type EntryKind = "utang" | "bayad" | "void";

export interface Entry {
  readonly id: EntryId;
  readonly customerId: CustomerId;
  readonly kind: EntryKind;
  /** Signed change to the balance: utang > 0, bayad < 0, void = −(voided entry). */
  readonly amount: Cents;
  readonly note: string | null;
  readonly voidsEntryId: EntryId | null;
  /** When it happened at the store (the owner may back-date). */
  readonly occurredAt: Date;
  /** When it was written into Atrazo. Breaks ties and orders sync. */
  readonly recordedAt: Date;
}

export const ENTRY_NOTE_MAX = 120;
/** How far ahead of "now" an entry may be dated, to absorb clock skew between phones. */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export interface EntryDraft {
  readonly id: EntryId;
  readonly customerId: CustomerId;
  readonly kind: "utang" | "bayad";
  /** Positive amount as typed; the sign comes from `kind`. */
  readonly amount: Cents;
  readonly note?: string | null;
  readonly occurredAt: Date;
}

export function recordEntry(draft: EntryDraft, now: Date): Result<Entry, AppError> {
  if (!Number.isSafeInteger(draft.amount) || draft.amount <= 0) {
    return err(
      new AppError(ErrorCode.Validation, "Amount must be more than zero", [
        { field: "amount", message: "Enter an amount" },
      ]),
    );
  }
  if (draft.amount > MAX_ENTRY_CENTS) {
    return err(
      new AppError(ErrorCode.Validation, "Amount is too large", [
        { field: "amount", message: "That amount is too large" },
      ]),
    );
  }
  const note = cleanText(draft.note);
  if (note && note.length > ENTRY_NOTE_MAX) {
    return err(
      new AppError(ErrorCode.Validation, "Note is too long", [
        { field: "note", message: `Use ${ENTRY_NOTE_MAX} characters or fewer` },
      ]),
    );
  }
  if (draft.occurredAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    return err(
      new AppError(ErrorCode.Validation, "Date is in the future", [
        { field: "occurredAt", message: "Pick today or an earlier date" },
      ]),
    );
  }
  return ok({
    id: draft.id,
    customerId: draft.customerId,
    kind: draft.kind,
    amount: draft.kind === "utang" ? draft.amount : negate(draft.amount),
    note,
    voidsEntryId: null,
    occurredAt: draft.occurredAt,
    recordedAt: now,
  });
}

export function voidEntry(
  target: Entry,
  existing: readonly Entry[],
  ids: { id: EntryId; reason?: string | null },
  now: Date,
): Result<Entry, AppError> {
  if (target.kind === "void") {
    return err(new AppError(ErrorCode.Conflict, "A void entry cannot be voided"));
  }
  if (existing.some((e) => e.voidsEntryId === target.id)) {
    return err(new AppError(ErrorCode.Conflict, "This entry is already voided"));
  }
  return ok({
    id: ids.id,
    customerId: target.customerId,
    kind: "void",
    amount: negate(target.amount),
    note: cleanText(ids.reason)?.slice(0, ENTRY_NOTE_MAX) ?? null,
    voidsEntryId: target.id,
    occurredAt: target.occurredAt,
    recordedAt: now,
  });
}

/** Stable chronological order: when it happened, then when it was recorded, then id. */
export function compareChronological(a: Entry, b: Entry): number {
  return (
    a.occurredAt.getTime() - b.occurredAt.getTime() ||
    a.recordedAt.getTime() - b.recordedAt.getTime() ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
