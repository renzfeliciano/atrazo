# ADR-0002: Recovery-code accounts and end-to-end encrypted backups

**Status:** Accepted (2026-11-05). Supersedes the earlier plan for Google sign-in.

## Context

Google Cloud asked for payment, and the owner wants Atrazo to collect no personal data.

## Decision

- No sign-up. "Start my listahan" generates a 125-bit recovery code on the phone; the code is the account.
- HKDF-SHA256 derives a lookup id, an auth secret (server stores only its SHA-256) and a key-wrapping key.
- A random AES-256-GCM data key encrypts all backups; the server stores it only wrapped.
- Sessions are random 256-bit tokens in HttpOnly, SameSite=Strict cookies; the server stores their hashes. Lost phones are revoked from Settings.

## Consequences

- The operator cannot read any ledger's records and holds no email or name.
- Losing every phone and the code means the records cannot be recovered by anyone. The UI makes the owner confirm they saved the code.
- A new code re-wraps the same data key; nothing is re-encrypted.
