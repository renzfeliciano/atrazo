import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "./config/env";
import { buildContainer, type Container } from "./container";
import { type Database } from "./db/database";

/**
 * Server composition root.
 * - Production: Neon over HTTP (no connection pool to manage on serverless).
 * - Development with DATABASE_URL=pglite: a local Postgres in ./.data, no account needed.
 */
let instance: Promise<Container> | undefined;

export function serverContainer(): Promise<Container> {
  instance ??= create().catch((e: unknown) => {
    instance = undefined; // a failed start (bad env, database down) is retried on the next request
    throw e;
  });
  return instance;
}

async function create(): Promise<Container> {
  const e = env();
  let db: Database;
  if (e.DATABASE_URL === "pglite" || e.DATABASE_URL.startsWith("pglite:")) {
    if (e.NODE_ENV === "production")
      throw new Error("DATABASE_URL=pglite is for local development only.");
    const { localDevDatabase } = await import("./db/local-dev-db");
    db = await localDevDatabase(e.DATABASE_URL);
  } else {
    db = drizzle(neon(e.DATABASE_URL)) as unknown as Database;
  }
  const container = buildContainer(db, e.NEXT_PUBLIC_APP_URL, undefined, e.MIN_APP_VERSION);
  // Development only: let a phone on the same Wi-Fi (or a listed HTTPS tunnel) use the API.
  if (e.NODE_ENV === "development") {
    const { extraDevOrigins } = await import("./config/dev-origins");
    return { ...container, extraOrigins: extraDevOrigins(e.NEXT_PUBLIC_APP_URL) };
  }
  return container;
}
