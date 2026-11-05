import { describe, expect, it } from "vitest";
import { fromBase64Url, toBase64Url } from "@/core/encoding";
import { generateRecoveryCode, parseRecoveryCode } from "../domain/recovery-code";
import {
  authVerifier,
  deriveLedgerKeys,
  generateDataKey,
  open,
  seal,
  unwrapDataKey,
  VaultError,
  wrapDataKey,
} from "./web-crypto";

const newCode = () => generateRecoveryCode((a) => crypto.getRandomValues(a));

describe("ledger keys", () => {
  it("derive the same lookup and auth secret from the same code, on any phone", async () => {
    const code = newCode();
    const typedOnAnotherPhone = parseRecoveryCode(code.toLowerCase())!;
    const [a, b] = await Promise.all([
      deriveLedgerKeys(code),
      deriveLedgerKeys(typedOnAnotherPhone),
    ]);
    expect(a.lookup).toBe(b.lookup);
    expect(a.authSecret).toBe(b.authSecret);
    expect(fromBase64Url(a.lookup)).toHaveLength(32);
  });

  it("keep lookup, auth secret and the code unrelated to each other", async () => {
    const code = newCode();
    const k = await deriveLedgerKeys(code);
    expect(k.lookup).not.toBe(k.authSecret);
    expect(k.lookup).not.toContain(code);
    const other = await deriveLedgerKeys(newCode());
    expect(other.lookup).not.toBe(k.lookup);
  });

  it("never expose the KEK", async () => {
    const k = await deriveLedgerKeys(newCode());
    expect(k.kek.extractable).toBe(false);
    expect(k.kek.usages.sort()).toEqual(["unwrapKey", "wrapKey"]);
  });
});

describe("data key wrapping", () => {
  it("unwraps only with the right code", async () => {
    const code = newCode();
    const dataKey = await generateDataKey();
    const wrapped = await wrapDataKey(dataKey, (await deriveLedgerKeys(code)).kek);

    const sameCode = await unwrapDataKey(wrapped, (await deriveLedgerKeys(code)).kek);
    const sealed = await seal(dataKey, { hello: "Nena" }, "s|r");
    expect(await open(sameCode, sealed, "s|r")).toEqual({ hello: "Nena" });

    await expect(
      unwrapDataKey(wrapped, (await deriveLedgerKeys(newCode())).kek),
    ).rejects.toMatchObject({ reason: "WRONG_CODE" });
  });

  it("supports a new recovery code without re-encrypting records", async () => {
    const dataKey = await generateDataKey();
    const sealed = await seal(dataKey, { amount: 15000 }, "s|r1");
    const rewrapped = await wrapDataKey(dataKey, (await deriveLedgerKeys(newCode())).kek);
    expect(rewrapped).toMatch(/^[A-Za-z0-9_-]{54}$/); // 40-byte AES-KW output
    expect(await open(dataKey, sealed, "s|r1")).toEqual({ amount: 15000 });
  });
});

describe("sealed records", () => {
  it("round-trip and use a fresh IV every time", async () => {
    const k = await generateDataKey();
    const a = await seal(k, { note: "Load" }, "s|r");
    const b = await seal(k, { note: "Load" }, "s|r");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(await open(k, a, "s|r")).toEqual({ note: "Load" });
  });

  it("detect any change to the ciphertext", async () => {
    const k = await generateDataKey();
    const s = await seal(k, { amount: 15000 }, "s|r");
    const bytes = fromBase64Url(s.ciphertext);
    bytes[0]! ^= 1;
    await expect(open(k, { ...s, ciphertext: toBase64Url(bytes) }, "s|r")).rejects.toBeInstanceOf(
      VaultError,
    );
  });

  it("cannot be moved to another record or ledger", async () => {
    const k = await generateDataKey();
    const s = await seal(k, { amount: 15000 }, "ledgerA|r1");
    await expect(open(k, s, "ledgerA|r2")).rejects.toMatchObject({ reason: "TAMPERED" });
    await expect(open(k, s, "ledgerB|r1")).rejects.toMatchObject({ reason: "TAMPERED" });
  });

  it("hide exact note lengths (64-byte buckets)", async () => {
    const k = await generateDataKey();
    const short = await seal(k, { n: "a" }, "c");
    const longer = await seal(k, { n: "a".repeat(30) }, "c");
    expect(fromBase64Url(short.ciphertext).length).toBe(fromBase64Url(longer.ciphertext).length);
  });

  it("do not contain the plaintext", async () => {
    const k = await generateDataKey();
    const s = await seal(k, { name: "Aling Nena Santos" }, "c");
    expect(
      atob(
        s.ciphertext.replace(/-/g, "+").replace(/_/g, "/") +
          "==".slice(0, (4 - (s.ciphertext.length % 4)) % 4),
      ),
    ).not.toContain("Nena");
  });
});

describe("auth verifier", () => {
  it("is a one-way SHA-256 of the auth secret", async () => {
    const { authSecret } = await deriveLedgerKeys(newCode());
    const v = await authVerifier(authSecret);
    expect(v).not.toBe(authSecret);
    expect(await authVerifier(authSecret)).toBe(v);
    expect(fromBase64Url(v)).toHaveLength(32);
  });
});
