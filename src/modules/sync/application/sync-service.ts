import { AppError, ErrorCode } from "@/core/errors";
import { err, ok, type Result } from "@/core/result";
import { type DeviceSession } from "@/modules/identity/domain/identity";
import { type RateLimiter } from "@/modules/identity/application/ports";
import {
  type ChangeDto,
  type PullQuery,
  type PullResponse,
  type PushRequest,
  type PushResponse,
} from "../api/contracts";

export interface StoredChange extends ChangeDto {
  readonly seq: bigint;
  readonly deviceId: string;
}

export interface ChangeLogRepository {
  /** Appends changes; ids already stored for this ledger are skipped. Returns how many were new. */
  append(session: DeviceSession, changes: readonly ChangeDto[]): Promise<number>;
  /** Changes with seq > after, oldest first, at most `limit`. */
  after(ledgerId: DeviceSession["ledgerId"], after: bigint, limit: number): Promise<StoredChange[]>;
}

export const PUSH_LIMIT = { limit: 240, windowSeconds: 600 } as const;

export function syncService(deps: { log: ChangeLogRepository; limiter: RateLimiter }) {
  return {
    async push(session: DeviceSession, req: PushRequest): Promise<Result<PushResponse, AppError>> {
      const rl = await deps.limiter.hit(
        `push:${session.deviceId}`,
        PUSH_LIMIT.limit,
        PUSH_LIMIT.windowSeconds,
      );
      if (!rl.allowed)
        return err(
          new AppError(ErrorCode.RateLimited, "Backing up too often. Will retry shortly."),
        );
      const ids = new Set(req.changes.map((c) => c.id));
      if (ids.size !== req.changes.length)
        return err(new AppError(ErrorCode.Validation, "Duplicate change ids in one batch"));
      return ok({ accepted: await deps.log.append(session, req.changes) });
    },

    async pull(session: DeviceSession, q: PullQuery): Promise<PullResponse> {
      const rows = await deps.log.after(session.ledgerId, BigInt(q.after), q.limit + 1);
      const page = rows.slice(0, q.limit);
      const last = page.at(-1);
      return {
        changes: page.map((c) => ({
          id: c.id,
          iv: c.iv,
          ciphertext: c.ciphertext,
          seq: c.seq.toString(),
          deviceId: c.deviceId,
        })),
        cursor: last ? last.seq.toString() : q.after,
        hasMore: rows.length > q.limit,
      };
    },
  };
}

export type SyncService = ReturnType<typeof syncService>;
