import { z } from "zod";
import { DEVICE_NAME_MAX } from "../domain/identity";

/**
 * Wire contracts for the identity API, shared by the phone (to build requests) and the server
 * (to validate them). Unknown keys are rejected so typos and smuggled fields fail loudly.
 */
const b64url = (bytes: number) =>
  z
    .string()
    .length(Math.ceil((bytes * 4) / 3))
    .regex(/^[A-Za-z0-9_-]+$/, "must be base64url");

export const CodeLookup = b64url(32);
export const AuthSecret = b64url(32);
/** AES-KW output for a 256-bit key: 40 bytes. */
export const WrappedKey = b64url(40);
export const DeviceName = z.string().trim().min(1).max(DEVICE_NAME_MAX);

export const CreateStoreRequest = z.strictObject({
  lookup: CodeLookup,
  authSecret: AuthSecret,
  wrappedKey: WrappedKey,
  deviceName: DeviceName,
});
export type CreateStoreRequest = z.infer<typeof CreateStoreRequest>;

export const OpenStoreRequest = z.strictObject({
  lookup: CodeLookup,
  authSecret: AuthSecret,
  deviceName: DeviceName,
});
export type OpenStoreRequest = z.infer<typeof OpenStoreRequest>;

export const RotateCodeRequest = z.strictObject({
  lookup: CodeLookup,
  authSecret: AuthSecret,
  wrappedKey: WrappedKey,
});
export type RotateCodeRequest = z.infer<typeof RotateCodeRequest>;

export const SessionResponse = z.strictObject({
  storeId: z.uuid(),
  deviceId: z.uuid(),
  wrappedKey: WrappedKey,
});
export type SessionResponse = z.infer<typeof SessionResponse>;

export const DeviceDto = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
  current: z.boolean(),
});
export const DeviceListResponse = z.strictObject({ devices: z.array(DeviceDto) });
export type DeviceListResponse = z.infer<typeof DeviceListResponse>;
