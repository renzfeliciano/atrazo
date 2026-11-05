import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ErrorCode } from "@/core/errors";
import { type Database, rowsOf } from "@/server/db/database";
import { createTestDatabase } from "@/server/db/test-db";
import { nodeSecrets } from "@/server/security/node-secrets";
import { postgresRateLimiter } from "@/server/security/postgres-rate-limiter";
import { generateRecoveryCode, parseRecoveryCode, type RecoveryCode } from "@/modules/vault/domain/recovery-code";
import { deriveStoreKeys, generateDataKey, open, seal, unwrapDataKey, wrapDataKey } from "@/modules/vault/infrastructure/web-crypto";
import { type DeviceId } from "../domain/identity";
import { postgresIdentityRepository } from "../infrastructure/postgres-identity-repository";
import { identityService, LIMITS } from "./identity-service";

let tdb: Awaited<ReturnType<typeof createTestDatabase>>;
let db: Database;
let now: Date;
const service = () =>
  identityService({ repo: postgresIdentityRepository(db), secrets: nodeSecrets, limiter: postgresRateLimiter(db, { now: () => now }), clock: { now: () => now } });

beforeAll(async () => {
  tdb = await createTestDatabase();
  db = tdb.db;
});
afterAll(() => tdb.close());
beforeEach(async () => {
  await tdb.reset();
  now = new Date("2026-11-05T01:00:00Z");
});

const meta = (clientKey = "client-a") => ({ clientKey });
const newCode = () => generateRecoveryCode((a) => crypto.getRandomValues(a));

/** What the phone does on "Start my store": real keys, real wrapping. */
async function startStore(code: RecoveryCode = newCode(), deviceName = "Samsung Galaxy A15") {
  const keys = await deriveStoreKeys(code);
  const dataKey = await generateDataKey();
  const r = await service().createStore(
    { lookup: keys.lookup, authSecret: keys.authSecret, wrappedKey: await wrapDataKey(dataKey, keys.kek), deviceName },
    meta(),
  );
  if (!r.ok) throw r.error;
  return { code, dataKey, session: r.value };
}

async function openWith(code: RecoveryCode, deviceName = "Redmi 13C", client = "client-b") {
  const keys = await deriveStoreKeys(code);
  return service().openStore({ lookup: keys.lookup, authSecret: keys.authSecret, deviceName }, meta(client));
}

