import { api, deprecatedAlias } from "@/server/next-api";

/** Deprecated: renamed to /api/v1/ledgers/code. Kept so phones running an older version keep working. */
export const PUT = deprecatedAlias(api.rotateCode, "/api/v1/ledgers/code");
