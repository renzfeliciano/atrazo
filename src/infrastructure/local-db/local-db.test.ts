import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { CodecRegistry } from "@/modules/sync/domain/bundle";
import {
  type ApplyContext,
  registerLedgerCodecs,
} from "@/modules/ledger/infrastructure/ledger-sync-codecs";
import { SETTINGS_KEY } from "@/modules/ledger/infrastructure/indexeddb-ledger";
import { SETTINGS_ENTITY_ID } from "@/modules/ledger/application/ports";
import { LocalDb } from "./local-db";

const settings = {
  name: "Kuya Travis Renz",
  defaultLimit: 500_000,
  overdueAfterDays: 30,
  updatedAt: new Date("2026-11-01T00:00:00Z"),
};

/** A phone database exactly as app versions before v3 left it. */
async function seedVersion2(name: string) {
  const old = new Dexie(name);
  old.version(1).stores({
    customers: "id, name, hiddenAt",
    entries: "id, customerId, occurredAt",
    outbox: "++seq, entityId",
    settings: "key",
    device: "key",
  });
  old.version(2).stores({ outbox: "++seq, entityId, bundleId", deferred: "++id, type" });
  await old.open();
  await old.table("settings").put({ key: "store", value: settings });
  await old.table("device").put({
    key: "vault.session",
    value: { storeId: "ledger-1", deviceId: "device-1", dataKey: "key" },
  });
  await old.table("outbox").add({
    entityId: "store-settings",
    change: { type: "settings.saved", settings },
    createdAt: new Date(),
  });
  old.close();
}

describe("phone database upgrade to v3 (store → ledger names)", () => {
  it("moves the settings, the session id and the pending settings change", async () => {
    await seedVersion2("upgrade-test");
    const db = new LocalDb("upgrade-test");

    expect((await db.settings.get(SETTINGS_KEY))?.value).toEqual(settings);
    expect(await db.settings.get("store")).toBeUndefined();
    expect((await db.device.get("vault.session"))?.value).toEqual({
      ledgerId: "ledger-1",
      deviceId: "device-1",
      dataKey: "key",
    });
    const pending = await db.outbox.toArray();
    expect(pending.map((r) => r.entityId)).toEqual([SETTINGS_ENTITY_ID]);
    db.close();
  });

  it("starts empty on a new phone", async () => {
    const db = new LocalDb("fresh-test");
    expect(await db.settings.count()).toBe(0);
    expect(await db.device.count()).toBe(0);
    db.close();
  });
});

describe("settings records in backups", () => {
  it("restores settings from backups written before the rename", async () => {
    const db = new LocalDb("legacy-backup-test");
    const registry = registerLedgerCodecs(new CodecRegistry<ApplyContext>());
    const record = {
      t: "store.settings",
      v: 1,
      d: { ...settings, updatedAt: settings.updatedAt.toISOString() },
    };
    const codec = registry.find(record);
    expect(codec).toBeDefined();
    await codec!.apply(codec!.schema.parse(record.d), { db });
    expect((await db.settings.get(SETTINGS_KEY))?.value).toEqual(settings);
    db.close();
  });
});
