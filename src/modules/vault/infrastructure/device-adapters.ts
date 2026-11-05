import { API_BASE, APP_VERSION, CLIENT_VERSION_HEADER } from "@/core/app-version";
import { type LocalDb } from "@/infrastructure/local-db/local-db";
import { SessionResponse } from "@/modules/identity/api/contracts";
import { type FetchLike, toSyncError } from "@/modules/sync/infrastructure/http-sync-api";
import { type IdentityApi, type KeyStore } from "../application/store-access";

const SESSION_KEY = "vault.session";

/** The store session in the phone's own database (device table: never synced, wiped on sign-out). */
export function indexedDbKeyStore(db: LocalDb): KeyStore {
  return {
    save: async (s) => void (await db.device.put({ key: SESSION_KEY, value: s })),
    load: async () => (await db.device.get(SESSION_KEY))?.value as Awaited<ReturnType<KeyStore["load"]>>,
  };
}

export function httpIdentityApi(fetchFn: FetchLike = (i, init) => fetch(i, init), baseUrl = ""): IdentityApi {
  async function post(path: string, body: unknown) {
    const res = await fetchFn(baseUrl + API_BASE + path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", [CLIENT_VERSION_HEADER]: APP_VERSION },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await toSyncError(res);
    return SessionResponse.parse(await res.json());
  }
  return {
    createStore: (body) => post("/stores", body),
    openStore: (body) => post("/session", body),
  };
}
