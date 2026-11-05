type Handler = (req: Request) => Promise<Response>;

/**
 * Old API addresses kept working while phones update (the "stores" paths became "ledgers").
 * Same handler, plus standard headers telling clients where the endpoint moved:
 * Deprecation (RFC 9745) and a successor-version Link. Status, body and other headers
 * (including Set-Cookie) pass through unchanged.
 */
export function deprecatedAlias(handler: Handler, successor: string): Handler {
  return async (req) => {
    const res = await handler(req);
    const headers = new Headers(res.headers);
    headers.set("Deprecation", "true");
    headers.set("Link", `<${successor}>; rel="successor-version"`);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