describe("identity service (Postgres)", () => {
  it("starts a store and authenticates its first phone", async () => {
    const { session } = await startStore();
    const auth = await service().authenticate(session.token);
    expect(auth.ok && auth.value).toEqual({ storeId: session.storeId, deviceId: session.deviceId });
  });

  it("stores no secret the server could use: only hashes and the wrapped key", async () => {
    const { session, code } = await startStore();
    const keys = await deriveStoreKeys(code);
    const dump = JSON.stringify(rowsOf(await db.execute(`select * from stores, devices`)));
    expect(dump).not.toContain(session.token);
    expect(dump).not.toContain(keys.authSecret);
    expect(dump).not.toContain(code);
  });

  it("opens the store on a second phone, which can then decrypt the first phone's records", async () => {
    const { code, dataKey, session } = await startStore();
    const sealed = await seal(dataKey, { name: "Aling Nena Santos" }, `${session.storeId}|r1`);

    // Typed on the other phone in lowercase with spaces, read by the same parser the app uses.
    const typed = parseRecoveryCode(code.toLowerCase().replace(/(.{5})/g, "$1 "));
    if (!typed) throw new Error("parse failed");
    const second = await openWith(typed);
    if (!second.ok) throw second.error;
    expect(second.value.storeId).toBe(session.storeId);
    expect(second.value.deviceId).not.toBe(session.deviceId);

    const keys = await deriveStoreKeys(code);
    const unwrapped = await unwrapDataKey(second.value.wrappedKey, keys.kek);
    expect(await open(unwrapped, sealed, `${session.storeId}|r1`)).toEqual({ name: "Aling Nena Santos" });
  });

  it("gives the same answer for a wrong code and an unknown store (no store enumeration)", async () => {
    await startStore();
    const wrong = await openWith(newCode());
    expect(!wrong.ok && wrong.error.code).toBe(ErrorCode.Unauthenticated);

    const { code } = await startStore();
    const keys = await deriveStoreKeys(code);
    const forged = await service().openStore({ lookup: keys.lookup, authSecret: (await deriveStoreKeys(newCode())).authSecret, deviceName: "x" }, meta("c"));
    expect(!forged.ok && forged.error.message).toBe(!wrong.ok && wrong.error.message);
  });

  it("rate-limits guessing from one client", async () => {
    for (let i = 0; i < LIMITS.openPerClient.limit; i++) await openWith(newCode(), "x", "attacker");
    const blocked = await openWith(newCode(), "x", "attacker");
    expect(!blocked.ok && blocked.error.code).toBe(ErrorCode.RateLimited);
    // A different client is unaffected, and the window resets.
    expect((await openWith(newCode(), "x", "someone-else")).ok).toBe(false);
    now = new Date(now.getTime() + LIMITS.openPerClient.windowSeconds * 1000);
    const later = await openWith(newCode(), "x", "attacker");
    expect(!later.ok && later.error.code).toBe(ErrorCode.Unauthenticated);
  });

  it("rejects missing, garbage and oversized tokens", async () => {
    for (const t of [undefined, "", "nope", "x".repeat(500)]) {
      const r = await service().authenticate(t);
      expect(!r.ok && r.error.code).toBe(ErrorCode.Unauthenticated);
    }
  });

  it("signs out a lost phone: it gets DEVICE_REVOKED, the others keep working", async () => {
    const { code, session } = await startStore();
    const lost = await openWith(code);
    if (!lost.ok) throw lost.error;

    const owner = await service().authenticate(session.token);
    if (!owner.ok) throw owner.error;
    expect((await service().revokeDevice(owner.value, lost.value.deviceId)).ok).toBe(true);

    const r = await service().authenticate(lost.value.token);
    expect(!r.ok && r.error.code).toBe(ErrorCode.DeviceRevoked);
    expect((await service().authenticate(session.token)).ok).toBe(true);

    const list = await service().listDevices(owner.value);
    expect(list.map((d) => [d.name, d.current, d.revokedAt !== null])).toEqual([
      ["Samsung Galaxy A15", true, false],
      ["Redmi 13C", false, true],
    ]);
  });

  it("never lets one store touch another store's phones", async () => {
    const a = await startStore();
    const b = await startStore();
    const authA = await service().authenticate(a.session.token);
    if (!authA.ok) throw authA.error;
    const r = await service().revokeDevice(authA.value, b.session.deviceId as DeviceId);
    expect(!r.ok && r.error.code).toBe(ErrorCode.NotFound);
    expect((await service().authenticate(b.session.token)).ok).toBe(true);
    expect((await service().listDevices(authA.value)).map((d) => d.id)).toEqual([a.session.deviceId]);
  });

  it("makes a new recovery code: old code stops working, open phones stay open, data key unchanged", async () => {
    const { code: oldCode, dataKey, session } = await startStore();
    const auth = await service().authenticate(session.token);
    if (!auth.ok) throw auth.error;

    const newer = newCode();
    const keys = await deriveStoreKeys(newer);
    const rotated = await service().rotateCode(auth.value, { lookup: keys.lookup, authSecret: keys.authSecret, wrappedKey: await wrapDataKey(dataKey, keys.kek) });
    expect(rotated.ok).toBe(true);

    expect((await openWith(oldCode)).ok).toBe(false);
    const viaNew = await openWith(newer);
    if (!viaNew.ok) throw viaNew.error;
    const sealed = await seal(dataKey, { v: 1 }, "ctx");
    expect(await open(await unwrapDataKey(viaNew.value.wrappedKey, keys.kek), sealed, "ctx")).toEqual({ v: 1 });
    expect((await service().authenticate(session.token)).ok).toBe(true);
  });

  it("deletes a store with all its phones", async () => {
    const { session, code } = await startStore();
    const auth = await service().authenticate(session.token);
    if (!auth.ok) throw auth.error;
    await service().deleteStore(auth.value);
    expect((await service().authenticate(session.token)).ok).toBe(false);
    expect((await openWith(code)).ok).toBe(false);
  });

  it("updates last-seen at most every five minutes", async () => {
    const { session } = await startStore();
    const seen = async () => rowsOf<{ last_seen_at: Date }>(await db.execute(`select last_seen_at from devices`))[0]!;
    const first = (await seen()).last_seen_at;
    now = new Date(Date.now() + 60_000);
    await service().authenticate(session.token);
    expect((await seen()).last_seen_at).toEqual(first);
    now = new Date(Date.now() + 10 * 60_000);
    await service().authenticate(session.token);
    expect(new Date((await seen()).last_seen_at).getTime()).toBe(now.getTime());
  });

  it("cleans device names", async () => {
    const r = await startStore(newCode(), "  My\u0007   phone  ");
    const auth = await service().authenticate(r.session.token);
    if (!auth.ok) throw auth.error;
    expect((await service().listDevices(auth.value))[0]?.name).toBe("My phone");
  });
});
