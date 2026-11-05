import { AppError, ErrorCode } from "@/core/errors";
import { err, ok, type Result } from "@/core/result";
import {
  type CreateStoreRequest,
  type OpenStoreRequest,
  type RotateCodeRequest,
} from "../api/contracts";
import {
  cleanDeviceName,
  type Device,
  type DeviceId,
  type DeviceSession,
  LAST_SEEN_RESOLUTION_MS,
  type StoreId,
} from "../domain/identity";
import { type IdentityRepository, type RateLimiter, type SecretTools } from "./ports";

export interface IdentityDeps {
  readonly repo: IdentityRepository;
  readonly secrets: SecretTools;
  readonly limiter: RateLimiter;
  readonly clock: { now(): Date };
}

export interface IssuedSession {
  readonly storeId: StoreId;
  readonly deviceId: DeviceId;
  /** Goes only into the HttpOnly cookie; the server keeps its hash. */
  readonly token: string;
  readonly wrappedKey: string;
}

/** The caller's network identity, already hashed by the HTTP layer (no raw IPs reach here). */
export interface RequestMeta {
  readonly clientKey: string;
}

/**
 * One generic message for "no such store" and "wrong secret", so the API never reveals whether
 * a store exists.
 */
const noMatch = () =>
  err(new AppError(ErrorCode.Unauthenticated, "That recovery code didn't match a store."));
const tooMany = (retry: number) =>
  err(
    new AppError(
      ErrorCode.RateLimited,
      `Too many attempts. Try again in ${Math.ceil(retry / 60)} minutes.`,
    ),
  );

export const LIMITS = {
  createPerClient: { limit: 5, windowSeconds: 3600 },
  openPerClient: { limit: 10, windowSeconds: 900 },
  openPerStore: { limit: 20, windowSeconds: 3600 },
} as const;

export function identityService({ repo, secrets, limiter, clock }: IdentityDeps) {
  return {
    async createStore(
      req: CreateStoreRequest,
      meta: RequestMeta,
    ): Promise<Result<IssuedSession, AppError>> {
      const rl = await limiter.hit(
        `create:${meta.clientKey}`,
        LIMITS.createPerClient.limit,
        LIMITS.createPerClient.windowSeconds,
      );
      if (!rl.allowed) return tooMany(rl.retryAfterSeconds);

      const name = cleanDeviceName(req.deviceName);
      if (!name)
        return err(
          new AppError(ErrorCode.Validation, "Name this phone", [
            { field: "deviceName", message: "Name this phone" },
          ]),
        );

      const storeId = secrets.newId() as StoreId;
      const deviceId = secrets.newId() as DeviceId;
      const token = secrets.newToken();
      const outcome = await repo.createStore(
        storeId,
        {
          codeLookup: req.lookup,
          authVerifier: secrets.hash(req.authSecret),
          wrappedKey: req.wrappedKey,
        },
        { id: deviceId, name, tokenHash: secrets.hash(token) },
      );
      // A lookup collision means a 256-bit HKDF output repeated: effectively impossible, but never overwrite.
      if (outcome === "lookup_taken")
        return err(
          new AppError(ErrorCode.Conflict, "Could not create the store. Please try again."),
        );
      return ok({ storeId, deviceId, token, wrappedKey: req.wrappedKey });
    },

    async openStore(
      req: OpenStoreRequest,
      meta: RequestMeta,
    ): Promise<Result<IssuedSession, AppError>> {
      const byClient = await limiter.hit(
        `open:${meta.clientKey}`,
        LIMITS.openPerClient.limit,
        LIMITS.openPerClient.windowSeconds,
      );
      if (!byClient.allowed) return tooMany(byClient.retryAfterSeconds);
      const byStore = await limiter.hit(
        `open-store:${secrets.hash(req.lookup)}`,
        LIMITS.openPerStore.limit,
        LIMITS.openPerStore.windowSeconds,
      );
      if (!byStore.allowed) return tooMany(byStore.retryAfterSeconds);

      const name = cleanDeviceName(req.deviceName);
      if (!name)
        return err(
          new AppError(ErrorCode.Validation, "Name this phone", [
            { field: "deviceName", message: "Name this phone" },
          ]),
        );

      const store = await repo.findStoreByLookup(req.lookup);
      // Hash even when the store is missing, so response time does not reveal whether it exists.
      const presented = secrets.hash(req.authSecret);
      if (!store || !secrets.equals(presented, store.authVerifier)) return noMatch();

      const deviceId = secrets.newId() as DeviceId;
      const token = secrets.newToken();
      if (!(await repo.addDevice(store.id, { id: deviceId, name, tokenHash: secrets.hash(token) })))
        return noMatch();
      return ok({ storeId: store.id, deviceId, token, wrappedKey: store.wrappedKey });
    },

    /** Resolves a session cookie. Revoked phones get a distinct error so they can wipe themselves. */
    async authenticate(token: string | undefined): Promise<Result<DeviceSession, AppError>> {
      if (!token || token.length > 128)
        return err(new AppError(ErrorCode.Unauthenticated, "Open your store to continue."));
      const record = await repo.findDeviceByTokenHash(secrets.hash(token));
      if (!record)
        return err(new AppError(ErrorCode.Unauthenticated, "Open your store to continue."));
      if (record.revokedAt)
        return err(
          new AppError(ErrorCode.DeviceRevoked, "This phone was signed out of the store."),
        );
      const now = clock.now();
      if (now.getTime() - record.lastSeenAt.getTime() > LAST_SEEN_RESOLUTION_MS)
        await repo.touchDevice(record.deviceId, now);
      return ok({ storeId: record.storeId, deviceId: record.deviceId });
    },

    async listDevices(session: DeviceSession): Promise<(Device & { current: boolean })[]> {
      const devices = await repo.listDevices(session.storeId);
      return devices.map((d) => ({ ...d, current: d.id === session.deviceId }));
    },

    async revokeDevice(
      session: DeviceSession,
      deviceId: DeviceId,
    ): Promise<Result<void, AppError>> {
      const done = await repo.revokeDevice(session.storeId, deviceId, clock.now());
      return done ? ok(undefined) : err(new AppError(ErrorCode.NotFound, "Phone not found"));
    },

    /** Replaces the recovery code. Phones already open stay open; the old code stops working. */
    async rotateCode(
      session: DeviceSession,
      req: RotateCodeRequest,
    ): Promise<Result<void, AppError>> {
      const outcome = await repo.updateCredentials(session.storeId, {
        codeLookup: req.lookup,
        authVerifier: secrets.hash(req.authSecret),
        wrappedKey: req.wrappedKey,
      });
      return outcome === "updated"
        ? ok(undefined)
        : err(new AppError(ErrorCode.Conflict, "Could not change the code. Please try again."));
    },

    async deleteStore(session: DeviceSession): Promise<void> {
      await repo.deleteStore(session.storeId);
    },
  };
}

export type IdentityService = ReturnType<typeof identityService>;
