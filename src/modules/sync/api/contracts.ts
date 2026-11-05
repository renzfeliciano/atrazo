import { z } from "zod";

/** Wire contracts for encrypted backup. The server only ever sees these opaque fields. */
export const MAX_PUSH_BATCH = 200;
export const MAX_PULL_PAGE = 500;
export const MAX_CIPHERTEXT_CHARS = 16_384;

const b64url = z.string().regex(/^[A-Za-z0-9_-]+$/, "must be base64url");

export const ChangeDto = z.strictObject({
  id: z.uuid(),
  /** 12-byte AES-GCM IV. */
  iv: b64url.length(16),
  ciphertext: b64url.min(24).max(MAX_CIPHERTEXT_CHARS),
});
export type ChangeDto = z.infer<typeof ChangeDto>;

export const PushRequest = z.strictObject({
  changes: z.array(ChangeDto).min(1).max(MAX_PUSH_BATCH),
});
export type PushRequest = z.infer<typeof PushRequest>;

export const PushResponse = z.strictObject({ accepted: z.number().int().nonnegative() });
export type PushResponse = z.infer<typeof PushResponse>;

/** Cursors are decimal strings: sequence numbers are 64-bit and must not lose precision in JSON. */
export const Cursor = z.string().regex(/^\d{1,19}$/, "must be a cursor");

export const PullQuery = z.strictObject({
  after: Cursor.default("0"),
  limit: z.coerce.number().int().min(1).max(MAX_PULL_PAGE).default(200),
});
export type PullQuery = z.infer<typeof PullQuery>;

export const PulledChange = ChangeDto.extend({ seq: Cursor, deviceId: z.uuid() });
export type PulledChange = z.infer<typeof PulledChange>;

export const PullResponse = z.strictObject({
  changes: z.array(PulledChange),
  cursor: Cursor,
  hasMore: z.boolean(),
});
export type PullResponse = z.infer<typeof PullResponse>;
