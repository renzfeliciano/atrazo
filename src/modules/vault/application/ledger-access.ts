import { AppError, ErrorCode } from "@/core/errors";
import { err, ok, type Result } from "@/core/result";
import {
  type CreateLedgerRequest,
  type DeviceListResponse,
  type OpenLedgerRequest,
  type RotateCodeRequest,
  type SessionResponse,
} from "@/modules/identity/api/contracts";
import {
  formatRecoveryCode,
  generateRecoveryCode,
  parseRecoveryCode,
} from "../domain/recovery-code";
import {
  deriveLedgerKeys,
  exportDataKey,
  generateDataKey,
  importDataKey,
  unwrapDataKey,
  wrapDataKey,
} from "../infrastructure/web-crypto";

/** What a phone keeps after opening a ledger. Lives only in the phone's own database. */
export interface LedgerSession {
  readonly ledgerId: string;
  readonly deviceId: string;
  readonly dataKey: CryptoKey;
}

export interface IdentityApi {
  createLedger(body: CreateLedgerRequest): Promise<SessionResponse>;
  openLedger(body: OpenLedgerRequest): Promise<SessionResponse>;
  rotateCode(body: RotateCodeRequest): Promise<void>;
  listDevices(): Promise<DeviceListResponse>;
  revokeDevice(deviceId: string): Promise<void>;
  /** Signs this phone out on the server (its session stops working everywhere). */
  closeSession(): Promise<void>;
  /** Deletes the ledger, its phones and all its backups from the server. */
  deleteLedger(): Promise<void>;
}

export type PhoneInfo = DeviceListResponse["devices"][number];

export interface KeyStore {
  save(session: { ledgerId: string; deviceId: string; dataKey: string }): Promise<void>;
  load(): Promise<{ ledgerId: string; deviceId: string; dataKey: string } | undefined>;
}

/**
 * Starting and opening ledgers on a phone. The recovery code and the data key never leave the phone
 * in readable form: the server receives only derived values and the wrapped key.
 */
export function ledgerAccess(deps: {
  api: IdentityApi;
  keys: KeyStore;
  random?: (a: Uint8Array) => Uint8Array;
}) {
  const random = deps.random ?? ((a: Uint8Array) => crypto.getRandomValues(a));

  async function current(): Promise<LedgerSession | undefined> {
    const saved = await deps.keys.load();
    if (!saved) return undefined;
    return {
      ledgerId: saved.ledgerId,
      deviceId: saved.deviceId,
      dataKey: await importDataKey(saved.dataKey),
    };
  }

  return {
    current,

    /** "Start my listahan". Returns the recovery code to show the owner exactly once. */
    async startLedger(deviceName: string): Promise<{ code: string; session: LedgerSession }> {
      const code = generateRecoveryCode(random);
      const keys = await deriveLedgerKeys(code);
      const dataKey = await generateDataKey();
      const res = await deps.api.createLedger({
        lookup: keys.lookup,
        authSecret: keys.authSecret,
        wrappedKey: await wrapDataKey(dataKey, keys.kek),
        deviceName,
      });
      await deps.keys.save({
        ledgerId: res.ledgerId,
        deviceId: res.deviceId,
        dataKey: await exportDataKey(dataKey),
      });
      return {
        code: formatRecoveryCode(code),
        session: { ledgerId: res.ledgerId, deviceId: res.deviceId, dataKey },
      };
    },

    /** "I have a recovery code". */
    async openLedger(
      typedCode: string,
      deviceName: string,
    ): Promise<Result<LedgerSession, AppError>> {
      const code = parseRecoveryCode(typedCode);
      if (!code) {
        return err(
          new AppError(ErrorCode.Validation, "Check the code", [
            { field: "code", message: "A recovery code has 25 letters and numbers in 5 groups" },
          ]),
        );
      }
      const keys = await deriveLedgerKeys(code);
      const res = await deps.api.openLedger({
        lookup: keys.lookup,
        authSecret: keys.authSecret,
        deviceName,
      });
      const dataKey = await unwrapDataKey(res.wrappedKey, keys.kek);
      await deps.keys.save({
        ledgerId: res.ledgerId,
        deviceId: res.deviceId,
        dataKey: await exportDataKey(dataKey),
      });
      return ok({ ledgerId: res.ledgerId, deviceId: res.deviceId, dataKey });
    },

    /**
     * "Make a new recovery code". The data key stays the same (so nothing is re-encrypted); it is
     * wrapped with a key derived from the new code, and the server swaps the lookup and verifier.
     * The old code stops opening the ledger; phones already open stay open.
     */
    async rotateCode(): Promise<{ code: string }> {
      const session = await current();
      if (!session)
        throw new AppError(ErrorCode.Unauthenticated, "No listahan is open on this phone");
      const code = generateRecoveryCode(random);
      const keys = await deriveLedgerKeys(code);
      await deps.api.rotateCode({
        lookup: keys.lookup,
        authSecret: keys.authSecret,
        wrappedKey: await wrapDataKey(session.dataKey, keys.kek),
      });
      return { code: formatRecoveryCode(code) };
    },

    listPhones: () => deps.api.listDevices().then((r) => r.devices),
    signOutPhone: (deviceId: string) => deps.api.revokeDevice(deviceId),
    /** Server side of "Sign out of this phone"; the caller then erases the phone's copy. */
    signOut: () => deps.api.closeSession(),
    deleteLedger: () => deps.api.deleteLedger(),
  };
}

export type LedgerAccess = ReturnType<typeof ledgerAccess>;
