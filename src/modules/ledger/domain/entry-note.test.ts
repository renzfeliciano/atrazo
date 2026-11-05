import { describe, expect, it } from "vitest";
import { type Cents } from "@/core/money";
import { type Entry } from "./entry";
import { type EntryNote, latestNotes, noteEntry, withLatestNote } from "./entry-note";
import { type CustomerId, type EntryId } from "./ids";

const entry: Entry = {
  id: "e1" as EntryId,
  customerId: "c1" as CustomerId,
  kind: "utang",
  amount: 15_000 as Cents,
  note: null,
  voidsEntryId: null,
  occurredAt: new Date("2026-11-05T04:00:00Z"),
  recordedAt: new Date("2026-11-05T04:00:00Z"),
};
const note = (id: string, text: string | null, at: string): EntryNote => ({
  id,
  entryId: entry.id,
  customerId: entry.customerId,
  note: text,
  recordedAt: new Date(at),
});

describe("entry notes", () => {
  it("cleans the text and keeps the entry's amount and date out of it", () => {
    const r = noteEntry(entry, "  Bigas  2 kilos ", "n1", new Date("2026-11-06T00:00:00Z"));
    expect(r.ok && r.value).toEqual(note("n1", "Bigas 2 kilos", "2026-11-06T00:00:00Z"));
  });

  it("refuses a void and an over-long note", () => {
    expect(noteEntry({ ...entry, kind: "void" }, "x", "n1", new Date()).ok).toBe(false);
    expect(noteEntry(entry, "x".repeat(121), "n1", new Date()).ok).toBe(false);
  });

  it("shows the newest note, breaking exact ties by id so every phone agrees", () => {
    const latest = latestNotes([
      note("n2", "Second", "2026-11-06T00:00:00Z"),
      note("n1", "First", "2026-11-05T00:00:00Z"),
      note("n3", "Tie wins", "2026-11-06T00:00:00Z"),
    ]);
    const shown = withLatestNote(entry, latest);
    expect(shown.note).toBe("Tie wins");
    expect(shown.noteEditedAt).toEqual(new Date("2026-11-06T00:00:00Z"));
    expect(shown.amount).toBe(entry.amount);
  });

  it("leaves an entry without later notes as it was written", () => {
    expect(withLatestNote(entry, new Map())).toBe(entry);
  });
});
