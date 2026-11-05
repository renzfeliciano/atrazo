import "server-only";
import { connection } from "next/server";
import { serverContainer } from "./production";
import { apiHandlers } from "./routes";

type Handler = (req: Request) => Promise<Response>;

/**
 * The API as Next.js route exports. Each handler first calls connection(): API routes only run for
 * a real request, so the build's prerender pass stops there and never touches config or the
 * database (reading req.method alone does not stop it). Kept out of apiHandlers itself so tests
 * can call the handlers directly, outside Next.js.
 */
const requestTime =
  (handler: Handler): Handler =>
  async (req) => {
    await connection();
    return handler(req);
  };

const handlers = apiHandlers(serverContainer);

export const api = Object.fromEntries(
  Object.entries(handlers).map(([name, handler]) => [name, requestTime(handler)]),
) as typeof handlers;

export { deprecatedAlias } from "./http/deprecated-alias";
