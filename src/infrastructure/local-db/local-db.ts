import Dexie, { type EntityTable } from "dexie";
import { type Customer } from "@/modules/ledger/domain/customer";
import { type Entry } from "@/modules/ledger/domain/entry";

/**
 * The phone's database (IndexedDB). It is the source of truth: the app reads and writes here,
 * works fully offline, and the sync module backs it up as encrypted changes.
 *
 * Schema changes add a new `version(n)` with an upgrade function; existing versions are never edited.
 */
export interface OutboxRow {
  seq?: number;
  /** The customer or entry this change is about. */
  entityId: string;
  /** "customer.saved" | "entry.added" plus the full record, as written by the ledger. */
  change: unknown;
  createdAt: Date;
  /**
   * Set once the change is sealed into a bundle that is being uploaded. From then on the change
   * counts as sent: Undo voids it instead of deleting it, so phones can never disagree.
   */
  bundleId?: string;
}

/** A backed-up record of a type or version this app does not know yet; kept for a future update. */
export interface DeferredRow {
  id?: number;
  type: string;
  version: number;
  data: unknown;
  receivedAt: Date;
}

export interface KeyValueRow {
  key: string;
  value: unknown;
}

export class LocalDb extends Dexie {
  customers!: EntityTable<Customer, "id">;
  entries!: EntityTable<Entry, "id">;
  outbox!: EntityTable<OutboxRow, "seq">;
  settings!: EntityTable<KeyValueRow, "key">;
  /** Device-only secrets and sync state (data key, session info, pull cursor). Never synced. */
  device!: EntityTable<KeyValueRow, "key">;
  deferred!: EntityTable<DeferredRow, "id">;

  constructor(name = "atrazo") {
    super(name);
    // v1: initial schema. Never edit a released version; add the next one below it.
    this.version(1).stores({
      customers: "id, name, hiddenAt",
      entries: "id, customerId, occurredAt",
      outbox: "++seq, entityId",
      settings: "key",
      device: "key",
    });
    // v2: batched sync. Outbox rows can be locked into a bundle; unknown record types are kept.
    this.version(2).stores({
      outbox: "++seq, entityId, bundleId",
      deferred: "++id, type",
    });
  }

  /** Erases everything on this phone (sign-out, or a phone signed out from another device). */
  async wipe(): Promise<void> {
    const tables = [this.customers, this.entries, this.outbox, this.settings, this.device, this.deferred];
    await this.transaction("rw", tables, async () => {
      await Promise.all(tables.map((t) => t.clear()));
    });
  }
}
