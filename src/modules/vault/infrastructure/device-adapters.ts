import { API_BASE, APP_VERSION, APP_VERSION_HEADER } from "@/core/app-version";
import { type LocalDb } from "@/infrastructure/local-db/local-db";
import { DeviceListResponse, SessionResponse } from "@/modules/identity/api/contracts";
import { type FetchLike, toSyncError } from "@/modules/sync/infrastructure/http-sync-api";
import { type IdentityApi, type KeyStore } from "../application/ledger-access";

const SESSION_KEY = "vault.session";

/** The ledger session in the phone's own database (device table: never synced, wiped on sign-out). */
export function indexedDbKeyStore(db: LocalDb): KeyStore {
  return {
    save: async (s) => void (await db.device.put({ key: SESSION_KEY, value: s })),
    load: async () =>
      (await db.device.get(SESSION_KEY))?.value as Awaited<ReturnType<KeyStore["load"]>>,
  };
}

export function httpIdentityApi(
  fetchFn: FetchLike = (i, init) => fetch(i, init),
  baseUrl = "",
): IdentityApi {
  async function call(method: string, path: string, body?: unknown): Promise<Response> {
    const res = await fetchFn(baseUrl + API_BASE + path, {
      method,
      credentials: "same-origin",
      headers: {
        [APP_VERSION_HEADER]: APP_VERSION,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw await toSyncError(res);
    return res;
  }
  const session = async (path: string, body: unknown) =>
    SessionResponse.parse(await (await call("POST", path, body)).json());
  return {
    createLedger: (body) => session("/ledgers", body),
    openLedger: (body) => session("/session", body),
    rotateCode: async (body) => void (await call("PUT", "/ledgers/code", body)),
    listDevices: async () => DeviceListResponse.parse(await (await call("GET", "/devices")).json()),
    revokeDevice: async (id) => void (await call("DELETE", `/devices/${encodeURIComponent(id)}`)),
    closeSession: async () => void (await call("DELETE", "/session")),
    deleteLedger: async () => void (await call("DELETE", "/ledgers")),
  };
}
