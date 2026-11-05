# Atrazo architecture

Atrazo is an offline-first utang (store credit) ledger for one store owner and many clients.
The phone is the source of truth; the server is an encrypted backup it cannot read.

## Principles

1. **Offline first.** Every screen reads and writes the phone's database (IndexedDB). The network is only for backup and restore.
2. **Append-only ledger.** Entries are never edited or deleted after backup; mistakes are voided. Balances are always the sum of entries.
3. **Zero-knowledge server.** Records are encrypted on the phone (AES-256-GCM). The server stores ciphertext, a random store id and a one-way fingerprint of the recovery code.
4. **No accounts, no tracking.** The recovery code is the store's credential. No email, no third-party sign-in, no analytics, no third-party scripts.
5. **Free to run.** Vercel Hobby + Neon free tier; batching keeps the database asleep most of the day.

## Glossary: code names vs. what users see

The app's wording was broadened beyond shops (a person lending to relatives uses Atrazo too). Only
the **user-facing text** changed; code, database, API and encryption keep their original names, on
purpose, so existing data and backups stay valid.

| Users see                                                          | In code, database and API                                                | Notes                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| **Listahan** (the account: "Start my listahan", "Delete listahan") | `store`: `stores` table, `storeId`, `/api/v1/stores`, `StoreSettings`    | Also part of encryption labels (`atrazo/v1                            | store | …`). Renaming would make existing backups unreadable, so never rename it. |
| **Borrower**                                                       | `customer` (`customers`, `CustomerId`); routes `/client`, `/clients/new` | URLs keep `client` so saved links and the offline cache keep working. |
| **Utang** / **Bayad**                                              | entry `kind`: `"utang"` / `"bayad"` (and `"void"`)                       |                                                                       |

When adding UI text, use the left column; when naming code, follow the middle one.

## Layers (clean architecture)

Dependencies point inward only; ESLint enforces the boundaries.

```
presentation    src/app/**                     React screens, thin API route files
composition     src/client/phone.ts            wires the phone; src/server/container.ts wires the server
infrastructure  modules/*/infrastructure,      IndexedDB (Dexie), Postgres (Drizzle), Web Crypto, fetch
                src/infrastructure, src/server
application     modules/*/application          use cases + ports (interfaces)
domain          modules/*/domain, src/core     entities, value objects, rules (pure TypeScript)
```

- **domain**: no framework, database or I/O. Time is injected (`Clock`); money is integer centavos (`Cents`).
- **application**: depends on domain and its own ports. Expected failures return `Result`; exceptions are for bugs and infrastructure faults.
- **infrastructure**: implements ports. One use-case test suite runs against both the in-memory and IndexedDB adapters.
- **presentation**: calls use cases through the composition root; never touches a database directly.

## Modules

| Module             | Responsibility                                                                            | Runs on |
| ------------------ | ----------------------------------------------------------------------------------------- | ------- |
| `core`             | Money, Manila calendar, errors, `Result`, encoding, versioning                            | both    |
| `modules/ledger`   | Customers, entries, balances, overdue, limits, ledger rows, dashboard, sync codecs        | phone   |
| `modules/vault`    | Recovery code, key derivation, encryption, start/open a store                             | phone   |
| `modules/identity` | Stores, phones, sessions, rate limits                                                     | server  |
| `modules/sync`     | Bundles, codec registry, sync engine + coordinator (phone); encrypted change log (server) | both    |

Wire contracts live in each module's `api/contracts.ts` (Zod), shared by phone and server.

## Sync

```
write ─► ledger use case ─► IndexedDB (one transaction) + outbox row
coordinator: ~2 min after the last write, on open, on background (keepalive), online, every 15 min
engine push: outbox ─► bundle (≤200 changes) ─► gzip ─► AES-GCM ─► LOCK (fixed id) ─► POST /api/v1/sync ─► confirm
engine pull: GET /api/v1/sync?after=cursor ─► decrypt + gunzip all ─► apply page + cursor in ONE transaction
```

- **One row per sync, not per entry.** A busy day of 30+ entries is a single ~5 KB encrypted row.
- **Exactly-once storage.** A bundle is saved with its id before upload and retried unchanged; the server ignores repeat ids.
- **Undo stays consistent.** Once a change is sealed into a bundle it counts as sent: Undo voids it instead of deleting it.
- **No skipped changes.** A per-store advisory lock inside the insert statement makes each store's rows commit in sequence order.
- **Every server write is one SQL statement**, so the transaction-less Neon HTTP driver is safe.

## Keys

```
recovery code (125 bits) ─HKDF-SHA256─┬─ lookup      → finds the store
                                       ├─ authSecret  → server keeps SHA-256 only
                                       └─ KEK (AES-KW) → wraps the data key
data key (random AES-256) → encrypts every bundle; the server stores it only wrapped
```

A new recovery code re-wraps the same data key; nothing is re-encrypted.

## Extending and upgrading

Atrazo is built to grow without breaking stores already in use.

| Change you want                     | How                                                                                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A new feature (items, reminders, …) | Add a module under `src/modules/<name>` with the same four layers. Register its sync codecs in the phone composition root.                                     |
| A new kind of synced record         | Add a `RecordCodec` (`type`, `version`, Zod `schema`, idempotent `apply`) and register it. Phones that do not know it keep it in `deferred` until they update. |
| Change a synced record's shape      | Add `type@2` next to `type@1`; keep the @1 codec so old backups stay readable. Never edit a released codec.                                                    |
| Change the bundle format            | Bump `BUNDLE_FORMAT`; keep decoding older formats.                                                                                                             |
| Change the phone database           | Add `this.version(n+1)` in `local-db.ts` with an upgrade function. Never edit a released version.                                                              |
| Change the server database          | Edit `schema.ts`, run `pnpm db:generate`, commit the SQL in `drizzle/`. CI checks they match.                                                                  |
| A breaking API change               | Add `/api/v2/...`; keep `/api/v1` serving older phones until they update.                                                                                      |
| Retire an old app version           | Set `MIN_CLIENT_VERSION`; older phones get `426 UPGRADE_REQUIRED` and the app asks to update. Their entries stay safe locally.                                 |
| New cryptography                    | Version strings (`atrazo/v1`) are bound into every key and ciphertext, and stores carry `key_version`; add v2 alongside v1.                                    |
| Move off Neon or Vercel             | Implement the repository ports for the new database; nothing above infrastructure changes.                                                                     |

Decisions and their reasons are recorded in [`docs/adr`](./adr).

## Testing

| Level       | Tool            | What                                                                       |
| ----------- | --------------- | -------------------------------------------------------------------------- |
| Unit        | Vitest          | domain rules, money, calendar, recovery codes, crypto                      |
| Use case    | Vitest          | ledger use cases against in-memory and IndexedDB (fake-indexeddb) adapters |
| Integration | Vitest + PGlite | Postgres repositories, rate limiter, change log, using the real migrations |
| API         | Vitest + PGlite | route handlers: auth, CSRF, validation, isolation, versioning              |
| Two phones  | Vitest + PGlite | full backup/restore through every real layer except the browser            |
| End to end  | Playwright      | browser flows including offline (with the UI)                              |
