import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { v7 as uuidv7 } from "uuid";
import { type SecretTools } from "@/modules/identity/application/ports";

export const nodeSecrets: SecretTools = {
  newToken: () => randomBytes(32).toString("base64url"),
  hash: (value) => createHash("sha256").update(value, "utf8").digest("base64url"),
  equals(a, b) {
    const x = Buffer.from(a, "utf8");
    const y = Buffer.from(b, "utf8");
    // Compare equal-length buffers either way, so a length mismatch costs the same time.
    return timingSafeEqual(x, x.length === y.length ? y : x) && x.length === y.length;
  },
  newId: () => uuidv7(),
};
