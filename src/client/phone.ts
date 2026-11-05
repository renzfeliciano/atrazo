import { v7 as uuidv7 } from "uuid";
import { type Clock, systemClock } from "@/core/time";
import { LocalDb } from "@/infrastructure/local-db/local-db";
import { ledgerCommands } from "@/modules/ledger/application/commands";
import { type LedgerChange } from "@/modules/ledger/application/ports";
import { ledgerQueries } from "@/modules/ledger/application/queries";
import { indexedDbLedger } from "@/modules/ledger/infrastructure/indexeddb-ledger";
import {
  type ApplyContext,
  ledgerChangeToWire,
  registerLedgerCodecs,
} from "@/modules/ledger/infrastructure/ledger-sync-codecs";
import { CodecRegistry } from "@/modules/sync/domain/bundle";
import { syncEngine, type SyncEngine } from "@/modules/sync/application/sync-engine";
import { httpSyncApi, type FetchLike } from "@/modules/sync/infrastructure/http-sync-api";
import {
  indexedDbInbox,
  indexedDbSyncOutbox,
} from "@/modules/sync/infrastructure/indexeddb-sync-stores";
import { webBundleCodec } from "@/modules/sync/infrastructure/web-bundle-codec";
import { storeAccess } from "@/modules/vault/application/store-access";
import { httpIdentityApi, indexedDbKeyStore } from "@/modules/vault/infrastructure/device-adapters";

/**
 * The phone's composition root: the only place that knows which adapters implement which ports.
 * The UI uses what this returns; tests build phones the same way with a fake network.
 */
export interface PhoneOptions {
  readonly db?: LocalDb;
  readonly fetch?: FetchLike;
  readonly baseUrl?: string;
  readonly clock?: Clock;
}

export function createPhone(opts: PhoneOptions = {}) {
  const db = opts.db ?? new LocalDb();
  const clock = opts.clock ?? systemClock;
  const ledgerDeps = indexedDbLedger(db, clock);
  const registry = registerLedgerCodecs(new CodecRegistry<ApplyContext>());
  const access = storeAccess({
    api: httpIdentityApi(opts.fetch, opts.baseUrl),
    keys: indexedDbKeyStore(db),
  });

  /** Built on demand: sync needs the store's data key, which exists only after start/open. */
  async function engine(): Promise<SyncEngine> {
    const session = await access.current();
    if (!session) throw new Error("No store is open on this phone");
    return syncEngine({
      outbox: indexedDbSyncOutbox(db, (c) => ledgerChangeToWire(c as LedgerChange)),
      codec: webBundleCodec(session.dataKey, session.storeId),
      api: httpSyncApi(opts.fetch, opts.baseUrl),
      inbox: indexedDbInbox(db, registry, { db }),
      newBundleId: () => uuidv7(),
    });
  }

  return {
    db,
    commands: ledgerCommands(ledgerDeps),
    queries: ledgerQueries(ledgerDeps),
    access,
    engine,
  };
}

export type Phone = ReturnType<typeof createPhone>;
