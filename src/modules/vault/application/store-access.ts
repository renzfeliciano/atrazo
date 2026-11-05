import { AppError, ErrorCode } from "@/core/errors";
import { err, ok, type Result } from "@/core/result";
import { type CreateStoreRequest, type OpenStoreRequest, type SessionResponse } from "@/modules/identity/api/contracts";
import { formatRecoveryCode, generateRecoveryCode, parseRecoveryCode } from "../domain/recovery-code";
import { deriveStoreKeys, exportDataKey, generateDataKey, importDataKey, unwrapDataKey, wrapDataKey } from "../infrastructure/web-crypto";

/** What a phone keeps after opening a store. Lives only in the phone's own database. */
export interface StoreSession {
  readonly storeId: string;
  readonly deviceId: string;
  readonly dataKey: CryptoKey;
}

export interface IdentityApi {
  createStore(body: CreateStoreRequest): Promise<SessionResponse>;
  openStore(body: OpenStoreRequest): Promise<SessionResponse>;
}

export interface KeyStore {
  save(session: { storeId: string; deviceId: string; dataKey: string }): Promise<void>;
  load(): Promise<{ storeId: string; deviceId: string; dataKey: string } | undefined>;
}

/**
 * Starting and opening stores on a phone. The recovery code and the data key never leave the phone
 * in readable form: the server receives only derived values and the wrapped key.
 */
export function storeAccess(deps: { api: IdentityApi; keys: KeyStore; random?: (a: Uint8Array) => Uint8Array }) {
  const random = deps.random ?? ((a: Uint8Array) => crypto.getRandomValues(a));

  return {
    /** "Start my store". Returns the recovery code to show the owner exactly once. */
    async startStore(deviceName: string): Promise<{ code: string; session: StoreSession }> {
      const code = generateRecoveryCode(random);
      const keys = await deriveStoreKeys(code);
      const dataKey = await generateDataKey();
      const res = await deps.api.createStore({
        lookup: keys.lookup,
        authSecret: keys.authSecret,
        wrappedKey: await wrapDataKey(dataKey, keys.kek),
        deviceName,
      });
      await deps.keys.save({ storeId: res.storeId, deviceId: res.deviceId, dataKey: await exportDataKey(dataKey) });
      return { code: formatRecoveryCode(code), session: { storeId: res.storeId, deviceId: res.deviceId, dataKey } };
    },

    /** "I have a recovery code". */
    async openStore(typedCode: string, deviceName: string): Promise<Result<StoreSession, AppError>> {
      const code = parseRecoveryCode(typedCode);
      if (!code) {
        return err(new AppError(ErrorCode.Validation, "Check the code", [{ field: "code", message: "A recovery code has 25 letters and numbers in 5 groups" }]));
      }
      const keys = await deriveStoreKeys(code);
      const res = await deps.api.openStore({ lookup: keys.lookup, authSecret: keys.authSecret, deviceName });
      const dataKey = await unwrapDataKey(res.wrappedKey, keys.kek);
      await deps.keys.save({ storeId: res.storeId, deviceId: res.deviceId, dataKey: await exportDataKey(dataKey) });
      return ok({ storeId: res.storeId, deviceId: res.deviceId, dataKey });
    },

    async current(): Promise<StoreSession | undefined> {
      const saved = await deps.keys.load();
      if (!saved) return undefined;
      return { storeId: saved.storeId, deviceId: saved.deviceId, dataKey: await importDataKey(saved.dataKey) };
    },
  };
}

export type StoreAccess = ReturnType<typeof storeAccess>;
