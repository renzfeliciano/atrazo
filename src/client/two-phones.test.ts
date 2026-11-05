import { v7 as uuidv7 } from "uuid";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { utf8 } from "@/core/encoding";
import { type Cents } from "@/core/money";
import { LocalDb } from "@/infrastructure/local-db/local-db";
import { type CustomerId } from "@/modules/ledger/domain/ids";
import { gzip } from "@/modules/sync/infrastructure/compression";
import { sealBytes } from "@/modules/vault/infrastructure/web-crypto";
import { buildContainer } from "@/server/container";
import { rowsOf } from "@/server/db/database";
import { createTestDatabase } from "@/server/db/test-db";
import { apiHandlers } from "@/server/routes";
import { createPhone, type Phone } from "./phone";

/**
 * End to end through every real layer except the browser: two phones (IndexedDB, Web Crypto,
 * gzip, the sync engine) talking to the real API handlers over a real Postgres engine (PGlite).
 */
const APP = "http://localhost:3000";
const P = (pesos: number) => (pesos * 100) as Cents;

let tdb: Awaited<ReturnType<typeof createTestDatabase>>;
let api: ReturnType<typeof apiHandlers>;
const dbs: LocalDb[] = [];

beforeAll(async () => {
  tdb = await createTestDatabase();
  const container = buildContainer(tdb.db, APP);
  api = apiHandlers(() => container);
});
afterAll(() => tdb.close());
beforeEach(() => tdb.reset());
afterEach(async () => {
  for (const d of dbs.splice(0)) {
    d.close();
    await d.delete();
  }
});

/** A network that routes to the API handlers, with a cookie jar per phone and an optional fault. */
function network(ip: string) {
  let cookie = "";
  let failNextPush = false;
  const fetchFn = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const u = new URL(url, APP);
    const method = (init.method ?? "GET").toUpperCase();
    if (failNextPush && method === "POST" && u.pathname === "/api/v1/sync") {
      failNextPush = false;
      throw new TypeError("Network request failed");
    }
    const headers = new Headers(init.headers);
    headers.set("origin", APP);
    headers.set("x-real-ip", ip);
    if (cookie) headers.set("cookie", cookie);
    const req = new Request(u, { method, headers, body: init.body ?? null });
    const route: Record<string, (r: Request) => Promise<Response>> = {
      "POST /api/v1/ledgers": api.createStore,
      "POST /api/v1/session": api.openSession,
      "POST /api/v1/sync": api.push,
      "GET /api/v1/sync": api.pull,
      "PUT /api/v1/ledgers/code": api.rotateCode,
      "DELETE /api/v1/ledgers": api.deleteStore,
      "DELETE /api/v1/session": api.closeSession,
      "GET /api/v1/devices": api.listDevices,
    };
    const handler =
      route[`${method} ${u.pathname}`] ??
      (method === "DELETE" && u.pathname.startsWith("/api/v1/devices/")
        ? api.revokeDevice
        : undefined);
    if (!handler) return new Response(null, { status: 404 });
    const res = await handler(req);
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!;
    return res;
  };
  return { fetchFn, failNextPush: () => (failNextPush = true) };
}

function phone(ip: string): { phone: Phone; net: ReturnType<typeof network> } {
  const db = new LocalDb(`phone-${crypto.randomUUID()}`);
  dbs.push(db);
  const net = network(ip);
  return { phone: createPhone({ db, fetch: net.fetchFn, baseUrl: APP }), net };
}

async function serverRows() {
  return rowsOf<{ ciphertext: string }>(
    await tdb.db.execute(`select ciphertext from changes order by seq`),
  );
}

async function nena(p: Phone) {
  const r = await p.commands.createCustomer({
    name: "Aling Nena Santos",
    phone: "0917 123 4567",
    creditLimit: P(3000),
  });
  if (!r.ok) throw r.error;
  return r.value.id;
}

