# Security

Atrazo holds the credit records of small stores and their clients. It is designed so that the people who
run the service cannot read those records, and so that a stolen database or a lost phone exposes as little as possible.

## Reporting a vulnerability

Please report privately to **renzofelicianopayod.personal@gmail.com** with steps to reproduce. Do not open a public issue.
We aim to acknowledge reports within 3 business days.

## What we protect

| Asset | Where it lives | Protection |
|---|---|---|
| Store records (client names, phones, amounts, notes) | the phone; encrypted backups on the server | AES-256-GCM on the phone before upload; the server never has the key |
| Recovery code | only on paper and in the owner's memory | never transmitted; only values derived from it with HKDF are sent |
| Data key | the phone; server holds it wrapped | AES-KW-wrapped by a key only the recovery code can derive |
| Session token | the phone's HttpOnly cookie | 256-bit random; the server stores only its SHA-256 |

## Threat model

| Threat | Mitigation |
|---|---|
| Database leak or curious operator | Records are ciphertext. Stores are random ids with a one-way code fingerprint; no names or emails exist server-side. |
| Server tampering with or swapping backups | AES-GCM authentication with the store id and bundle id bound as associated data; any change fails decryption. |
| Guessing a recovery code | 125 random bits, plus rate limits per client (10 per 15 min) and per store (20 per hour). "Wrong code" and "no such store" are indistinguishable. |
| Stolen or lost phone | The owner signs it out from Settings. The server rejects it with `410`, and the app wipes its local copy when it next connects. Make a new recovery code if the old one may be exposed. |
| Cross-site request forgery | `SameSite=Strict` session cookie, plus an origin check on every state-changing request. |
| Cross-site scripting | React escaping and no third-party scripts. A strict Content Security Policy ships with the app screens. |
| Session theft over the network | HTTPS only in production; `Secure`, `HttpOnly`, `__Host-` cookie. |
| Malformed or oversized input | Strict Zod schemas reject unknown fields, size caps apply before parsing, and database constraints limit field lengths. |
| One store reaching another | Every query is scoped to the store from the authenticated session; this is covered by API tests. |
| Replay or duplicate uploads | Change ids are unique per store; repeated uploads are ignored. |
| Information leakage in errors and logs | Stable error codes and safe messages; no stack traces in responses; logs contain ids and codes only, with no personal data or raw IPs. |
| Vulnerable dependencies | `pnpm audit` (high and critical) runs in CI on every push. |

## Known limits

- **Lost code and lost phones.** If every phone and the recovery code are lost, the records cannot be recovered by anyone. The app requires the owner to confirm they saved the code.
- **Extractable data key on the phone.** The data key is kept extractable so a new recovery code can be made without the old one. A script running inside the page could use the key either way; the defence is the Content Security Policy and having no third-party scripts.
- **Hosting metadata.** The hosting provider (Vercel) keeps short-lived request logs that include IP addresses. Atrazo itself stores no IP addresses.
- **Visible metadata.** The server can see how many encrypted bundles a store has and when they were uploaded. Bundles are padded to 256-byte buckets to blur sizes.

## Cryptography

| Purpose | Algorithm |
|---|---|
| Key derivation from the recovery code | HKDF-SHA256 with versioned labels (`atrazo/v1/…`) |
| Record encryption | AES-256-GCM, random 96-bit IV, associated data `atrazo/v1|store|bundle` |
| Data key wrapping | AES-KW (256-bit) |
| Code and token fingerprints | SHA-256; constant-time comparison |

Everything uses the platform's Web Crypto and Node crypto APIs. No custom cryptographic primitives are used.
