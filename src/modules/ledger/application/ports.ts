import { type CreditPolicy } from "../domain/account";
import { type Customer } from "../domain/customer";
import { type Entry } from "../domain/entry";
import { type EntryNote } from "../domain/entry-note";
import { type LedgerSettings } from "../domain/ledger-settings";
import { type CustomerId, type EntryId } from "../domain/ids";

/**
 * Ports: what the ledger use cases need from the outside world.
 * Infrastructure provides implementations (IndexedDB on the phone, in-memory in tests).
 */
export interface CustomerRepository {
  get(id: CustomerId): Promise<Customer | undefined>;
  list(): Promise<Customer[]>;
  save(customer: Customer): Promise<void>;
}

/** Entries as the app shows them: each read carries the entry's newest note (entry-note.ts). */
export interface EntryRepository {
  get(id: EntryId): Promise<Entry | undefined>;
  listByCustomer(customerId: CustomerId): Promise<Entry[]>;
  listAll(): Promise<Entry[]>;
  add(entry: Entry): Promise<void>;
  addNote(note: EntryNote): Promise<void>;
  /** Only for undoing an entry that never left this phone. Backed-up entries are voided instead. */
  removeUnsynced(id: EntryId): Promise<void>;
}

/** A change waiting to be encrypted and backed up. The sync module drains this outbox. */
export type LedgerChange =
  | { readonly type: "customer.saved"; readonly customer: Customer }
  | { readonly type: "entry.added"; readonly entry: Entry }
  | { readonly type: "entry.noted"; readonly note: EntryNote }
  | { readonly type: "settings.saved"; readonly settings: LedgerSettings };

/** Outbox key for the single ledger-settings record. */
export const SETTINGS_ENTITY_ID = "ledger-settings";

export function changeEntityId(change: LedgerChange): string {
  if (change.type === "entry.added") return change.entry.id;
  // Its own id, not the entry's: undoing an unsent entry must never pick up a note change.
  if (change.type === "entry.noted") return change.note.id;
  if (change.type === "customer.saved") return change.customer.id;
  return SETTINGS_ENTITY_ID;
}

export interface ChangeOutbox {
  enqueue(change: LedgerChange): Promise<void>;
  /** True while the entity has a change that has not reached the server. */
  isPending(entityId: string): Promise<boolean>;
  pendingIds(): Promise<Set<string>>;
  /** Drops an unsent change. Returns false if it was already sent (or never existed). */
  discard(entityId: string): Promise<boolean>;
}

export interface SettingsRepository {
  getPolicy(): Promise<CreditPolicy>;
  get(): Promise<LedgerSettings>;
  save(settings: LedgerSettings): Promise<void>;
}

/** Runs the callback atomically: all writes inside commit together or not at all. */
export interface UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
}

export interface IdGenerator {
  customerId(): CustomerId;
  entryId(): EntryId;
}

export interface LedgerDeps {
  readonly customers: CustomerRepository;
  readonly entries: EntryRepository;
  readonly outbox: ChangeOutbox;
  readonly settings: SettingsRepository;
  readonly uow: UnitOfWork;
  readonly ids: IdGenerator;
  readonly clock: { now(): Date };
}
