import { type Device, type DeviceId, type LedgerId } from "../domain/identity";

export interface LedgerCredentials {
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
  readonly ledgerId: LedgerId;
  readonly lastSeenAt: Date;
  readonly revokedAt: Date | null;
}

/** Every operation is a single atomic statement, so it is safe on a transaction-less HTTP driver. */
export interface IdentityRepository {
  createLedger(
    ledgerId: LedgerId,
    credentials: LedgerCredentials,
    device: NewDevice,
  ): Promise<"created" | "lookup_taken">;
  findLedgerByLookup(
    codeLookup: string,
  ): Promise<{ id: LedgerId; authVerifier: string; wrappedKey: string } | undefined>;
  /** Fails (returns false) if the ledger no longer exists. */
  addDevice(ledgerId: LedgerId, device: NewDevice): Promise<boolean>;
  findDeviceByTokenHash(tokenHash: string): Promise<DeviceAuthRecord | undefined>;
  touchDevice(deviceId: DeviceId, at: Date): Promise<void>;
  listDevices(ledgerId: LedgerId): Promise<Device[]>;
  /** Scoped by ledger: a phone can never revoke another ledger's phone. */
  revokeDevice(ledgerId: LedgerId, deviceId: DeviceId, at: Date): Promise<boolean>;
  updateCredentials(
    ledgerId: LedgerId,
    credentials: LedgerCredentials,
  ): Promise<"updated" | "lookup_taken">;
  deleteLedger(ledgerId: LedgerId): Promise<void>;
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
  hit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}
