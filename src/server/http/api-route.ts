import { createHash } from "node:crypto";
import { unstable_rethrow } from "next/navigation";
import { type z } from "zod";
import { APP_VERSION_HEADER, compareVersions } from "@/core/app-version";
import { AppError, ErrorCode, httpStatusFor } from "@/core/errors";
import { type DeviceSession } from "@/modules/identity/domain/identity";
import { log } from "@/server/observability/logger";
import { clearedSessionCookie, readSessionToken } from "./session-cookie";

/**
 * Every API route goes through `apiRoute`, which owns the cross-cutting rules so handlers stay thin:
 *  - same-origin check on every state-changing request (CSRF defense in depth, on top of SameSite=Strict)
 *  - body size cap and JSON parsing, then strict Zod validation
 *  - session resolution; revoked phones get 410 + a cleared cookie so they wipe themselves
 *  - one error shape: { error: { code, message, issues } }, and no stack traces leave the server
 *  - no-store caching and a request id on every response
 */
export interface Authenticator {
  authenticate(
    token: string | undefined,
  ): Promise<{ ok: true; value: DeviceSession } | { ok: false; error: AppError }>;
}

export interface RouteContext<B, Q> {
  readonly req: Request;
  readonly body: B;
  readonly query: Q;
  readonly session: DeviceSession | null;
  /** Hashed, daily-rotating requester key for rate limits. Never a raw IP. */
  readonly requesterKey: string;
  readonly requestId: string;
}

export interface RouteResult {
  readonly status?: number;
  readonly body?: unknown;
  readonly setCookie?: string;
}

interface Options<BS extends z.ZodType | undefined, QS extends z.ZodType | undefined> {
  readonly name: string;
  readonly auth: "none" | "device";
  readonly body?: BS;
  readonly query?: QS;
  /** Bytes. Defaults to 8 KB. */
  readonly maxBody?: number;
}

type Infer<S> = S extends z.ZodType ? z.infer<S> : undefined;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export function problem(
  error: AppError,
  requestId: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify({ error: { code: error.code, message: error.message, issues: error.issues } }),
    {
      status: httpStatusFor[error.code],
      headers: { ...JSON_HEADERS, "x-request-id": requestId, ...extraHeaders },
    },
  );
}

/** Rate-limit key: SHA-256 of the requester's IP plus today's date, so it cannot track anyone across days. */
export function requesterKeyOf(req: Request, now = new Date()): string {
  const ip =
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  return createHash("sha256")
    .update(`${now.toISOString().slice(0, 10)}|${ip}`)
    .digest("base64url");
}

/**
 * Writes must come from Atrazo's own pages. `extraOrigins` is empty in production; in development
 * it holds this computer's Wi-Fi addresses (and any DEV_ALLOWED_ORIGINS) so a real phone can test.
 */
export function isSameOrigin(
  req: Request,
  appUrl: string,
  extraOrigins: readonly string[] = [],
): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = req.headers.get("origin");
  if (!origin) return site === "same-origin";
  return origin === new URL(appUrl).origin || extraOrigins.includes(origin);
}

async function readBody(req: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new AppError(ErrorCode.PayloadTooLarge, "Request is too large");
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) {
    throw new AppError(ErrorCode.Validation, "Send JSON");
  }
  const text = await req.text();
  if (new TextEncoder().encode(text).length > maxBytes)
    throw new AppError(ErrorCode.PayloadTooLarge, "Request is too large");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError(ErrorCode.Validation, "Malformed JSON");
  }
}

function validate<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new AppError(
      ErrorCode.Validation,
      "Request is invalid",
      r.error.issues
        .slice(0, 20)
        .map((i) => ({ field: i.path.join(".") || "(root)", message: i.message })),
    );
  }
  return r.data;
}

/** First line of the error and of its cause (e.g. the Postgres reason behind a failed query). Development only. */
function describeForDevelopment(e: unknown): string {
  const first = (x: unknown) =>
    x instanceof Error ? (x.message.split("\n")[0] ?? "") : String(x ?? "none");
  const cause = e instanceof Error ? e.cause : undefined;
  return `${first(e)} | cause: ${first(cause)}`.slice(0, 500);
}

export function apiRoute<
  BS extends z.ZodType | undefined = undefined,
  QS extends z.ZodType | undefined = undefined,
>(
  deps: () => Promise<{
    appUrl: string;
    auth: Authenticator;
    minAppVersion?: string | undefined;
    /** Development only (see config/dev-origins.ts); empty in production. */
    extraOrigins?: readonly string[];
  }>,
  options: Options<BS, QS>,
  handler: (ctx: RouteContext<Infer<BS>, Infer<QS>>) => Promise<RouteResult>,
) {
  return async (req: Request): Promise<Response> => {
    const method = req.method;
    const requestId = crypto.randomUUID();
    const started = Date.now();
    let status = 500;
    let interrupted = true;
    try {
      const { appUrl, auth, minAppVersion, extraOrigins } = await deps();
      if (method !== "GET" && method !== "HEAD" && !isSameOrigin(req, appUrl, extraOrigins)) {
        throw new AppError(ErrorCode.Forbidden, "Cross-site request blocked");
      }
      const appVersion = req.headers.get(APP_VERSION_HEADER);
      if (appVersion && minAppVersion && compareVersions(appVersion, minAppVersion) < 0) {
        throw new AppError(
          ErrorCode.UpgradeRequired,
          "Update Atrazo to keep backing up. Your entries are safe on this phone.",
        );
      }

      let session: DeviceSession | null = null;
      if (options.auth === "device") {
        const r = await auth.authenticate(readSessionToken(req));
        if (!r.ok) {
          interrupted = false;
          status = httpStatusFor[r.error.code];
          const headers: Record<string, string> =
            r.error.code === ErrorCode.DeviceRevoked
              ? { "set-cookie": clearedSessionCookie() }
              : {};
          return problem(r.error, requestId, headers);
        }
        session = r.value;
      }

      const body = (
        options.body
          ? validate(options.body, await readBody(req, options.maxBody ?? 8 * 1024))
          : undefined
      ) as Infer<BS>;
      const query = (
        options.query
          ? validate(options.query, Object.fromEntries(new URL(req.url).searchParams))
          : undefined
      ) as Infer<QS>;

      const result = await handler({
        req,
        body,
        query,
        session,
        requesterKey: requesterKeyOf(req),
        requestId,
      });
      interrupted = false;
      status = result.status ?? 200;
      const headers: Record<string, string> = { ...JSON_HEADERS, "x-request-id": requestId };
      if (result.setCookie) headers["set-cookie"] = result.setCookie;
      return new Response(result.body === undefined ? null : JSON.stringify(result.body), {
        status,
        headers,
      });
    } catch (e) {
      // Next.js control-flow signals (prerender bail-out, redirects) are not errors: let them through.
      unstable_rethrow(e);
      interrupted = false;
      if (e instanceof AppError) {
        status = httpStatusFor[e.code];
        return problem(e, requestId);
      }
      log.error("api.unhandled", {
        route: options.name,
        requestId,
        error: e instanceof Error ? e.name : "unknown",
        // Messages can echo input, so they are logged only in development.
        detail: process.env.NODE_ENV === "development" ? describeForDevelopment(e) : undefined,
      });
      return problem(
        new AppError(
          ErrorCode.Internal,
          "Something went wrong. Your entries are safe on this phone.",
        ),
        requestId,
      );
    } finally {
      if (!interrupted)
        log.info("api.request", {
          route: options.name,
          method,
          status,
          ms: Date.now() - started,
          requestId,
        });
    }
  };
}
