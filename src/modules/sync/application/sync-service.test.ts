import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ErrorCode } from "@/core/errors";
import { type DeviceId, type DeviceSession, type StoreId } from "@/modules/identity/domain/identity";
import { postgresIdentityRepository } from "@/modules/identity/infrastructure/postgres-identity-repository";
import { createTestDatabase } from "@/server/db/test-db";
import { postgresRateLimiter } from "@/server/security/postgres-rate-limiter";
import { PullQuery, PushRequest } from "../api/contracts";
import { postgresChangeLog } from "../infrastructure/postgres-change-log";
import { syncService } from "./sync-service";

let tdb: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => void (tdb = await createTestDatabase()));
afterAll(() => tdb.close());
beforeEach(() => tdb.reset());

const svc = () => syncService({ log: postgresChangeLog(tdb.db), limiter: postgresRateLimiter(tdb.db) });

async function newStore(): Promise<DeviceSession> {
  const storeId = uuidv7() as StoreId;
  const deviceId = uuidv7() as DeviceId;
  const rand = () => crypto.randomUUID().replace(/-/g, "");
  await postgresIdentityRepository(tdb.db).createStore(
    storeId,
    { codeLookup: rand(), authVerifier: rand(), wrappedKey: rand() },
    { id: deviceId, name: "Phone", tokenHash: rand() },
  );
  return { storeId, deviceId };
}

const change = (id = uuidv7()) => ({ id, iv: "AAAAAAAAAAAAAAAA", ciphertext: "B".repeat(64) });
const pull = (s: DeviceSession, after = "0", limit = 200) => svc().pull(s, PullQuery.parse({ after, limit }));

describe("encrypted change log (Postgres)", () => {
  it("is idempotent: re-sending a batch after a dropped connection stores nothing twice", async () => {
    const s = await newStore();
    const batch = [change(), change()];
    const first = await svc().push(s, { changes: batch });
    const again = await svc().push(s, { changes: batch });
    expect(first.ok && first.value.accepted).toBe(2);
    expect(again.ok && again.value.accepted).toBe(0);
    expect((await pull(s)).changes).toHaveLength(2);
  });

  it("pulls in order with a cursor, page by page", async () => {
    const s = await newStore();
    const ids = Array.from({ length: 5 }, () => uuidv7());
    await svc().push(s, { changes: ids.slice(0, 3).map(change) });
    await svc().push(s, { changes: ids.slice(3).map(change) });

    const p1 = await pull(s, "0", 2);
    expect(p1.changes.map((c) => c.id)).toEqual(ids.slice(0, 2));
    expect(p1.hasMore).toBe(true);
    const p2 = await pull(s, p1.cursor, 2);
    const p3 = await pull(s, p2.cursor, 2);
    expect([...p2.changes, ...p3.changes].map((c) => c.id)).toEqual(ids.slice(2));
    expect(p3.hasMore).toBe(false);
    expect((await pull(s, p3.cursor)).changes).toEqual([]);
    expect((await pull(s, p3.cursor)).cursor).toBe(p3.cursor);
  });

  it("keeps stores completely separate, even for the same change id", async () => {
    const a = await newStore();
    const b = await newStore();
    const shared = uuidv7();
    await svc().push(a, { changes: [change(shared)] });
    const r = await svc().push(b, { changes: [change(shared)] });
    expect(r.ok && r.value.accepted).toBe(1);
    expect((await pull(a)).changes).toHaveLength(1);
    expect((await pull(b)).changes.map((c) => c.deviceId)).toEqual([b.deviceId]);
  });

  it("records which phone sent each change", async () => {
    const s = await newStore();
    await svc().push(s, { changes: [change()] });
    expect((await pull(s)).changes[0]?.deviceId).toBe(s.deviceId);
  });

  it("rejects a batch that repeats an id", async () => {
    const s = await newStore();
    const id = uuidv7();
    const r = await svc().push(s, { changes: [change(id), change(id)] });
    expect(!r.ok && r.error.code).toBe(ErrorCode.Validation);
  });

  it("rate-limits a runaway phone", async () => {
    const s = await newStore();
    let last;
    for (let i = 0; i < 241; i++) last = await svc().push(s, { changes: [change()] });
    expect(last && !last.ok && last.error.code).toBe(ErrorCode.RateLimited);
  });
});

describe("sync contracts", () => {
  it.each([
    ["empty batch", { changes: [] }],
    ["oversized batch", { changes: Array.from({ length: 201 }, () => change()) }],
    ["bad iv", { changes: [{ ...change(), iv: "short" }] }],
    ["non-base64 ciphertext", { changes: [{ ...change(), ciphertext: "<script>".repeat(4) }] }],
    ["huge ciphertext", { changes: [{ ...change(), ciphertext: "A".repeat(16_385) }] }],
    ["smuggled field", { changes: [{ ...change(), storeId: "x" }] }],
    ["not a uuid", { changes: [{ ...change(), id: "1" }] }],
  ])("rejects %s", (_n, body) => expect(PushRequest.safeParse(body).success).toBe(false));

  it("parses pull queries safely", () => {
    expect(PullQuery.parse({})).toEqual({ after: "0", limit: 200 });
    expect(PullQuery.safeParse({ after: "-1" }).success).toBe(false);
    expect(PullQuery.safeParse({ after: "1;drop table" }).success).toBe(false);
    expect(PullQuery.safeParse({ limit: "501" }).success).toBe(false);
  });
});
