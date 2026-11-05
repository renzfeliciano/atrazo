/**
 * Browser security headers for every response (pages, assets and API), applied in next.config.ts.
 *
 * Why a static CSP rather than per-request nonces: every Atrazo page is prerendered and served as a
 * static file, which keeps hosting free and lets the app work offline. Nonces would force a server
 * render on every visit. Inline scripts therefore stay allowed (Next.js streams page data in them),
 * and the policy instead removes what an injected script would need to do harm:
 *   - connect-src / img-src / form-action 'self': nothing can be sent to another server,
 *   - object-src 'none', base-uri 'none': no plugins, no rewriting where relative URLs point,
 *   - frame-ancestors 'none': no clickjacking.
 * Atrazo never renders HTML from user input, and React escapes all text, so the XSS surface itself
 * is already small. See SECURITY.md.
 */
export interface SecurityHeader {
  readonly key: string;
  readonly value: string;
}

export function contentSecurityPolicy(dev: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'unsafe-eval' only for the dev server's hot reload, never in production.
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    // The dev server's hot-reload socket is the only extra connection, and only in development.
    "connect-src": ["'self'", ...(dev ? ["ws:", "wss:"] : [])],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "media-src": ["'none'"],
    "object-src": ["'none'"],
    "frame-src": ["'none'"],
    "child-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!dev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

export function securityHeaders(dev: boolean): SecurityHeader[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(dev) },
    // HTTPS only, for two years, subdomains included. Not sent in development (plain http).
    ...(dev
      ? []
      : [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ]),
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    // Nothing about Atrazo URLs (which hold client ids) leaks to other sites.
    { key: "Referrer-Policy", value: "no-referrer" },
    {
      key: "Permissions-Policy",
      value: [
        "camera=()",
        "microphone=()",
        "geolocation=()",
        "payment=()",
        "usb=()",
        "bluetooth=()",
        "serial=()",
        "hid=()",
        "display-capture=()",
        "browsing-topics=()",
      ].join(", "),
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "Origin-Agent-Cluster", value: "?1" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ];
}
