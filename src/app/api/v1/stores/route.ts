import { api, deprecatedAlias } from "@/server/next-api";

/** Deprecated: renamed to /api/v1/ledgers. Kept so phones running an older version keep working. */
export const POST = deprecatedAlias(api.createStore, "/api/v1/ledgers");
export const DELETE = deprecatedAlias(api.deleteStore, "/api/v1/ledgers");
