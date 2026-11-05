import { z } from "zod";
import { type Cents } from "@/core/money";
import { type LocalDb } from "@/infrastructure/local-db/local-db";
import {
  type CodecRegistry,
  type RecordCodec,
  type WireRecord,
} from "@/modules/sync/domain/bundle";
import { type Customer } from "../domain/customer";
import { type Entry } from "../domain/entry";
import { type EntryNote } from "../domain/entry-note";
import { type LedgerSettings } from "../domain/ledger-settings";
import { SETTINGS_KEY } from "./indexeddb-ledger";
import { type CustomerId, type EntryId } from "../domain/ids";
import { type LedgerChange } from "../application/ports";

/**
 * How ledger changes travel in backups. Each record type is versioned: changing a shape means adding
 * "entry.added@2" alongside @1, never editing @1, so older backups always stay readable.
 */
export interface ApplyContext {
  readonly db: LocalDb;
}

const date = z.iso.datetime().transform((s) => new Date(s));

const CustomerV1 = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1).max(80),
  phone: z
    .string()
    .regex(/^\+639\d{9}$/)
    .nullable(),
  note: z.string().max(200).nullable(),
  creditLimit: z.number().int().nonnegative().nullable(),
  createdAt: date,
  updatedAt: date,
  hiddenAt: date.nullable(),
});

const EntryV1 = z.strictObject({
  id: z.uuid(),
  customerId: z.uuid(),
  kind: z.enum(["utang", "bayad", "void"]),
  amount: z
    .number()
    .int()
    .refine((n) => n !== 0, "amount cannot be zero"),
  note: z.string().max(120).nullable(),
  voidsEntryId: z.uuid().nullable(),
  occurredAt: date,
  recordedAt: date,
});

export const customerSavedV1: RecordCodec<z.infer<typeof CustomerV1>, ApplyContext> = {
  type: "customer.saved",
  version: 1,
  schema: CustomerV1,
  async apply(d, { db }) {
    const incoming: Customer = {
      ...d,
      id: d.id as CustomerId,
      creditLimit: d.creditLimit as Cents | null,
    };
    const current = await db.customers.get(incoming.id);
    // Last write wins by updatedAt; exact ties break on content so every phone picks the same winner.
    if (
      !current ||
      incoming.updatedAt.getTime() > current.updatedAt.getTime() ||
      (incoming.updatedAt.getTime() === current.updatedAt.getTime() &&
        JSON.stringify(incoming) > JSON.stringify(current))
    ) {
      await db.customers.put(incoming);
    }
  },
};

export const entryAddedV1: RecordCodec<z.infer<typeof EntryV1>, ApplyContext> = {
  type: "entry.added",
  version: 1,
  schema: EntryV1,
  async apply(d, { db }) {
    // Entries are immutable: if it is already here, there is nothing to do.
    if (await db.entries.get(d.id as EntryId)) return;
    const entry: Entry = {
      ...d,
      id: d.id as EntryId,
      customerId: d.customerId as CustomerId,
      voidsEntryId: d.voidsEntryId as EntryId | null,
      amount: d.amount as Cents,
    };
    await db.entries.add(entry);
  },
};

const EntryNoteV1 = z.strictObject({
  id: z.uuid(),
  entryId: z.uuid(),
  customerId: z.uuid(),
  note: z.string().max(120).nullable(),
  recordedAt: date,
});

/** A note added to an entry later. Notes are append-only: the newest per entry is shown. */
export const entryNotedV1: RecordCodec<z.infer<typeof EntryNoteV1>, ApplyContext> = {
  type: "entry.noted",
  version: 1,
  schema: EntryNoteV1,
  async apply(d, { db }) {
    if (await db.entryNotes.get(d.id)) return;
    const note: EntryNote = {
      ...d,
      entryId: d.entryId as EntryId,
      customerId: d.customerId as CustomerId,
    };
    await db.entryNotes.add(note);
  },
};

const SettingsV1 = z.strictObject({
  name: z.string().min(1).max(60),
  defaultLimit: z.number().int().nonnegative(),
  overdueAfterDays: z.number().int().min(1).max(365),
  updatedAt: date,
});

export const settingsSavedV1: RecordCodec<z.infer<typeof SettingsV1>, ApplyContext> = {
  type: "ledger.settings",
  version: 1,
  schema: SettingsV1,
  async apply(d, { db }) {
    const incoming: LedgerSettings = { ...d, defaultLimit: d.defaultLimit as Cents };
    const current = (await db.settings.get(SETTINGS_KEY))?.value as LedgerSettings | undefined;
    if (!current || incoming.updatedAt.getTime() >= current.updatedAt.getTime()) {
      await db.settings.put({ key: SETTINGS_KEY, value: incoming });
    }
  },
};

/**
 * The same record under its name from before the account was called a ledger. Backups written
 * by those versions still hold it, so restoring them must keep working. Read only; never written.
 */
export const legacySettingsSavedV1: typeof settingsSavedV1 = {
  ...settingsSavedV1,
  type: "store.settings",
};

export function registerLedgerCodecs(
  registry: CodecRegistry<ApplyContext>,
): CodecRegistry<ApplyContext> {
  return registry
    .register(customerSavedV1)
    .register(entryAddedV1)
    .register(entryNotedV1)
    .register(settingsSavedV1)
    .register(legacySettingsSavedV1);
}

/** Outbox change → wire record (current versions only). */
export function ledgerChangeToWire(change: LedgerChange): WireRecord {
  switch (change.type) {
    case "customer.saved":
      return { t: "customer.saved", v: 1, d: change.customer };
    case "entry.added":
      return { t: "entry.added", v: 1, d: entryAsWritten(change.entry) };
    case "entry.noted":
      return { t: "entry.noted", v: 1, d: change.note };
    case "settings.saved":
      return { t: "ledger.settings", v: 1, d: change.settings };
  }
}

/** The entry exactly as it was written: a later note is its own record, never part of this one. */
function entryAsWritten(e: Entry): Entry {
  return {
    id: e.id,
    customerId: e.customerId,
    kind: e.kind,
    amount: e.amount,
    note: e.note,
    voidsEntryId: e.voidsEntryId,
    occurredAt: e.occurredAt,
    recordedAt: e.recordedAt,
  };
}
