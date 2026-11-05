/** Liveness only: no database call, so health checks never wake the free Neon instance. */
export function GET(): Response {
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
