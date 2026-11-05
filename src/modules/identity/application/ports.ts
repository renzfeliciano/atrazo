import { type Device, type DeviceId, type StoreId } from "../domain/identity";

export interface StoreCredentials {
  readonly codeLookup: string;
  readonly authVerifier: string;
  readonly wrappedKey: string;
}

export interface NewDevice {
  readonly id: DeviceId;
  readonly name: string;
  readonly tokenHash: string;
}

export interface DeviceAuthRecord {
  readonly deviceId: DeviceId;
  readonly storeId: StoreId;
  readonly lastSeenAt: Date;
  readonly revokedAt: Date | null;
}

/** Every operation is a single atomic statement, so it is safe on a transaction-less HTTP driver. */
export interface IdentityRepository {
  createStore(storeId: StoreId, credentials: StoreCredentials, device: NewDevice): Promise<"created" | "lookup_taken">;
  findStoreByLookup(codeLookup: string): Promise<{ id: StoreId; authVerifier: string; wrappedKey: string } | undefined>;
  /** Fails (returns false) if the store no longer exists. */
  addDevice(storeId: StoreId, device: NewDevice): Promise<boolean>;
  findDeviceByTokenHash(tokenHash: string): Promise<DeviceAuthRecord | undefined>;
  touchDevice(deviceId: DeviceId, at: Date): Promise<void>;
  listDevices(storeId: StoreId): Promise<Device[]>;
  /** Scoped by store: a phone can never revoke another store's phone. */
  revokeDevice(storeId: StoreId, deviceId: DeviceId, at: Date): Promise<boolean>;
  updateCredentials(storeId: StoreId, credentials: StoreCredentials): Promise<"updated" | "lookup_taken">;
  deleteStore(storeId: StoreId): Promise<void>;
}

export interface SecretTools {
  /** 256-bit random session token, base64url. */
  newToken(): string;
  /** SHA-256, base64url. */
  hash(value: string): string;
  /** Constant-time string comparison. */
  equals(a: string, b: string): boolean;
  newId(): string;
}

export interface RateLimiter {
  /** Counts one hit against `key`; `allowed` is false once `limit` is exceeded within the window. */
  hit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}
