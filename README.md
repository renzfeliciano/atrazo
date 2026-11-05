# Atrazo

**The utang ledger for sari-sari stores.** Write the utang; Atrazo adds it up.

Atrazo is an offline-first progressive web app for a store owner who extends credit (*utang*) to many
clients. Every entry updates the client's balance and the store's total instantly, with or without signal,
and is backed up end-to-end encrypted so it can be restored on another phone.

> *Isulat mo lang, ako na sa kwenta.* — Lapis, the ledger's hero

| | |
|---|---|
| **Status** | Core engine complete and tested (ledger, encryption, API, batched sync). App screens in progress. |
| **Runtime** | Next.js 16 · React 19 · TypeScript (strict) |
| **Data** | IndexedDB on the phone (source of truth) · Neon Postgres (encrypted backup) |
| **Hosting** | Vercel Hobby + Neon free tier: no running cost |
| **Privacy** | No sign-up, no email, no analytics. The server cannot read store records. |

---

## Contents

- [Highlights](#highlights)
- [How it works](#how-it-works)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Database and migrations](#database-and-migrations)
- [Deployment](#deployment)
- [Versioning and upgrades](#versioning-and-upgrades)
- [Security and privacy](#security-and-privacy)
- [Contributing](#contributing)
- [Documentation](#documentation)

---

## Highlights

- **Works with no signal.** Every screen reads and writes the phone's own database. The network is only for backup.
- **Balances you can trust.** Money is integer centavos; the ledger is append-only. Mistakes are voided, never erased, so every balance can be traced.
- **Built for how stores lend.** Credit limits, overdue tracking (days unpaid restart after a client is fully paid), a *Singilin today* list, statements and SMS reminders.
- **No accounts.** "Start my store" creates a recovery code on the phone. That code is the account: no email, no password, no third-party sign-in.
- **End-to-end encrypted backups.** Records are encrypted on the phone (AES-256-GCM) before upload. The operator stores only ciphertext.
- **Restore on any phone.** Enter the recovery code on a new phone to download and decrypt the store. Lost phones can be signed out remotely.
- **Free to run.** Batched, compressed sync keeps the free Postgres tier asleep most of the day.

## How it works

```
 Phone (PWA)                                           Server (Vercel + Neon)
 ───────────                                           ──────────────────────
 UI ─► use case ─► IndexedDB ─► outbox
                                  │  ~2 min after the last write, on open/close, online, every 15 min
                                  ▼
        bundle ≤200 changes ─► gzip ─► AES-256-GCM ─► POST /api/v1/sync ─► changes (ciphertext, seq)
        decrypt + apply in one transaction ◄──────────── GET /api/v1/sync?after=cursor
```

- **Recovery code → keys.** HKDF-SHA256 derives a lookup id, an auth secret (the server keeps only its SHA-256) and a key-wrapping key. A random data key encrypts every bundle; the server holds it only in wrapped form.
- **Exactly-once sync.** Bundles are sealed with a fixed id before upload and retried unchanged; the server's insert is idempotent and ordered per store.
- **Forward compatible.** Every synced record carries `type@version`. Unknown types from newer app versions are kept, not dropped.

The full design is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), with decisions recorded in [docs/adr](docs/adr).

## Getting started

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | 20.9 or newer (22 LTS recommended; CI uses 22) |
| pnpm | 10 (`corepack enable` installs the pinned version) |
| Git | any recent version |

No database account is needed for local development.

### Run locally

```bash
git clone https://github.com/renzfeliciano/atrazo.git
cd atrazo
pnpm install
cp .env.example .env.local        # Windows PowerShell: Copy-Item .env.example .env.local
```

In `.env.local`, set a local database:

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:6060
DATABASE_URL=pglite
```

Then start the app:

```bash
pnpm dev
```

Open **http://localhost:6060**.

`DATABASE_URL=pglite` runs a real Postgres engine (PGlite) inside the dev server, saved to `./.data` and migrated
automatically with the same SQL as production. Delete `./.data` to start fresh. It is refused in production.

> **Why 6060?** Browsers block port 6000 as an unsafe port (`ERR_UNSAFE_PORT`), so the dev server uses 6060.
> To use another port, change the `dev` script and `NEXT_PUBLIC_APP_URL` together: the API rejects requests from any other origin.

### Test on your phone

Atrazo encrypts on the device with Web Crypto, which browsers allow only on HTTPS or `localhost`. To use the
dev server from a real phone on the same Wi-Fi:

1. Run `pnpm dev`. Next prints a **Network** address, for example `http://192.168.1.4:6060`. This computer's
   Wi-Fi addresses are trusted automatically in development (`src/server/config/dev-origins.ts`).
2. On the phone, open Chrome and go to `chrome://flags/#unsafely-treat-insecure-origin-as-secure`. Enable it,
   add `http://192.168.1.4:6060` (your address), and tap **Relaunch**.
3. Open that address on the phone. Allow port 6060 through the computer's firewall if it doesn't load.

Prefer real HTTPS (or Safari on iPhone)? Start a tunnel, such as `cloudflared tunnel --url http://localhost:6060`,
and add its URL to `.env.local` as `DEV_ALLOWED_ORIGINS=https://….trycloudflare.com`, then restart `pnpm dev`.

None of this applies in production: there the API trusts only `NEXT_PUBLIC_APP_URL`.

### Health check

```bash
curl http://localhost:6060/api/health     # {"ok":true}
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Development server on port 6060 |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build on port 6060 |
| `pnpm check` | Type check, lint and all tests (run before every push) |
| `pnpm typecheck` | Generate route types, then `tsc --noEmit` |
| `pnpm lint` | ESLint, zero warnings allowed, including architecture boundaries |
| `pnpm test` / `pnpm test:watch` | Vitest: unit, use case, Postgres integration, API and two-phone sync |
| `pnpm test:e2e` | Playwright end-to-end tests in a real browser (starts its own server on port 6080) |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm db:generate` | Create a SQL migration from `src/server/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations to the database in `DATABASE_URL_UNPOOLED` |
| `pnpm db:check` | Verify migrations are consistent with the schema |

## Configuration

All variables are validated at startup (`src/server/config/env.ts`); a missing or malformed value stops the server
with a message naming the key, never its value. An empty value (`KEY=`) means "not set".

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | yes | Public origin of the app, no trailing slash. API writes from any other origin are rejected. |
| `DATABASE_URL` | yes | Neon **pooled** connection string, or `pglite` for local development. |
| `DATABASE_URL_UNPOOLED` | migrations only | Neon **direct** connection string, used by `pnpm db:migrate`. |
| `LOG_LEVEL` | no | `debug` · `info` (default) · `warn` · `error` |
| `MIN_CLIENT_VERSION` | no | Phones on an older app version receive `426 UPGRADE_REQUIRED` and are asked to update. |

There are no OAuth, email or analytics secrets: Atrazo uses none of those services.
`.env.example` is committed; `.env.local` and every other `.env*` file are git-ignored.

## Project structure

```
src/
├─ app/                        Next.js routes (presentation)
│  └─ api/v1/…/route.ts        one-line re-exports of src/server/routes.ts
├─ client/phone.ts             phone composition root (wires ports to adapters)
├─ core/                       money, Manila calendar, errors, Result, encoding, versioning
├─ infrastructure/local-db/    the phone's IndexedDB schema (Dexie, versioned)
├─ modules/
│  ├─ ledger/                  customers, entries, balances, dashboard, sync codecs
│  ├─ vault/                   recovery code, key derivation, encryption, start/open a store
│  ├─ identity/                stores, phones, sessions, rate limits (server)
│  └─ sync/                    bundles, codec registry, engine + coordinator, change log
│     ├─ domain/               pure rules and types
│     ├─ application/          use cases and ports (interfaces)
│     ├─ infrastructure/       adapters: IndexedDB, Postgres, Web Crypto, fetch
│     └─ api/contracts.ts      Zod wire contracts shared by phone and server
└─ server/                     composition root, HTTP pipeline, database, security, logging
design/                        approved UI designs: PNG screens and canvas source
docs/                          architecture and decision records
drizzle/                       SQL migrations (generated, committed)
```

Dependencies point inward only (domain ← application ← infrastructure ← presentation). ESLint enforces the
module and client/server boundaries; see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#layers-clean-architecture).

## Testing

```bash
pnpm test
```

| Level | Covers | Runs against |
|---|---|---|
| Unit | money, calendar, recovery codes, ledger rules, encryption | pure functions, Web Crypto |
| Use case | every ledger command and query | in-memory **and** IndexedDB adapters (same suite) |
| Integration | repositories, rate limiter, encrypted change log | **real Postgres** (PGlite) with the production migrations |
| API | auth, CSRF, validation, payload limits, store isolation, versioning | route handlers over PGlite |
| Two phones | backup on one phone, restore and two-way sync on another | every real layer except the browser |
| End to end | onboarding, ledger, statement, backup and restore, legal pages, settings, security headers | Playwright, real browser against its own dev server and a fresh local database (`pnpm test:e2e`) |

No test needs a network connection, a cloud account or secrets, so CI runs the full suite on every push.

## Database and migrations

- The schema lives in `src/server/db/schema.ts`. The server stores **no personal data**: stores (random id, code
  fingerprint, wrapped key), phones (name, hashed session token, last seen), the encrypted change log, and rate-limit counters.
- Change the schema, then run `pnpm db:generate` and commit the new SQL in `drizzle/`. Never edit an applied migration.
- Every server write is a single SQL statement, so the transaction-less Neon HTTP driver is safe.

## Deployment

1. **Neon:** create a free project. Copy the pooled and direct connection strings.
2. **Migrate:** with `DATABASE_URL_UNPOOLED` set to the direct string, run `pnpm db:migrate`.
3. **Vercel:** import the GitHub repository. Set `NEXT_PUBLIC_APP_URL` (your production URL), `DATABASE_URL`
   (pooled string) and, optionally, `LOG_LEVEL` and `MIN_CLIENT_VERSION`.
4. Deploy. Check `https://<your-domain>/api/health`.

**Free-tier capacity.** Neon's monthly compute allowance is the first limit: roughly 15–20 actively used stores without batching, and about 50 or more with the batched sync now in place. If a limit is hit, backups pause until the next month; nobody loses access to their ledger. Vercel Hobby is for **non-commercial** use; if Atrazo earns revenue, move to Vercel Pro. No code changes are needed.

## Versioning and upgrades

| Layer | Strategy |
|---|---|
| API | Path-versioned (`/api/v1`). Breaking changes ship as `/api/v2` while v1 keeps serving older phones. |
| App | Phones send `x-atrazo-client: <version>`; `MIN_CLIENT_VERSION` retires unsafe versions with `426`. |
| Synced data | `type@version` records with a codec registry; unknown records are kept in a `deferred` table. |
| Phone database | Dexie versions are append-only (`version(n)` + upgrade); released versions are never edited. |
| Server database | Drizzle SQL migrations, checked in CI. |
| Cryptography | Version labels are bound into every key derivation and ciphertext; stores carry `key_version`. |

## Security and privacy

- No sign-up and no personal data on the server; the recovery code never leaves the phone.
- End-to-end encryption: AES-256-GCM with per-record authenticated context, HKDF-SHA256 key derivation, AES-KW key wrapping.
- Sessions: random 256-bit tokens in `HttpOnly; SameSite=Strict` cookies (`__Host-` prefixed in production); only hashes are stored.
- Every write checks the request origin; every body is size-limited and validated by strict schemas.
- Rate limits on store creation, recovery-code attempts and sync, keyed by a hashed, daily-rotating client key.
- No analytics, trackers, ads or third-party scripts. Logs contain ids and error codes only.

Read [SECURITY.md](SECURITY.md) for the threat model and how to report a vulnerability.

## Contributing

1. Branch from `main`.
2. Keep changes inside the right layer and module; cross a module boundary only through its public files.
3. Add or update tests at the lowest level that proves the behaviour.
4. Run `pnpm check` before pushing; CI runs the same checks, plus a dependency audit, migration check and production build.
5. Record significant decisions as a new ADR in `docs/adr`.

Commit messages: short imperative subject (≤72 characters), a blank line, then the why.

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, modules, sync, keys, extension guide, testing strategy |
| [docs/adr](docs/adr) | Architecture decision records |
| [SECURITY.md](SECURITY.md) | Threat model and vulnerability reporting |
| [design/](design) | Approved UI designs (PNG screens and canvas source) |

## License

Proprietary. All rights reserved. *[Choose a license before publishing the repository.]*
