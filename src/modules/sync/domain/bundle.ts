import { z } from "zod";

/**
 * A bundle is what one sync uploads: many changes, compressed and then encrypted as one row.
 *
 *   { "f": 1, "r": [ { "t": "entry.added", "v": 1, "d": {...} }, ... ] }
 *
 * - `f` is the bundle format version. A new format bumps it; readers keep decoding older formats.
 * - Each record names its type `t` and schema version `v`. Readers look the pair up in a codec
 *   registry; a pair they do not know is kept aside (not dropped) for a future app version.
 */
export const BUNDLE_FORMAT = 1;

export interface WireRecord {
  readonly t: string;
  readonly v: number;
  readonly d: unknown;
}

const WireBundle = z.object({
  f: z.number().int().positive(),
  r: z.array(
    z.object({ t: z.string().min(1).max(64), v: z.number().int().positive(), d: z.unknown() }),
  ),
});

export function bundlePayload(records: readonly WireRecord[]): string {
  return JSON.stringify({ f: BUNDLE_FORMAT, r: records });
}

export function parseBundlePayload(json: string): WireRecord[] {
  const parsed = WireBundle.parse(JSON.parse(json));
  if (parsed.f > BUNDLE_FORMAT) throw new UnsupportedBundleError(parsed.f);
  return parsed.r;
}

export class UnsupportedBundleError extends Error {
  constructor(readonly format: number) {
    super(`Bundle format ${format} is newer than this app understands`);
    this.name = "UnsupportedBundleError";
  }
}

/**
 * A codec owns one record type at one version: how to validate it off the wire and how to apply it
 * locally. Applying must be idempotent, because the same record can arrive more than once.
 */
export interface RecordCodec<T, Ctx> {
  readonly type: string;
  readonly version: number;
  readonly schema: z.ZodType<T>;
  apply(record: T, ctx: Ctx): Promise<void>;
}

export class CodecRegistry<Ctx> {
  private readonly codecs = new Map<string, RecordCodec<unknown, Ctx>>();

  register<T>(codec: RecordCodec<T, Ctx>): this {
    const key = `${codec.type}@${codec.version}`;
    if (this.codecs.has(key)) throw new Error(`Codec ${key} registered twice`);
    this.codecs.set(key, codec as RecordCodec<unknown, Ctx>);
    return this;
  }

  find(record: WireRecord): RecordCodec<unknown, Ctx> | undefined {
    return this.codecs.get(`${record.t}@${record.v}`);
  }
}
