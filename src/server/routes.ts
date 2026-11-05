import { z } from "zod";
import { AppError, ErrorCode } from "@/core/errors";
import {
  CreateStoreRequest,
  OpenStoreRequest,
  RotateCodeRequest,
} from "@/modules/identity/api/contracts";
import { type DeviceId } from "@/modules/identity/domain/identity";
import { PullQuery, PushRequest } from "@/modules/sync/api/contracts";
import { type Container } from "./container";
import { apiRoute } from "./http/api-route";
import { clearedSessionCookie, sessionCookie } from "./http/session-cookie";

/**
 * The HTTP API. Handlers only translate between HTTP and use cases; rules live in the services.
 * App Router files re-export these, and API tests call them directly against PGlite.
 */
export function apiHandlers(getContainer: () => Container | Promise<Container>) {
  const get = async () => getContainer();
  const deps = async () => {
    const c = await get();
    return {
      appUrl: c.appUrl,
      auth: c.identity,
      minClientVersion: c.minClientVersion,
      extraOrigins: c.extraOrigins,
    };
  };
  const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: AppError }): T => {
    if (!r.ok) throw r.error;
    return r.value;
  };

  return {
    /** POST /api/v1/ledgers: "Start my listahan". */
    createStore: apiRoute(
      deps,
      { name: "ledgers.create", auth: "none", body: CreateStoreRequest },
      async ({ body, clientKey }) => {
        const s = unwrap(await (await get()).identity.createStore(body, { clientKey }));
        return {
          status: 201,
          body: { storeId: s.storeId, deviceId: s.deviceId, wrappedKey: s.wrappedKey },
          setCookie: sessionCookie(s.token),
        };
      },
    ),

    /** DELETE /api/v1/ledgers: "Delete listahan" removes every backup and phone. */
    deleteStore: apiRoute(deps, { name: "ledgers.delete", auth: "device" }, async ({ session }) => {
      await (await get()).identity.deleteStore(session!);
      return { status: 204, setCookie: clearedSessionCookie() };
    }),

    /** PUT /api/v1/ledgers/code: "Make a new recovery code". */
    rotateCode: apiRoute(
      deps,
      { name: "ledgers.rotate_code", auth: "device", body: RotateCodeRequest },
      async ({ body, session }) => {
        unwrap(await (await get()).identity.rotateCode(session!, body));
        return { status: 204 };
      },
    ),

    /** POST /api/v1/session: open a store on this phone with its recovery code. */
    openSession: apiRoute(
      deps,
      { name: "session.open", auth: "none", body: OpenStoreRequest },
      async ({ body, clientKey }) => {
        const s = unwrap(await (await get()).identity.openStore(body, { clientKey }));
        return {
          status: 201,
          body: { storeId: s.storeId, deviceId: s.deviceId, wrappedKey: s.wrappedKey },
          setCookie: sessionCookie(s.token),
        };
      },
    ),

    /** DELETE /api/v1/session: sign this phone out (its session stops working everywhere). */
    closeSession: apiRoute(deps, { name: "session.close", auth: "device" }, async ({ session }) => {
      await (await get()).identity.revokeDevice(session!, session!.deviceId);
      return { status: 204, setCookie: clearedSessionCookie() };
    }),

    /** GET /api/v1/devices */
    listDevices: apiRoute(deps, { name: "devices.list", auth: "device" }, async ({ session }) => {
      const devices = await (await get()).identity.listDevices(session!);
      return {
        body: {
          devices: devices.map((d) => ({
            id: d.id,
            name: d.name,
            createdAt: d.createdAt.toISOString(),
            lastSeenAt: d.lastSeenAt.toISOString(),
            revokedAt: d.revokedAt?.toISOString() ?? null,
            current: d.current,
          })),
        },
      };
    }),

    /** DELETE /api/v1/devices/{id}: sign out a lost phone. */
    revokeDevice: apiRoute(
      deps,
      { name: "devices.revoke", auth: "device" },
      async ({ req, session }) => {
        const id = z.uuid().safeParse(new URL(req.url).pathname.split("/").at(-1));
        if (!id.success) throw new AppError(ErrorCode.Validation, "Invalid phone id");
        unwrap(await (await get()).identity.revokeDevice(session!, id.data as DeviceId));
        return { status: 204 };
      },
    ),

    /** POST /api/v1/sync: upload encrypted changes. */
    push: apiRoute(
      deps,
      { name: "sync.push", auth: "device", body: PushRequest, maxBody: 4 * 1024 * 1024 },
      async ({ body, session }) => {
        return { body: unwrap(await (await get()).sync.push(session!, body)) };
      },
    ),

    /** GET /api/v1/sync?after=&limit=: download encrypted changes after a cursor. */
    pull: apiRoute(
      deps,
      { name: "sync.pull", auth: "device", query: PullQuery },
      async ({ query, session }) => {
        return { body: await (await get()).sync.pull(session!, query) };
      },
    ),
  };
}

export type ApiHandlers = ReturnType<typeof apiHandlers>;
