# Architecture decision records

Short records of decisions that shape Atrazo, so future changes stay consistent. Add a new file for a
new decision; when one is replaced, mark it "Superseded by ADR-NNNN" instead of deleting it.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-offline-first-append-only-ledger.md) | The phone is the source of truth; the ledger is append-only | Accepted |
| [0002](0002-recovery-code-accounts-and-e2e-encryption.md) | No sign-up: the recovery code is the account; backups are end-to-end encrypted | Accepted |
| [0003](0003-batched-encrypted-sync.md) | Batched, compressed, encrypted sync bundles with a versioned codec registry | Accepted |
| [0004](0004-free-tier-hosting.md) | Vercel Hobby + Neon free tier, single-statement writes over HTTP | Accepted |
