import { AppError, ErrorCode } from "@/core/errors";
import { err, ok, type Result } from "@/core/result";
import {
  type CreateLedgerRequest,
  type OpenLedgerRequest,
  type RotateCodeRequest,
} from "../api/contracts";
import {
  cleanDeviceName,
  type Device,
  type DeviceId,
  type DeviceSession,
  LAST_SEEN_RESOLUTION_MS,
  type LedgerId,
} from "../domain/identity";
import { type IdentityRepository, type RateLimiter, type SecretTools } from "./ports";

export interface IdentityDeps {
  readonly repo: IdentityRepository;
  readonly secrets: SecretTools;
  readonly limiter: RateLimiter;
  readonly clock: { now(): Date };
}

export interface IssuedSession {
  readonly ledgerId: LedgerId;
  readonly deviceId: DeviceId;
  /** Goes only into the HttpOnly cookie; the server keeps its hash. */
  readonly token: string;
  readonly wrappedKey: string;
}

/** The caller's network identity, already hashed by the HTTP layer (no raw IPs reach here). */
export interface RequestMeta {
  readonly requesterKey: string;
}

/**
 * One generic message for "no such ledger" and "wrong secret", so the API never reveals whether
 * a ledger exists.
 */
const noMatch = () =>
  err(new AppError(ErrorCode.Unauthenticated, "That recovery code didn't match a listahan."));
const tooMany = (retry: number) =>
  err(
    new AppError(
      ErrorCode.RateLimited,
      `Too many attempts. Try again in ${Math.ceil(retry / 60)} minutes.`,
    ),
  );

export const LIMITS = {
  createPerRequester: { limit: 5, windowSeconds: 3600 },
  openPerRequester: { limit: 10, windowSeconds: 900 },
  openPerLedger: { limit: 20, windowSeconds: 3600 },
} as const;

export function identityService({ repo, secrets, limiter, clock }: IdentityDeps) {
  return {
    async createLedger(
      req: CreateLedgerRequest,
      meta: RequestMeta,
    ): Promise<Result<IssuedSession, AppError>> {
      const rl = await limiter.hit(
        `create:${meta.requesterKey}`,
        LIMITS.createPerRequester.limit,
        LIMITS.createPerRequester.windowSeconds,
      );
      if (!rl.allowed) return tooMany(rl.retryAfterSeconds);

      const name = cleanDeviceName(req.deviceName);
      if (!name)
        return err(
          new AppError(ErrorCode.Validation, "Name this phone", [
            { field: "deviceName", message: "Name this phone" },
          ]),
        );

      const ledgerId = secrets.newId() as LedgerId;
      const deviceId = secrets.newId() as DeviceId;
      const token = secrets.newToken();
      const outcome = await repo.createLedger(
        ledgerId,
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
          new AppError(ErrorCode.Conflict, "Could not create the listahan. Please try again."),
        );
      return ok({ ledgerId, deviceId, token, wrappedKey: req.wrappedKey });
    },

    async openLedger(
      req: OpenLedgerRequest,
      meta: RequestMeta,
    ): Promise<Result<IssuedSession, AppError>> {
      const byRequester = await limiter.hit(
        `open:${meta.requesterKey}`,
        LIMITS.openPerRequester.limit,
        LIMITS.openPerRequester.windowSeconds,
      );
      if (!byRequester.allowed) return tooMany(byRequester.retryAfterSeconds);
      const byLedger = await limiter.hit(
        `open-ledger:${secrets.hash(req.lookup)}`,
        LIMITS.openPerLedger.limit,
        LIMITS.openPerLedger.windowSeconds,
      );
      if (!byLedger.allowed) return tooMany(byLedger.retryAfterSeconds);

      const name = cleanDeviceName(req.deviceName);
      if (!name)
        return err(
          new AppError(ErrorCode.Validation, "Name this phone", [
            { field: "deviceName", message: "Name this phone" },
          ]),
        );

      const ledger = await repo.findLedgerByLookup(req.lookup);
      // Hash even when the ledger is missing, so response time does not reveal whether it exists.
      const presented = secrets.hash(req.authSecret);
      if (!ledger || !secrets.equals(presented, ledger.authVerifier)) return noMatch();

      const deviceId = secrets.newId() as DeviceId;
      const token = secrets.newToken();
      if (
        !(await repo.addDevice(ledger.id, { id: deviceId, name, tokenHash: secrets.hash(token) }))
      )
        return noMatch();
      return ok({ ledgerId: ledger.id, deviceId, token, wrappedKey: ledger.wrappedKey });
    },

    /** Resolves a session cookie. Revoked phones get a distinct error so they can wipe themselves. */
    async authenticate(token: string | undefined): Promise<Result<DeviceSession, AppError>> {
      if (!token || token.length > 128)
        return err(new AppError(ErrorCode.Unauthenticated, "Open your listahan to continue."));
      const record = await repo.findDeviceByTokenHash(secrets.hash(token));
      if (!record)
        return err(new AppError(ErrorCode.Unauthenticated, "Open your listahan to continue."));
      if (record.revokedAt)
        return err(
          new AppError(ErrorCode.DeviceRevoked, "This phone was signed out of the listahan."),
        );
      const now = clock.now();
      if (now.getTime() - record.lastSeenAt.getTime() > LAST_SEEN_RESOLUTION_MS)
        await repo.touchDevice(record.deviceId, now);
      return ok({ ledgerId: record.ledgerId, deviceId: record.deviceId });
    },

    async listDevices(session: DeviceSession): Promise<(Device & { current: boolean })[]> {
      const devices = await repo.listDevices(session.ledgerId);
      return devices.map((d) => ({ ...d, current: d.id === session.deviceId }));
    },

    async revokeDevice(
      session: DeviceSession,
      deviceId: DeviceId,
    ): Promise<Result<void, AppError>> {
      const done = await repo.revokeDevice(session.ledgerId, deviceId, clock.now());
      return done ? ok(undefined) : err(new AppError(ErrorCode.NotFound, "Phone not found"));
    },

    /** Replaces the recovery code. Phones already open stay open; the old code stops working. */
    async rotateCode(
      session: DeviceSession,
      req: RotateCodeRequest,
    ): Promise<Result<void, AppError>> {
      const outcome = await repo.updateCredentials(session.ledgerId, {
        codeLookup: req.lookup,
        authVerifier: secrets.hash(req.authSecret),
        wrappedKey: req.wrappedKey,
      });
      return outcome === "updated"
        ? ok(undefined)
        : err(new AppError(ErrorCode.Conflict, "Could not change the code. Please try again."));
    },

    async deleteLedger(session: DeviceSession): Promise<void> {
      await repo.deleteLedger(session.ledgerId);
    },
  };
}

export type IdentityService = ReturnType<typeof identityService>;
