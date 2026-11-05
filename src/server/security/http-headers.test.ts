import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "./http-headers";

const directives = (csp: string) =>
  Object.fromEntries(
    csp.split("; ").map((d) => {
      const [name, ...values] = d.split(" ");
      return [name!, values];
    }),
  );

describe("security headers", () => {
  const prod = directives(contentSecurityPolicy(false));

  it("keeps data from leaving for other servers", () => {
    expect(prod["connect-src"]).toEqual(["'self'"]);
    expect(prod["img-src"]).toEqual(["'self'", "data:", "blob:"]);
    expect(prod["form-action"]).toEqual(["'self'"]);
    expect(prod["default-src"]).toEqual(["'self'"]);
  });

  it("blocks framing, plugins and base-URL hijacking", () => {
    expect(prod["frame-ancestors"]).toEqual(["'none'"]);
    expect(prod["object-src"]).toEqual(["'none'"]);
    expect(prod["base-uri"]).toEqual(["'none'"]);
    expect(prod["upgrade-insecure-requests"]).toEqual([]);
  });

  it("never allows eval or the hot-reload socket in production", () => {
    expect(prod["script-src"]).not.toContain("'unsafe-eval'");
    expect(prod["connect-src"]).not.toContain("ws:");
    const dev = directives(contentSecurityPolicy(true));
    expect(dev["script-src"]).toContain("'unsafe-eval'");
    expect(dev["upgrade-insecure-requests"]).toBeUndefined();
  });

  it("sends HSTS only in production, and the rest everywhere", () => {
    const keys = (dev: boolean) => securityHeaders(dev).map((h) => h.key);
    expect(keys(false)).toContain("Strict-Transport-Security");
    expect(keys(true)).not.toContain("Strict-Transport-Security");
    for (const k of [
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
    ]) {
      expect(keys(true)).toContain(k);
    }
    expect(securityHeaders(false).find((h) => h.key === "Permissions-Policy")?.value).toContain(
      "camera=()",
    );
  });
});
