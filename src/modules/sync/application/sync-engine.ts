import { MAX_CIPHERTEXT_CHARS } from "../api/contracts";
import {
  type BundleCodec,
  type Inbox,
  type SealedBundle,
  type SyncApi,
  type SyncOutbox,
} from "./client-ports";

/** At most this many changes per bundle; bundles are halved further if they would not fit. */
export const BUNDLE_MAX_RECORDS = 200;
export const PULL_PAGE = 100;

export class BundleTooLargeError extends Error {
  constructor() {
    super("A single change is too large to back up");
    this.name = "BundleTooLargeError";
  }
}

/**
 * Batched, encrypted, resumable sync for one phone.
 *
 * Push: unsent changes are bundled, compressed, encrypted and LOCKED (saved with a fixed id) before
 * upload. A failed upload retries the identical bundle, so the server's idempotent insert can never
 * store a change twice. Only after the server confirms are the changes removed from the outbox.
 *
 * Pull: pages of bundles after the cursor are decrypted first, then applied together with the new
 * cursor in one local transaction, so a crash can never half-apply a page. Applying is idempotent,
 * so this phone's own bundles coming back are harmless.
 */
export function syncEngine(deps: {
  outbox: SyncOutbox;
  codec: BundleCodec;
  api: SyncApi;
  inbox: Inbox;
  newBundleId: () => string;
}) {
  const { outbox, codec, api, inbox, newBundleId } = deps;

  async function nextBundle(): Promise<SealedBundle | undefined> {
    const locked = await outbox.lockedBundle();
    if (locked) return locked;

    let items = await outbox.peek(BUNDLE_MAX_RECORDS);
    if (items.length === 0) return undefined;
    for (;;) {
      const id = newBundleId();
      const sealed = await codec.seal(
        id,
        items.map((i) => i.record),
      );
      if (sealed.ciphertext.length <= MAX_CIPHERTEXT_CHARS) {
        await outbox.lockIntoBundle(
          sealed,
          items.map((i) => i.seq),
        );
        return sealed;
      }
      if (items.length === 1) throw new BundleTooLargeError();
      items = items.slice(0, Math.ceil(items.length / 2));
    }
  }

  async function pushPending(opts: { keepalive?: boolean } = {}): Promise<number> {
    let sent = 0;
    for (let bundle = await nextBundle(); bundle; bundle = await nextBundle()) {
      await api.push([{ id: bundle.id, iv: bundle.iv, ciphertext: bundle.ciphertext }], opts);
      await outbox.confirmBundle(bundle.id);
      sent += 1;
    }
    return sent;
  }

  async function pullAll(): Promise<{ applied: number; deferred: number }> {
    let cursor = await inbox.cursor();
    const total = { applied: 0, deferred: 0 };
    for (;;) {
      const page = await api.pull(cursor, PULL_PAGE);
      const records = [];
      for (const c of page.changes)
        records.push(...(await codec.open({ id: c.id, iv: c.iv, ciphertext: c.ciphertext })));
      const r = await inbox.applyPage(records, page.cursor);
      total.applied += r.applied;
      total.deferred += r.deferred;
      cursor = page.cursor;
      if (!page.hasMore) return total;
    }
  }

  return {
    pushPending,
    pullAll,
    /** Push first (so this phone's work is safe), then bring in other phones' changes. */
    async syncNow() {
      const pushed = await pushPending();
      const pulled = await pullAll();
      return { pushed, ...pulled };
    },
  };
}

export type SyncEngine = ReturnType<typeof syncEngine>;
