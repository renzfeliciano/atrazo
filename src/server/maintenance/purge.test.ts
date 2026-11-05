import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { rowsOf } from "../db/database";
import { createTestDatabase } from "../db/test-db";
import { purgeExpired } from "./purge";

let tdb: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  tdb = await createTestDatabase();
});
afterAll(() => tdb.close());
beforeEach(() => tdb.reset());

const NOW = new Date("2026-11-05T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
let n = 0;

async function store(createdDaysAgo: number, phonesSeenDaysAgo: number[]) {
  const id = crypto.randomUUID();
  n += 1;
  await tdb.db.execute(sql`
    insert into stores (id, code_lookup, auth_verifier, wrapped_key, created_at)
    values (${id}, ${`lookup-${n}`}, 'v', 'w', ${daysAgo(createdDaysAgo)}::timestamptz)`);
  for (const seen of phonesSeenDaysAgo) {
    await tdb.db.execute(sql`
      insert into devices (id, store_id, name, token_hash, last_seen_at)
      values (${crypto.randomUUID()}, ${id}, 'Phone', ${`hash-${crypto.randomUUID()}`}, ${daysAgo(seen)}::timestamptz)`);
  }
  await tdb.db.execute(sql`
    insert into changes (store_id, id, device_id, iv, ciphertext)
    values (${id}, ${crypto.randomUUID()}, ${crypto.randomUUID()}, 'aaaaaaaaaaaaaaaa', ${"x".repeat(32)})`);
  return id;
}

const ids = async (table: "stores" | "devices" | "changes") =>
  rowsOf<{ id: string }>(
    await tdb.db.execute(
      sql.raw(`select ${table === "stores" ? "id" : "store_id as id"} from ${table}`),
    ),
  ).map((r) => r.id);

describe("purgeExpired", () => {
  it("deletes stores no phone has opened for a year, with their phones and backups", async () => {
    const abandoned = await store(500, [400, 380]);
    const active = await store(500, [400, 10]); // one phone still in use
    const young = await store(30, []); // new store, no phone yet: kept

    const r = await purgeExpired(tdb.db, NOW);

    expect(r.storesDeleted).toBe(1);
    expect(await ids("stores")).toEqual(expect.arrayContaining([active, young]));
    expect(await ids("stores")).not.toContain(abandoned);
    expect(await ids("devices")).not.toContain(abandoned);
    expect(await ids("changes")).not.toContain(abandoned);
  });

  it("drops old rate-limit windows and keeps current ones", async () => {
    await tdb.db.execute(sql`
      insert into rate_limits (key, window_start, count) values
        ('old', ${daysAgo(3)}::timestamptz, 5),
        ('now', ${daysAgo(0)}::timestamptz, 1)`);
    const r = await purgeExpired(tdb.db, NOW);
    expect(r.rateLimitsDeleted).toBe(1);
    const left = rowsOf<{ key: string }>(await tdb.db.execute(sql`select key from rate_limits`));
    expect(left.map((x) => x.key)).toEqual(["now"]);
  });
});
