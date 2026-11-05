# ADR-0004: Free-tier hosting (Vercel Hobby + Neon)

**Status:** Accepted (2026-11-05)

## Context

Atrazo must cost nothing to run at the start.

## Decision

- Next.js on Vercel Hobby; Postgres on Neon's free tier via the HTTP driver.
- Every server write is a single SQL statement (CTEs, upserts, advisory lock inside the insert), so no interactive transactions are needed.
- Rate limits are stored in Postgres (no extra service). Health checks never touch the database.

## Consequences

- Capacity is bounded by Neon's monthly compute; batching stretches it to roughly 50+ active ledgers.
- Vercel Hobby is non-commercial. If Atrazo ever earns money, move to Vercel Pro; no code changes.
- Moving to another host or database means new adapters only (see ARCHITECTURE.md).
