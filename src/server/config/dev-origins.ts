import { networkInterfaces } from "node:os";

/**
 * Development only: extra origins allowed to use the dev server, so a real phone on the same
 * Wi-Fi (http://192.168.x.x:6060) or an HTTPS tunnel can run the app. Used by next.config.ts
 * (allowedDevOrigins) and by the API's same-origin check. Never applied in production.
 */

const PRIVATE_V4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/** This computer's private-network IPv4 addresses (what a phone on the same Wi-Fi would use). */
export function lanHosts(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal && PRIVATE_V4.test(i.address))
    .map((i) => i!.address);
}

/**
 * Origins to trust besides NEXT_PUBLIC_APP_URL: each LAN address on the app's port (http and
 * https), plus DEV_ALLOWED_ORIGINS (comma-separated, e.g. an HTTPS tunnel URL).
 */
export function extraDevOrigins(
  appUrl: string,
  configured: string | undefined = process.env.DEV_ALLOWED_ORIGINS,
  hosts: readonly string[] = lanHosts(),
): string[] {
  const port = new URL(appUrl).port;
  const suffix = port ? `:${port}` : "";
  const lan = hosts.flatMap((h) => [`http://${h}${suffix}`, `https://${h}${suffix}`]);
  const listed = (configured ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => new URL(s).origin);
  return [...new Set([...lan, ...listed])];
}

/** Host names for next.config.ts allowedDevOrigins (it matches by host, not origin). */
export function extraDevHosts(appUrl: string): string[] {
  return [...new Set(extraDevOrigins(appUrl).map((o) => new URL(o).hostname))];
}
