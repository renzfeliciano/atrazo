import { fromBase64Url, fromUtf8, toBase64Url, utf8 } from "@/core/encoding";
import { type RecoveryCode, recoveryCodeBytes } from "../domain/recovery-code";

/**
 * Store encryption, built only on the platform's Web Crypto API (browser and Node).
 *
 *   recovery code ──HKDF-SHA256──┬─ lookup     (finds the store; useless for decryption)
 *                                ├─ authSecret (proves knowledge of the code; server keeps only its SHA-256)
 *                                └─ KEK        (AES-KW; wraps the data key)
 *   data key (random AES-256-GCM) encrypts every record; the server stores it only wrapped by the KEK.
 *
 * Changing the recovery code re-wraps the same data key, so records never need re-encrypting.
 */
const subtle = globalThis.crypto.subtle;
const VERSION = "atrazo/v1";
const SALT = utf8(`${VERSION}/salt`);

export class VaultError extends Error {
  constructor(
    readonly reason: "WRONG_CODE" | "TAMPERED",
    message: string,
  ) {
    super(message);
    this.name = "VaultError";
  }
}

export interface StoreKeys {
  /** base64url, 32 bytes. Sent to the server to find the store. */
  readonly lookup: string;
  /** base64url, 32 bytes. Sent once per sign-in; the server stores only SHA-256(authSecret). */
  readonly authSecret: string;
  readonly kek: CryptoKey;
}

async function hkdf(
  ikm: CryptoKey,
  label: string,
  bytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const bits = await subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: SALT, info: utf8(`${VERSION}/${label}`) },
    ikm,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

export async function deriveStoreKeys(code: RecoveryCode): Promise<StoreKeys> {
  const ikm = await subtle.importKey(
    "raw",
    recoveryCodeBytes(code) as Uint8Array<ArrayBuffer>,
    "HKDF",
    false,
    ["deriveBits"],
  );
  const [lookup, authSecret, kekBytes] = await Promise.all([
    hkdf(ikm, "lookup", 32),
    hkdf(ikm, "auth", 32),
    hkdf(ikm, "kek", 32),
  ]);
  const kek = await subtle.importKey("raw", kekBytes, "AES-KW", false, ["wrapKey", "unwrapKey"]);
  kekBytes.fill(0);
  return { lookup: toBase64Url(lookup), authSecret: toBase64Url(authSecret), kek };
}

const DATA_KEY: AesKeyGenParams = { name: "AES-GCM", length: 256 };

/**
 * The data key stays extractable on the phone so the owner can make a new recovery code without the
 * old one. Any script running in the page could use the key either way, so non-extractability would
 * add little; the defense is the Content Security Policy (see SECURITY.md).
 */
export async function generateDataKey(): Promise<CryptoKey> {
  return subtle.generateKey(DATA_KEY, true, ["encrypt", "decrypt"]);
}

export async function wrapDataKey(dataKey: CryptoKey, kek: CryptoKey): Promise<string> {
  return toBase64Url(new Uint8Array(await subtle.wrapKey("raw", dataKey, kek, "AES-KW")));
}

export async function unwrapDataKey(wrapped: string, kek: CryptoKey): Promise<CryptoKey> {
  try {
    return await subtle.unwrapKey("raw", fromBase64Url(wrapped), kek, "AES-KW", DATA_KEY, true, [
      "encrypt",
      "decrypt",
    ]);
  } catch {
    // AES-KW has a built-in integrity check: a wrong code cannot produce a key.
    throw new VaultError("WRONG_CODE", "The recovery code does not unlock this store");
  }
}

export interface Sealed {
  /** base64url, 12 bytes. */
  readonly iv: string;
  /** base64url AES-GCM ciphertext + tag. */
  readonly ciphertext: string;
}

/** Plaintext is padded to 64-byte buckets so ciphertext sizes don't reveal exact note lengths. */
const BUCKET = 64;

/**
 * `context` is bound as additional authenticated data (e.g. store id + record id), so the server
 * cannot move a ciphertext to another record or store without decryption failing.
 */
export async function seal(dataKey: CryptoKey, payload: unknown, context: string): Promise<Sealed> {
  const json = JSON.stringify(payload);
  const padded = json + " ".repeat((BUCKET - (utf8(json).length % BUCKET)) % BUCKET);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf8(`${VERSION}|${context}`) },
    dataKey,
    utf8(padded),
  );
  return { iv: toBase64Url(iv), ciphertext: toBase64Url(new Uint8Array(ct)) };
}

export async function open(dataKey: CryptoKey, sealed: Sealed, context: string): Promise<unknown> {
  let plain: ArrayBuffer;
  try {
    plain = await subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64Url(sealed.iv),
        additionalData: utf8(`${VERSION}|${context}`),
      },
      dataKey,
      fromBase64Url(sealed.ciphertext),
    );
  } catch {
    throw new VaultError("TAMPERED", "A backed-up record failed its integrity check");
  }
  return JSON.parse(fromUtf8(new Uint8Array(plain)));
}

/** Binary payloads (compressed bundles) are padded to 256-byte buckets: [u32 length][bytes][zeros]. */
const BYTES_BUCKET = 256;

export async function sealBytes(
  dataKey: CryptoKey,
  bytes: Uint8Array,
  context: string,
): Promise<Sealed> {
  const total = Math.ceil((bytes.length + 4) / BYTES_BUCKET) * BYTES_BUCKET;
  const framed = new Uint8Array(total);
  new DataView(framed.buffer).setUint32(0, bytes.length);
  framed.set(bytes, 4);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf8(`${VERSION}|${context}`) },
    dataKey,
    framed,
  );
  return { iv: toBase64Url(iv), ciphertext: toBase64Url(new Uint8Array(ct)) };
}

export async function openBytes(
  dataKey: CryptoKey,
  sealed: Sealed,
  context: string,
): Promise<Uint8Array<ArrayBuffer>> {
  let plain: ArrayBuffer;
  try {
    plain = await subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64Url(sealed.iv),
        additionalData: utf8(`${VERSION}|${context}`),
      },
      dataKey,
      fromBase64Url(sealed.ciphertext),
    );
  } catch {
    throw new VaultError("TAMPERED", "A backed-up record failed its integrity check");
  }
  const framed = new Uint8Array(plain);
  const length = new DataView(plain).getUint32(0);
  if (length > framed.length - 4)
    throw new VaultError("TAMPERED", "A backed-up record has an invalid length");
  return framed.slice(4, 4 + length);
}

export async function exportDataKey(dataKey: CryptoKey): Promise<string> {
  return toBase64Url(new Uint8Array(await subtle.exportKey("raw", dataKey)));
}

export async function importDataKey(raw: string): Promise<CryptoKey> {
  return subtle.importKey("raw", fromBase64Url(raw), DATA_KEY, true, ["encrypt", "decrypt"]);
}

/** SHA-256 of the auth secret, as the server stores it. Exposed for tests and the server adapter. */
export async function authVerifier(authSecret: string): Promise<string> {
  return toBase64Url(new Uint8Array(await subtle.digest("SHA-256", fromBase64Url(authSecret))));
}
