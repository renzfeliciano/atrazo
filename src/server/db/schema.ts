import { sql } from "drizzle-orm";
import {
  bigserial,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * The server stores no personal data. A store is a random id plus a one-way fingerprint of its
 * recovery code; everything the owner writes arrives already encrypted on the phone.
 * Schema changes go through drizzle-kit migrations (pnpm db:generate), never manual edits.
 */
export const ledgers = pgTable(
  "ledgers",
  {
    id: uuid("id").primaryKey(),
    /** HKDF(recovery code, "lookup"), base64url. Finds the store; cannot decrypt anything. */
    codeLookup: text("code_lookup").notNull(),
    /** SHA-256(HKDF(recovery code, "auth")), base64url. */
    authVerifier: text("auth_verifier").notNull(),
    /** The store's data key, AES-KW-wrapped by a key only the recovery code can derive. */
    wrappedKey: text("wrapped_key").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ledgers_code_lookup_uq").on(t.codeLookup)],
);

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey(),
    storeId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    /** Owner-chosen label such as "Samsung Galaxy A15". */
    name: text("name").notNull(),
    /** SHA-256 of the session token held in the phone's HttpOnly cookie. */
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("devices_token_hash_uq").on(t.tokenHash),
    index("devices_ledger_idx").on(t.storeId),
    check("devices_name_len", sql`char_length(${t.name}) between 1 and 60`),
  ],
);

/** Append-only, encrypted change log. Phones push new rows and pull rows after their cursor. */
export const changes = pgTable(
  "changes",
  {
    storeId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    /** Client-generated UUIDv7; makes pushes idempotent. */
    id: uuid("id").notNull(),
    seq: bigserial("seq", { mode: "bigint" }).notNull(),
    deviceId: uuid("device_id").notNull(),
    iv: text("iv").notNull(),
    ciphertext: text("ciphertext").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.storeId, t.id] }),
    uniqueIndex("changes_seq_uq").on(t.seq),
    index("changes_ledger_seq_idx").on(t.storeId, t.seq),
    check("changes_iv_len", sql`char_length(${t.iv}) = 16`),
    check("changes_ct_len", sql`char_length(${t.ciphertext}) between 24 and 16384`),
  ],
);

/** Fixed-window counters for abuse limits. Keys are hashed; no raw IP addresses are stored. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});
