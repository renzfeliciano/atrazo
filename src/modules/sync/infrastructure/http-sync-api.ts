import { API_BASE, APP_VERSION, APP_VERSION_HEADER } from "@/core/app-version";
import { type ErrorCode } from "@/core/errors";
import { PullResponse } from "../api/contracts";
import { type SyncApi } from "../application/phone-ports";

/** An HTTP failure with the server's stable error code, so the coordinator can react precisely. */
export class SyncHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | "NETWORK",
    readonly retryAfterSeconds: number | null,
  ) {
    super(`Sync request failed: ${status} ${code}`);
    this.name = "SyncHttpError";
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function toSyncError(res: Response): Promise<SyncHttpError> {
  let code: ErrorCode | "NETWORK" = "INTERNAL" as ErrorCode;
  try {
    code = ((await res.json()) as { error?: { code?: ErrorCode } }).error?.code ?? code;
  } catch {
    /* non-JSON error body: keep the generic code */
  }
  const retry = Number(res.headers.get("retry-after"));
  return new SyncHttpError(res.status, code, Number.isFinite(retry) && retry > 0 ? retry : null);
}

export function httpSyncApi(
  fetchFn: FetchLike = (i, init) => fetch(i, init),
  baseUrl = "",
): SyncApi {
  const headers = { [APP_VERSION_HEADER]: APP_VERSION };

  async function call(path: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetchFn(baseUrl + API_BASE + path, {
        credentials: "same-origin",
        ...init,
        headers: { ...headers, ...(init.headers as Record<string, string>) },
      });
    } catch {
      throw new SyncHttpError(0, "NETWORK", null);
    }
    if (!res.ok) throw await toSyncError(res);
    return res;
  }

  return {
    async push(bundles, opts = {}) {
      await call("/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ changes: bundles }),
        // Lets the last backup finish even while the app is being closed.
        keepalive: opts.keepalive ?? false,
      });
    },
    async pull(after, limit) {
      const res = await call(`/sync?after=${encodeURIComponent(after)}&limit=${limit}`, {
        method: "GET",
      });
      return PullResponse.parse(await res.json());
    },
  };
}
