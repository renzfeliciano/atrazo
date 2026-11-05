import { type Brand } from "@/core/brand";

/**
 * A store's recovery code: 125 random bits written as 25 Crockford base32 characters in five
 * groups ("7KQ2M-XD9PA-R4TWE-H6NBZ-3FJC8"). It is the store's only credential and the root of its
 * encryption keys, so it is generated on the phone and never sent to the server.
 *
 * Crockford base32 has no I, L, O or U, and reading tolerates the common mix-ups
 * (O→0, I/L→1) plus any spacing, dashes or case.
 */
export type RecoveryCode = Brand<string, "RecoveryCode">;

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 25;
export const CODE_BITS = CODE_LENGTH * 5; // 125

/** Builds a code from at least 16 random bytes (use crypto.getRandomValues). */
export function recoveryCodeFromBytes(random: Uint8Array): RecoveryCode {
  if (random.length < 16) throw new RangeError("Need at least 16 random bytes");
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of random) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < CODE_LENGTH) {
      out += ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
    if (out.length === CODE_LENGTH) break;
  }
  return out as RecoveryCode;
}

export function generateRecoveryCode(getRandomValues: (a: Uint8Array) => Uint8Array): RecoveryCode {
  return recoveryCodeFromBytes(getRandomValues(new Uint8Array(16)));
}

/** Reads what a person typed. Returns null unless it is exactly 25 valid characters. */
export function parseRecoveryCode(input: string): RecoveryCode | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s\-_.]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (cleaned.length !== CODE_LENGTH) return null;
  for (const ch of cleaned) if (!ALPHABET.includes(ch)) return null;
  return cleaned as RecoveryCode;
}

/** "7KQ2M-XD9PA-R4TWE-H6NBZ-3FJC8" */
export function formatRecoveryCode(code: RecoveryCode): string {
  return code.match(/.{5}/g)!.join("-");
}

export function recoveryCodeGroups(code: RecoveryCode): string[] {
  return code.match(/.{5}/g)!;
}

/** The code's bytes, used as key material (deterministic for a given code). */
export function recoveryCodeBytes(code: RecoveryCode): Uint8Array {
  const out = new Uint8Array(16);
  let buffer = 0;
  let bits = 0;
  let i = 0;
  if (code.length !== CODE_LENGTH) throw new TypeError("Recovery code must be parsed before use");
  for (const ch of code) {
    const v = ALPHABET.indexOf(ch);
    // Never derive keys from an unparsed code: a lowercase or mistyped character must not silently become other keys.
    if (v < 0) throw new TypeError("Recovery code must be parsed before use");
    buffer = (buffer << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out[i++] = (buffer >>> (bits - 8)) & 255;
      bits -= 8;
      buffer &= (1 << bits) - 1;
    }
  }
  if (bits > 0) out[i] = (buffer << (8 - bits)) & 255;
  return out;
}
