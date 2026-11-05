import { createHash, timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { env } from "@/server/config/env";
import { log } from "@/server/observability/logger";
import { serverContainer } from "@/server/production";

/**
 * GET /api/cron/purge: the daily retention job (vercel.json → crons). Vercel Cron calls it with
 * `Authorization: Bearer $CRON_SECRET`. Without CRON_SECRET configured the job does not exist (404),
 * and a wrong or missing token gets 401 after a constant-time comparison.
 */
const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();

export async function GET(req: Request): Promise<Response> {
  await connection();
  const secret = env().CRON_SECRET;
  if (!secret) return new Response(null, { status: 404 });
  const given = req.headers.get("authorization") ?? "";
  // Hash both sides so the comparison is constant-time and length-independent.
  if (!timingSafeEqual(digest(given), digest(`Bearer ${secret}`))) {
    log.warn("cron.unauthorized", { route: "cron.purge" });
    return new Response(null, { status: 401 });
  }
  const result = await (await serverContainer()).purge();
  log.info("cron.purge", { ...result });
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
