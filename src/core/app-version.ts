/**
 * Versioning shared by the phone and the server.
 *
 * - The API lives under /api/v1. A breaking change ships as /api/v2 while v1 keeps serving
 *   phones that have not updated yet.
 * - Phones send their app version on every request; the server can refuse versions too old to
 *   be safe (426 UPGRADE_REQUIRED) and the app then shows "Update Atrazo".
 */
export const API_BASE = "/api/v1";
export const APP_VERSION_HEADER = "x-atrazo-version";

/** Set at build time from package.json (next.config.ts). */
export const APP_VERSION: string = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

/** Compares "major.minor.patch" versions; anything unparsable sorts as 0.0.0. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    (/^(\d+)\.(\d+)\.(\d+)/.exec(v) ?? [0, 0, 0, 0]).slice(1).map(Number);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return 0;
}
