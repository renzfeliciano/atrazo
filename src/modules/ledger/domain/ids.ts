import { type Brand } from "@/core/brand";

export type CustomerId = Brand<string, "CustomerId">;
export type EntryId = Brand<string, "EntryId">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export function asCustomerId(v: string): CustomerId {
  if (!isUuid(v)) throw new TypeError("Invalid customer id");
  return v.toLowerCase() as CustomerId;
}

export function asEntryId(v: string): EntryId {
  if (!isUuid(v)) throw new TypeError("Invalid entry id");
  return v.toLowerCase() as EntryId;
}
