import {
  identityService,
  type IdentityService,
} from "@/modules/identity/application/identity-service";
import { postgresIdentityRepository } from "@/modules/identity/infrastructure/postgres-identity-repository";
import { syncService, type SyncService } from "@/modules/sync/application/sync-service";
import { postgresChangeLog } from "@/modules/sync/infrastructure/postgres-change-log";
import { type Database } from "./db/database";
import { nodeSecrets } from "./security/node-secrets";
import { postgresRateLimiter } from "./security/postgres-rate-limiter";
import { type PurgeResult, purgeExpired } from "./maintenance/purge";

/** Everything the API needs, wired from adapters. Tests build one over PGlite; production over Neon. */
export interface Container {
  readonly appUrl: string;
  /** Phones older than this get 426 UPGRADE_REQUIRED. Unset = accept every version. */
  readonly minAppVersion?: string | undefined;
  /** Development only: other origins allowed to write (a phone on the same Wi-Fi). */
  readonly extraOrigins?: readonly string[];
  readonly identity: IdentityService;
  readonly sync: SyncService;
  /** Daily retention job: deletes abandoned ledgers and expired rate-limit windows. */
  purge(now?: Date): Promise<PurgeResult>;
}

export function buildContainer(
  db: Database,
  appUrl: string,
  clock: { now(): Date } = { now: () => new Date() },
  minAppVersion?: string,
): Container {
  const limiter = postgresRateLimiter(db, clock);
  return {
    purge: (now = clock.now()) => purgeExpired(db, now),
    appUrl,
    minAppVersion,
    identity: identityService({
      repo: postgresIdentityRepository(db),
      secrets: nodeSecrets,
      limiter,
      clock,
    }),
    sync: syncService({ log: postgresChangeLog(db), limiter }),
  };
}
