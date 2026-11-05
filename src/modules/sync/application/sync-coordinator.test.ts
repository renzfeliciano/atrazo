import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SyncFailure, syncCoordinator, type SyncState } from "./sync-coordinator";

const fail = (status: number, code: string, retryAfterSeconds: number | null = null) => Object.assign(new Error(code), { failure: { status, code, retryAfterSeconds } });
const classify = (e: unknown): SyncFailure => (e as { failure: SyncFailure }).failure;

describe("sync coordinator", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(run = vi.fn(async () => {})) {
    const states: SyncState[] = [];
    const c = syncCoordinator({ run, classify, onState: (s) => states.push(s), debounceMs: 120_000, periodicMs: 900_000, baseBackoffMs: 30_000, maxBackoffMs: 1_800_000 });
    return { c, run, states };
  }

  it("batches many writes into one backup after things go quiet", async () => {
    const { c, run } = setup();
    for (let i = 0; i < 25; i++) {
      c.notifyWrite();
      await vi.advanceTimersByTimeAsync(10_000);
    }
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("pushes immediately, with keepalive, when the app goes to the background", async () => {
    const { c, run } = setup();
    c.notifyWrite();
    await c.notifyBackground();
    expect(run).toHaveBeenCalledWith({ pushOnly: true, keepalive: true });
  });

  it("syncs when opened and then every 15 minutes", async () => {
    const { c, run } = setup();
    await c.notifyForeground();
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(900_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("backs off exponentially while offline, then recovers", async () => {
    let calls = 0;
    const run = vi.fn(async () => {
      calls += 1;
      if (calls <= 3) throw fail(0, "NETWORK");
    });
    const { c, states } = setup(run);
    await c.syncNow();
    expect(c.state).toBe("offline");
    await vi.advanceTimersByTimeAsync(30_000); // 2nd try after 30 s
    await vi.advanceTimersByTimeAsync(60_000); // 3rd after 60 s
    expect(run).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(119_000);
    expect(run).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1_000); // 4th after 120 s succeeds
    expect(c.state).toBe("idle");
    expect(states).toContain("offline");
  });

  it("honours Retry-After from a rate limit", async () => {
    const run = vi.fn().mockRejectedValueOnce(fail(429, "RATE_LIMITED", 600)).mockResolvedValue(undefined);
    const { c } = setup(run);
    await c.syncNow();
    await vi.advanceTimersByTimeAsync(599_000);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["UNAUTHENTICATED", "signed_out"],
    ["DEVICE_REVOKED", "revoked"],
    ["UPGRADE_REQUIRED", "update_required"],
  ] as const)("stops on %s and reports %s", async (code, state) => {
    const run = vi.fn().mockRejectedValue(fail(400, code));
    const { c } = setup(run);
    await c.syncNow();
    expect(c.state).toBe(state);
    c.notifyWrite();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("never runs two syncs at once; a request during a run queues one more", async () => {
    let release!: () => void;
    const run = vi.fn(() => new Promise<void>((r) => (release = r)));
    const { c } = setup(run);
    const first = c.syncNow();
    void c.syncNow();
    void c.syncNow();
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
