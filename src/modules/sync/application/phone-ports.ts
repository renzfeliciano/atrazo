import { type ChangeDto, type PullResponse } from "../api/contracts";
import { type WireRecord } from "../domain/bundle";

/** Ports the phone-side sync engine needs. Implemented over IndexedDB, Web Crypto and fetch. */

export interface OutboxItem {
  readonly seq: number;
  readonly record: WireRecord;
}

export interface SealedBundle {
  readonly id: string;
  readonly iv: string;
  readonly ciphertext: string;
}

export interface SyncOutbox {
  /** Unsent changes in write order, excluding any already locked into a bundle. */
  peek(limit: number): Promise<OutboxItem[]>;
  /** Locks the given changes into a bundle and remembers it, atomically. */
  lockIntoBundle(bundle: SealedBundle, seqs: readonly number[]): Promise<void>;
  /** The bundle being uploaded, if a previous attempt did not finish. */
  lockedBundle(): Promise<SealedBundle | undefined>;
  /** The server confirmed the bundle: drop its changes and forget it. */
  confirmBundle(bundleId: string): Promise<void>;
  pendingCount(): Promise<number>;
}

export interface BundleCodec {
  /** records → compressed → encrypted, bound to this ledger and bundle id. */
  seal(bundleId: string, records: readonly WireRecord[]): Promise<SealedBundle>;
  open(bundle: SealedBundle): Promise<WireRecord[]>;
}

export interface SyncApi {
  push(bundles: readonly ChangeDto[], opts?: { keepalive?: boolean }): Promise<void>;
  pull(after: string, limit: number): Promise<PullResponse>;
}

/** Applies decoded records and advances the cursor in one atomic local transaction. */
export interface Inbox {
  cursor(): Promise<string>;
  applyPage(
    records: readonly WireRecord[],
    nextCursor: string,
  ): Promise<{ applied: number; deferred: number }>;
}

export interface SyncIdentity {
  readonly ledgerId: string;
  readonly deviceId: string;
}
