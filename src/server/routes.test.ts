import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generateRecoveryCode } from "@/modules/vault/domain/recovery-code";
import { deriveStoreKeys, generateDataKey, wrapDataKey } from "@/modules/vault/infrastructure/web-crypto";
import { buildContainer } from "./container";
import { createTestDatabase } from "./db/test-db";
import { apiHandlers } from "./routes";

const APP = "http://localhost:3000";
let tdb: Awaited<ReturnType<typeof createTestDatabase>>;
let api: ReturnType<typeof apiHandlers>;

beforeAll(async () => {
  tdb = await createTestDatabase();
  const container = buildContainer(tdb.db, APP);
  api = apiHandlers(() => container);
});
afterAll(() => tdb.close());
beforeEach(() => tdb.reset());

type Init = { method?: string; body?: unknown; cookie?: string; origin?: string | null; headers?: Record<string, string>; ip?: string; path?: string };
function request({ method = "POST", body, cookie, origin = APP, headers = {}, ip = "203.0.113.7", path = "/api/x" }: Init) {
  const h: Record<string, string> = { "x-real-ip": ip, ...headers };
  if (origin) h.origin = origin;
  if (cookie) h.cookie = cookie;
  if (body !== undefined) h["content-type"] = h["content-type"] ?? "application/json";
  return new Request(APP + path, { method, headers: h, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
}

const cookieOf = (res: Response) => res.headers.get("set-cookie")!.split(";")[0]!;

async function startStore(deviceName = "Samsung Galaxy A15") {
  const code = generateRecoveryCode((a) => crypto.getRandomValues(a));
  const keys = await deriveStoreKeys(code);
  const wrappedKey = await wrapDataKey(await generateDataKey(), keys.kek);
  const res = await api.createStore(request({ body: { lookup: keys.lookup, authSecret: keys.authSecret, wrappedKey, deviceName } }));
  return { res, code, keys, cookie: cookieOf(res), json: (await res.json()) as { storeId: string; deviceId: string } };
}

const change = () => ({ id: uuidv7(), iv: "AAAAAAAAAAAAAAAA", ciphertext: "B".repeat(64) });

describe("HTTP API", () => {
  it("starts a store: 201, session in an HttpOnly SameSite=Strict cookie, never in the body", async () => {
    const { res, json } = await startStore();
    expect(res.status).toBe(201);
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Strict/);
    expect(setCookie).toMatch(/Path=\//);
    expect(Object.keys(json).sort()).toEqual(["deviceId", "storeId", "wrappedKey"]);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("blocks cross-site writes", async () => {
    const res = await api.createStore(request({ body: {}, origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    const fetchSite = await api.createStore(request({ body: {}, origin: null, headers: { "sec-fetch-site": "cross-site" } }));
    expect(fetchSite.status).toBe(403);
  });

  it("rejects bad bodies with one error shape and field issues", async () => {
    const wrongType = await api.openSession(request({ body: "{}", headers: { "content-type": "text/plain" } }));
    expect(wrongType.status).toBe(400);
    const malformed = await api.openSession(request({ body: "{nope" }));
    expect(((await malformed.json()) as { error: { message: string } }).error.message).toBe("Malformed JSON");
    const smuggled = await api.openSession(request({ body: { lookup: "x", authSecret: "y", deviceName: "p", admin: true } }));
    const err = (await smuggled.json()) as { error: { code: string; issues: { field: string }[] } };
    expect(smuggled.status).toBe(400);
    expect(err.error.code).toBe("VALIDATION");
    expect(err.error.issues.map((i) => i.field)).toEqual(expect.arrayContaining(["lookup", "authSecret"]));
  });

  it("refuses oversized bodies before parsing them", async () => {
    const res = await api.openSession(request({ body: JSON.stringify({ pad: "x".repeat(20_000) }) }));
    expect(res.status).toBe(413);
  });

  it("requires a session for store data and never leaks internals", async () => {
    const res = await api.pull(request({ method: "GET", path: "/api/sync" }));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("UNAUTHENTICATED");
    expect(JSON.stringify(body)).not.toMatch(/at \w+ \(|node_modules|postgres/i);
    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("backs up and restores across phones; each store sees only its own changes", async () => {
    const a = await startStore();
    const b = await startStore();
    const pushed = await api.push(request({ cookie: a.cookie, body: { changes: [change(), change()] } }));
    expect(await pushed.json()).toEqual({ accepted: 2 });

    const second = await api.openSession(request({ body: { lookup: a.keys.lookup, authSecret: a.keys.authSecret, deviceName: "Redmi 13C" }, ip: "198.51.100.2" }));
    expect(second.status).toBe(201);
    const pulled = (await (await api.pull(request({ method: "GET", cookie: cookieOf(second), path: "/api/sync?after=0" }))).json()) as { changes: unknown[] };
    expect(pulled.changes).toHaveLength(2);

    const other = (await (await api.pull(request({ method: "GET", cookie: b.cookie, path: "/api/sync" }))).json()) as { changes: unknown[] };
    expect(other.changes).toHaveLength(0);
  });

  it("signs out a lost phone: its next request gets 410 and a cleared cookie", async () => {
    const a = await startStore();
    const lost = await api.openSession(request({ body: { lookup: a.keys.lookup, authSecret: a.keys.authSecret, deviceName: "Redmi 13C" } }));
    const lostId = ((await lost.json()) as { deviceId: string }).deviceId;

    const revoke = await api.revokeDevice(request({ method: "DELETE", cookie: a.cookie, path: `/api/devices/${lostId}` }));
    expect(revoke.status).toBe(204);

    const res = await api.pull(request({ method: "GET", cookie: cookieOf(lost), path: "/api/sync" }));
    expect(res.status).toBe(410);
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0/);

    const list = (await (await api.listDevices(request({ method: "GET", cookie: a.cookie }))).json()) as { devices: { name: string; revokedAt: string | null }[] };
    expect(list.devices.map((d) => [d.name, d.revokedAt !== null])).toEqual([
      ["Samsung Galaxy A15", false],
      ["Redmi 13C", true],
    ]);
  });

  it("asks phones on a too-old app version to update, and serves newer ones", async () => {
    const strict = apiHandlers(() => buildContainer(tdb.db, APP, undefined, "1.2.0"));
    const old = await strict.pull(request({ method: "GET", path: "/api/v1/sync", headers: { "x-atrazo-client": "1.1.9" } }));
    expect(old.status).toBe(426);
    expect(((await old.json()) as { error: { code: string } }).error.code).toBe("UPGRADE_REQUIRED");
    const current = await strict.pull(request({ method: "GET", path: "/api/v1/sync", headers: { "x-atrazo-client": "1.2.0" } }));
    expect(current.status).toBe(401); // passes the version gate, then needs a session
  });

  it("validates path parameters", async () => {
    const a = await startStore();
    const res = await api.revokeDevice(request({ method: "DELETE", cookie: a.cookie, path: "/api/devices/not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  it("signing out this phone revokes its session", async () => {
    const a = await startStore();
    const out = await api.closeSession(request({ method: "DELETE", cookie: a.cookie }));
    expect(out.status).toBe(204);
    expect((await api.listDevices(request({ method: "GET", cookie: a.cookie }))).status).toBe(410);
  });

  it("deleting the store removes everything", async () => {
    const a = await startStore();
    await api.push(request({ cookie: a.cookie, body: { changes: [change()] } }));
    expect((await api.deleteStore(request({ method: "DELETE", cookie: a.cookie }))).status).toBe(204);
    expect((await api.pull(request({ method: "GET", cookie: a.cookie, path: "/api/sync" }))).status).toBe(401);
    const counts = await tdb.db.execute(`select (select count(*) from stores) s, (select count(*) from changes) c, (select count(*) from devices) d`);
    expect((counts as unknown as { rows: Record<string, unknown>[] }).rows[0]).toEqual({ s: 0, c: 0, d: 0 });
  });
});
