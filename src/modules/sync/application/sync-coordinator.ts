/**
 * When to sync. Batching is what keeps Atrazo on free tiers: the database only wakes for a few
 * short bursts per phone per day instead of once per entry.
 *
 * - after a write: wait until things go quiet (debounce), then push everything at once
 * - app opened / back online: full sync now
 * - app hidden or closing: push now (keepalive), so nothing waits on a closed app
 * - while open: a full sync every `periodicMs`
 * - on failure: exponential backoff, honouring Retry-After
 * - 401 / 410 / 426: stop and let the app ask for the code, wipe, or update
 */
export type SyncState = "idle" | "waiting" | "syncing" | "offline" | "error" | "signed_out" | "revoked" | "update_required";

export interface SyncFailure {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds: number | null;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface CoordinatorOptions {
  /** Runs one sync. `pushOnly` is used when the app is going to the background. */
  run(mode: { pushOnly: boolean; keepalive: boolean }): Promise<void>;
  classify(error: unknown): SyncFailure;
  onState?(state: SyncState): void;
  timers?: Timers;
  debounceMs?: number;
  periodicMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

export const DEFAULTS = { debounceMs: 2 * 60_000, periodicMs: 15 * 60_000, baseBackoffMs: 30_000, maxBackoffMs: 30 * 60_000 };

export function syncCoordinator(opts: CoordinatorOptions) {
  const timers: Timers = opts.timers ?? { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
  const debounceMs = opts.debounceMs ?? DEFAULTS.debounceMs;
  const periodicMs = opts.periodicMs ?? DEFAULTS.periodicMs;
  const baseBackoffMs = opts.baseBackoffMs ?? DEFAULTS.baseBackoffMs;
  const maxBackoffMs = opts.maxBackoffMs ?? DEFAULTS.maxBackoffMs;

  let state: SyncState = "idle";
  let timer: unknown;
  let failures = 0;
  let running: Promise<void> | null = null;
  let rerun = false;
  let stopped = false;

  const setState = (s: SyncState) => {
    if (s !== state) {
      state = s;
      opts.onState?.(s);
    }
  };
  const terminal = () => state === "signed_out" || state === "revoked" || state === "update_required";

  function schedule(ms: number) {
    if (stopped || terminal()) return;
    if (timer !== undefined) timers.clearTimeout(timer);
    timer = timers.setTimeout(() => {
      timer = undefined;
      void runNow(false);
    }, ms);
  }

  async function runNow(pushOnly: boolean, keepalive = false): Promise<void> {
    if (stopped || terminal()) return;
    if (running) {
      rerun = true;
      return running;
    }
    if (timer !== undefined) {
      timers.clearTimeout(timer);
      timer = undefined;
    }
    setState("syncing");
    running = (async () => {
      try {
        await opts.run({ pushOnly, keepalive });
        failures = 0;
        setState("idle");
        schedule(periodicMs);
      } catch (e) {
        const f = opts.classify(e);
        if (f.code === "UNAUTHENTICATED") return setState("signed_out");
        if (f.code === "DEVICE_REVOKED") return setState("revoked");
        if (f.code === "UPGRADE_REQUIRED") return setState("update_required");
        failures += 1;
        setState(f.code === "NETWORK" ? "offline" : "error");
        const backoff = Math.min(maxBackoffMs, baseBackoffMs * 2 ** (failures - 1));
        schedule(f.retryAfterSeconds ? Math.max(backoff, f.retryAfterSeconds * 1000) : backoff);
      } finally {
        running = null;
        if (rerun && !terminal()) {
          rerun = false;
          void runNow(false);
        }
      }
    })();
    return running;
  }

  return {
    get state() {
      return state;
    },
    /** A local write happened: back up once things go quiet. */
    notifyWrite() {
      if (state === "idle" || state === "waiting") setState("waiting");
      schedule(debounceMs);
    },
    notifyForeground: () => runNow(false),
    notifyOnline: () => runNow(false),
    notifyBackground: () => runNow(true, true),
    syncNow: () => runNow(false),
    stop() {
      stopped = true;
      if (timer !== undefined) timers.clearTimeout(timer);
    },
  };
}

export type SyncCoordinator = ReturnType<typeof syncCoordinator>;
