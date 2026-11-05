import { fromUtf8, utf8 } from "@/core/encoding";
import { openBytes, sealBytes } from "@/modules/vault/infrastructure/web-crypto";
import { bundlePayload, parseBundlePayload } from "../domain/bundle";
import { type BundleCodec } from "../application/client-ports";
import { gunzip, gzip } from "./compression";

/**
 * Bundle on the wire = AES-256-GCM( gzip( JSON ) ), with the store id and bundle id bound as
 * authenticated data, so the server can neither read a bundle nor move it to another store or id.
 */
export function webBundleCodec(dataKey: CryptoKey, storeId: string): BundleCodec {
  const context = (bundleId: string) => `${storeId}|bundle|${bundleId}`;
  return {
    async seal(bundleId, records) {
      const compressed = await gzip(utf8(bundlePayload(records)));
      const sealed = await sealBytes(dataKey, compressed, context(bundleId));
      return { id: bundleId, ...sealed };
    },
    async open(bundle) {
      const compressed = await openBytes(dataKey, bundle, context(bundle.id));
      return parseBundlePayload(fromUtf8(await gunzip(compressed)));
    },
  };
}
