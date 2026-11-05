import { and, asc, eq, sql } from "drizzle-orm";
import { type Database, isUniqueViolation, rowsOf } from "@/server/db/database";
import { devices, stores } from "@/server/db/schema";
import { type Device, type DeviceId, type StoreId } from "../domain/identity";
import { type IdentityRepository } from "../application/ports";

export function postgresIdentityRepository(db: Database): IdentityRepository {
  return {
    async createStore(storeId, c, device) {
      // One statement: the device row exists only if the store row was inserted.
      const result = await db.execute(sql`
        with s as (
          insert into ${stores} (id, code_lookup, auth_verifier, wrapped_key)
          values (${storeId}, ${c.codeLookup}, ${c.authVerifier}, ${c.wrappedKey})
          on conflict (code_lookup) do nothing
          returning id
        )
        insert into ${devices} (id, store_id, name, token_hash)
        select ${device.id}, s.id, ${device.name}, ${device.tokenHash} from s
        returning id`);
      return rowsOf(result).length === 1 ? "created" : "lookup_taken";
    },

    async findStoreByLookup(codeLookup) {
      const [row] = await db
        .select({ id: stores.id, authVerifier: stores.authVerifier, wrappedKey: stores.wrappedKey })
        .from(stores)
        .where(eq(stores.codeLookup, codeLookup))
        .limit(1);
      return row ? { ...row, id: row.id as StoreId } : undefined;
    },

    async addDevice(storeId, device) {
      const result = await db.execute(sql`
        insert into ${devices} (id, store_id, name, token_hash)
        select ${device.id}, ${storeId}, ${device.name}, ${device.tokenHash}
        where exists (select 1 from ${stores} where id = ${storeId})
        returning id`);
      return rowsOf(result).length === 1;
    },

    async findDeviceByTokenHash(tokenHash) {
      const [row] = await db
        .select({
          deviceId: devices.id,
          storeId: devices.storeId,
          lastSeenAt: devices.lastSeenAt,
          revokedAt: devices.revokedAt,
        })
        .from(devices)
        .where(eq(devices.tokenHash, tokenHash))
        .limit(1);
      return row
        ? { ...row, deviceId: row.deviceId as DeviceId, storeId: row.storeId as StoreId }
        : undefined;
    },

    async touchDevice(deviceId, at) {
      await db.update(devices).set({ lastSeenAt: at }).where(eq(devices.id, deviceId));
    },

    async listDevices(storeId) {
      const rows = await db
        .select({
          id: devices.id,
          name: devices.name,
          createdAt: devices.createdAt,
          lastSeenAt: devices.lastSeenAt,
          revokedAt: devices.revokedAt,
        })
        .from(devices)
        .where(eq(devices.storeId, storeId))
        .orderBy(asc(devices.createdAt));
      return rows.map((r): Device => ({ ...r, id: r.id as DeviceId }));
    },

    async revokeDevice(storeId, deviceId, at) {
      const rows = await db
        .update(devices)
        .set({ revokedAt: sql`coalesce(${devices.revokedAt}, ${at.toISOString()}::timestamptz)` })
        .where(and(eq(devices.storeId, storeId), eq(devices.id, deviceId)))
        .returning({ id: devices.id });
      return rows.length === 1;
    },

    async updateCredentials(storeId, c) {
      try {
        await db
          .update(stores)
          .set({
            codeLookup: c.codeLookup,
            authVerifier: c.authVerifier,
            wrappedKey: c.wrappedKey,
            keyVersion: sql`${stores.keyVersion} + 1`,
            updatedAt: sql`now()`,
          })
          .where(eq(stores.id, storeId));
        return "updated";
      } catch (e) {
        if (isUniqueViolation(e)) return "lookup_taken";
        throw e;
      }
    },

    async deleteStore(storeId) {
      // Devices and encrypted changes go with it (on delete cascade).
      await db.delete(stores).where(eq(stores.id, storeId));
    },
  };
}
