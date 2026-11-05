/**
 * The phone's session lives only in an HttpOnly cookie: page scripts can never read it, and
 * SameSite=Strict keeps other sites from sending it. In production the "__Host-" prefix also
 * forces Secure, Path=/ and no Domain.
 */
const PROD_NAME = "__Host-atrazo_session";
const DEV_NAME = "atrazo_session";
/** Browsers cap cookie lifetime at about 400 days; each authenticated visit renews it. */
export const SESSION_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export function sessionCookieName(): string {
  return process.env.NODE_ENV === "production" ? PROD_NAME : DEV_NAME;
}

export function readSessionToken(req: Request): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  const name = sessionCookieName();
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${sessionCookieName()}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`;
}

export function clearedSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${sessionCookieName()}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}
