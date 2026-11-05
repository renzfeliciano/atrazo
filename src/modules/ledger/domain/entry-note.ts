import { AppError, ErrorCode } from "@/core/errors";
import { err, ok, type Result } from "@/core/result";
import { cleanText } from "./customer";
import { type Entry, ENTRY_NOTE_MAX } from "./entry";
import { type CustomerId, type EntryId } from "./ids";

/**
 * A note added to an entry after it was written ("forgot to say what it was for").
 *
 * Entries are immutable, so the note is its own append-only record: the entry keeps its original
 * note, and the newest EntryNote is what the app shows. Amounts and balances never change, every
 * phone converges on the same note, and the earlier wording stays in the history.
 */
export interface EntryNote {
  readonly id: string;
  readonly entryId: EntryId;
  readonly customerId: CustomerId;
  /** null clears the note. */
  readonly note: string | null;
  readonly recordedAt: Date;
}

export function noteEntry(
  target: Entry,
  text: string | null | undefined,
  id: string,
  now: Date,
): Result<EntryNote, AppError> {
  if (target.kind === "void") {
    return err(new AppError(ErrorCode.Conflict, "A void can't be given a note"));
  }
  const note = cleanText(text);
  if (note && note.length > ENTRY_NOTE_MAX) {
    return err(
      new AppError(ErrorCode.Validation, "Note is too long", [
        { field: "note", message: `Use ${ENTRY_NOTE_MAX} characters or fewer` },
      ]),
    );
  }
  return ok({ id, entryId: target.id, customerId: target.customerId, note, recordedAt: now });
}

/** Newest first: by when it was written, then by id, so every phone picks the same winner. */
function isNewer(a: EntryNote, b: EntryNote): boolean {
  const t = a.recordedAt.getTime() - b.recordedAt.getTime();
  return t > 0 || (t === 0 && a.id > b.id);
}

/** The note each entry should show: the newest EntryNote per entry. */
export function latestNotes(notes: Iterable<EntryNote>): Map<EntryId, EntryNote> {
  const latest = new Map<EntryId, EntryNote>();
  for (const n of notes) {
    const current = latest.get(n.entryId);
    if (!current || isNewer(n, current)) latest.set(n.entryId, n);
  }
  return latest;
}

/** The entry as the app shows it: its newest note, and when that note was last changed. */
export function withLatestNote(entry: Entry, latest: Map<EntryId, EntryNote>): Entry {
  const n = latest.get(entry.id);
  return n ? { ...entry, note: n.note, noteEditedAt: n.recordedAt } : entry;
}
