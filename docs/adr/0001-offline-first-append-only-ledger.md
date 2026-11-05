# ADR-0001: Offline-first, append-only ledger

**Status:** Accepted (2026-11-05)

## Context
Sari-sari stores often have weak signal. The owner must record utang the moment it happens, and balances must never be wrong.

## Decision
- The phone's IndexedDB is the source of truth. Every screen works with no network.
- Entries are append-only. A mistake is corrected with a `void` entry; nothing is edited or deleted after backup.
- A balance is always the sum of a client's entries; money is integer centavos.
- "Days unpaid" counts from the first utang after the balance last reached zero.

## Consequences
- No sync conflicts on entries (they are immutable and keyed by client-generated UUIDv7).
- Customer edits use last-write-wins by `updatedAt`.
- Full history is always available for statements and audits.
