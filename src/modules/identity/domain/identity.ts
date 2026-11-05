import { type Brand } from "@/core/brand";

export type StoreId = Brand<string, "StoreId">;
export type DeviceId = Brand<string, "DeviceId">;

/** Who is calling: a phone that holds a valid, unrevoked session for a store. */
export interface DeviceSession {
  readonly storeId: StoreId;
  readonly deviceId: DeviceId;
}

export interface Device {
  readonly id: DeviceId;
  readonly name: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly revokedAt: Date | null;
}

export const DEVICE_NAME_MAX = 60;

/** Trims and collapses whitespace, strips control characters, caps the length. */
export function cleanDeviceName(raw: string): string | null {
  const t = raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t ? t.slice(0, DEVICE_NAME_MAX) : null;
}

/** "Last seen" only needs minute-level freshness; skipping writes keeps the free database quiet. */
export const LAST_SEEN_RESOLUTION_MS = 5 * 60 * 1000;