describe("two phones, one store", () => {
  it("backs up a busy day as ONE encrypted row, and restores it on a second phone", async () => {
    const a = phone("203.0.113.1");
    const { code } = await a.phone.access.startStore("Samsung Galaxy A15");
    const nenaId = await nena(a.phone);
    const ben = await a.phone.commands.createCustomer({
      name: "Kuya Ben Dela Cruz",
      creditLimit: P(1500),
    });
    if (!ben.ok) throw ben.error;
    for (let i = 0; i < 30; i++) {
      await a.phone.commands.recordEntry({
        customerId: i % 2 ? nenaId : ben.value.id,
        kind: "utang",
        amount: P(50 + i),
        note: `Item ${i}`,
      });
    }
    await a.phone.commands.recordEntry({ customerId: nenaId, kind: "bayad", amount: P(200) });

    const engineA = await a.phone.engine();
    expect(await engineA.pushPending()).toBe(1);
    const rows = await serverRows();
    expect(rows).toHaveLength(1); // 33 changes, one row
    expect(rows[0]!.ciphertext.length).toBeLessThan(6000); // compressed
    expect(Buffer.from(rows[0]!.ciphertext, "base64url").includes("Nena")).toBe(false); // encrypted

    const b = phone("198.51.100.2");
    const opened = await b.phone.access.openStore(
      code.toLowerCase().replace(/-/g, " "),
      "Redmi 13C",
    );
    expect(opened.ok).toBe(true);
    const pulled = await (await b.phone.engine()).pullAll();
    expect(pulled).toEqual({ applied: 33, deferred: 0 });

    const [da, db] = await Promise.all([a.phone.queries.dashboard(), b.phone.queries.dashboard()]);
    expect(db.totalOwed).toBe(da.totalOwed);
    expect(db.customers.map((c) => c.customer.name).sort()).toEqual([
      "Aling Nena Santos",
      "Kuya Ben Dela Cruz",
    ]);
    const la = await a.phone.queries.customerLedger(nenaId);
    const lb = await b.phone.queries.customerLedger(nenaId);
    expect(lb?.account.balance).toBe(la?.account.balance);
    expect(lb?.rows.length).toBe(la?.rows.length);
  });

  it("carries changes both ways and applies each only once", async () => {
    const a = phone("203.0.113.1");
    const { code } = await a.phone.access.startStore("A");
    const nenaId = await nena(a.phone);
    await a.phone.commands.recordEntry({ customerId: nenaId, kind: "utang", amount: P(2300) });
    await (await a.phone.engine()).syncNow();

    const b = phone("198.51.100.2");
    await b.phone.access.openStore(code, "B");
    await (await b.phone.engine()).syncNow();
    await b.phone.commands.recordEntry({
      customerId: nenaId,
      kind: "bayad",
      amount: P(500),
      note: "GCash",
    });
    await b.phone.commands.updateCustomer(nenaId, {
      name: "Aling Nena Santos",
      phone: "0917 123 4567",
      creditLimit: P(3500),
    });
    await (await b.phone.engine()).syncNow();

    const engineA = await a.phone.engine();
    await engineA.syncNow();
    await engineA.syncNow(); // a second sync changes nothing
    const ledger = await a.phone.queries.customerLedger(nenaId);
    expect(ledger?.account.balance).toBe(P(1800));
    expect(ledger?.account.limit).toBe(P(3500));
    expect(ledger?.counts).toEqual({ all: 2, utang: 1, bayad: 1 });
  });

  it("retries the SAME bundle after a dropped upload, so nothing is stored twice", async () => {
    const a = phone("203.0.113.1");
    await a.phone.access.startStore("A");
    const nenaId = await nena(a.phone);
    await a.phone.commands.recordEntry({ customerId: nenaId, kind: "utang", amount: P(150) });

    a.net.failNextPush();
    const engine = await a.phone.engine();
    await expect(engine.pushPending()).rejects.toMatchObject({ code: "NETWORK" });
    expect(await engine.pushPending()).toBe(1);
    expect(await serverRows()).toHaveLength(1);
    expect(await a.phone.db.outbox.count()).toBe(0);
  });

  it("once a change is sealed for upload, Undo voids it instead of deleting it", async () => {
    const a = phone("203.0.113.1");
    await a.phone.access.startStore("A");
    const nenaId = await nena(a.phone);
    const r = await a.phone.commands.recordEntry({
      customerId: nenaId,
      kind: "utang",
      amount: P(150),
    });
    if (!r.ok) throw r.error;

    a.net.failNextPush();
    await expect((await a.phone.engine()).pushPending()).rejects.toBeTruthy(); // sealed + locked, not confirmed
    const undo = await a.phone.commands.undoEntry(r.value.entry.id);
    expect(undo.ok && undo.value).toBe("voided");
    expect((await a.phone.queries.customerLedger(nenaId))?.account.balance).toBe(0);
  });

  it("keeps records from a newer app version instead of dropping them", async () => {
    const a = phone("203.0.113.1");
    const { code } = await a.phone.access.startStore("A");
    const nenaId = await nena(a.phone);
    await (await a.phone.engine()).pushPending();

    // A future version of Atrazo uploads a bundle with types this version has never seen.
    const session = await a.phone.access.current();
    const bundleId = uuidv7();
    const future = {
      f: 1,
      r: [
        { t: "item.added", v: 1, d: { name: "Bigas 5kg" } },
        { t: "entry.added", v: 2, d: { whatever: true } },
        {
          t: "customer.saved",
          v: 1,
          d: {
            id: nenaId as CustomerId,
            name: "Aling Nena",
            phone: null,
            note: null,
            creditLimit: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2099-01-01T00:00:00.000Z",
            hiddenAt: null,
          },
        },
      ],
    };
    const sealed = await sealBytes(
      session!.dataKey,
      await gzip(utf8(JSON.stringify(future))),
      `${session!.storeId}|bundle|${bundleId}`,
    );
    const push = await a.net.fetchFn(`${APP}/api/v1/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ changes: [{ id: bundleId, ...sealed }] }),
    });
    expect(push.status).toBe(200);

    const b = phone("198.51.100.2");
    await b.phone.access.openStore(code, "B");
    const pulled = await (await b.phone.engine()).pullAll();
    expect(pulled).toEqual({ applied: 2, deferred: 2 });
    expect(await b.phone.db.deferred.count()).toBe(2);
    expect((await b.phone.db.customers.get(nenaId))?.name).toBe("Aling Nena"); // newer edit won
  });

  it("restores the store name and credit rules on the second phone", async () => {
    const a = phone("203.0.113.1");
    const { code } = await a.phone.access.startStore("A");
    const saved = await a.phone.commands.saveSettings({
      name: "Tindahan ni Aling Rosa",
      defaultLimit: P(1500),
      overdueAfterDays: 21,
    });
    expect(saved.ok).toBe(true);
    await (await a.phone.engine()).pushPending();

    const b = phone("198.51.100.2");
    await b.phone.access.openStore(code, "B");
    await (await b.phone.engine()).pullAll();
    expect(await b.phone.queries.settings()).toMatchObject({
      name: "Tindahan ni Aling Rosa",
      defaultLimit: P(1500),
      overdueAfterDays: 21,
    });
  });

  it("refuses a wrong recovery code on a new phone", async () => {
    const a = phone("203.0.113.1");
    await a.phone.access.startStore("A");
    const b = phone("198.51.100.2");
    await expect(
      b.phone.access.openStore("7KQ2M-XD9PA-R4TWE-H6NBZ-3FJC8", "B"),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const typo = await b.phone.access.openStore("7KQ2M-XD9PA", "B");
    expect(!typo.ok && typo.error.code).toBe("VALIDATION");
  });

  it("a new recovery code replaces the old one, and open phones keep working", async () => {
    const a = phone("203.0.113.1");
    const { code: oldCode } = await a.phone.access.startStore("A");
    await nena(a.phone);
    await (await a.phone.engine()).pushPending();

    const { code: newCode } = await a.phone.access.rotateCode();
    expect(newCode).not.toBe(oldCode);

    const b = phone("198.51.100.2");
    await expect(b.phone.access.openStore(oldCode, "B")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect((await b.phone.access.openStore(newCode, "B")).ok).toBe(true);
    expect(await (await b.phone.engine()).pullAll()).toEqual({ applied: 1, deferred: 0 }); // same data key

    // Phone A was never signed out and still backs up.
    await a.phone.commands.createCustomer({ name: "Kuya Ben" });
    expect(await (await a.phone.engine()).pushPending()).toBe(1);
  });

  it("lists the store's phones and signs a lost one out", async () => {
    const a = phone("203.0.113.1");
    const { code } = await a.phone.access.startStore("Samsung Galaxy A15");
    const b = phone("198.51.100.2");
    const opened = await b.phone.access.openStore(code, "Redmi 13C");
    if (!opened.ok) throw opened.error;

    const phones = await a.phone.access.listPhones();
    expect(phones.map((p) => [p.name, p.current]).sort()).toEqual([
      ["Redmi 13C", false],
      ["Samsung Galaxy A15", true],
    ]);

    await a.phone.access.signOutPhone(opened.value.deviceId);
    await expect((await b.phone.engine()).pullAll()).rejects.toMatchObject({
      code: "DEVICE_REVOKED",
    });
    const after = await a.phone.access.listPhones();
    expect(after.find((p) => p.name === "Redmi 13C")?.revokedAt).not.toBeNull();
  });

  it("deleting the store removes every backup, and the code stops working", async () => {
    const a = phone("203.0.113.1");
    const { code } = await a.phone.access.startStore("A");
    await nena(a.phone);
    await (await a.phone.engine()).pushPending();
    expect(await serverRows()).toHaveLength(1);

    await a.phone.access.deleteStore();
    expect(await serverRows()).toHaveLength(0);
    const b = phone("198.51.100.2");
    await expect(b.phone.access.openStore(code, "B")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
});
