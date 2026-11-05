# ADR-0003: Batched, compressed, encrypted sync with a versioned codec registry

**Status:** Accepted (2026-11-05)

## Context

One server row per entry would keep the free database awake all day and grow storage quickly. The format must also survive future app versions.

## Decision

- Changes are uploaded as bundles: up to 200 changes, gzip-compressed, AES-GCM-encrypted, bound to ledger id and bundle id.
- A bundle is locked with a fixed id before upload and retried unchanged; the server insert is idempotent.
- The coordinator syncs ~2 minutes after the last write, on open, on background, when back online, and every 15 minutes, with exponential backoff.
- Each record carries `type@version`. A codec registry validates and applies known records idempotently; unknown ones are kept in a `deferred` table.

## Consequences

- A busy day is one ~5 KB row instead of dozens; the database sleeps between bursts.
- New record types and new versions can ship without breaking phones that have not updated.
