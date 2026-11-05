import { LEDGER_TIME_ZONE, ledgerDay } from "@/core/time";

/**
 * Every backup message in the app comes from here, so the header, the sidebar and Settings always
 * agree. Backup runs on its own (see sync-coordinator.ts); the wording says so: it reports what
 * already happened or when it will happen next, and never asks the owner to do anything.
 */
export interface BackupFacts {
  readonly state: string;
  /** Changes on this phone that haven't reached the backup yet. */
  readonly pending: number;
  readonly lastBackupAt: Date | null;
  readonly nextBackupAt: Date | null;
  /** null until the page has read the clock (it is never read during render). */
  readonly now: Date | null;
}

export type BackupTone = "ok" | "waiting" | "working" | "attention";

export interface BackupStatus {
  /** One line for the header and sidebar. */
  readonly line: string;
  /** Settings card: headline and the detail under it. */
  readonly title: string;
  readonly detail: string;
  readonly tone: BackupTone;
}

const timeFmt = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: LEDGER_TIME_ZONE,
});
const dayFmt = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  timeZone: LEDGER_TIME_ZONE,
});

/** "just now", "2:14 PM" (today) or "Nov 5". */
export function whenBackedUp(at: Date, now: Date): string {
  if (now.getTime() - at.getTime() < 60_000) return "just now";
  return ledgerDay(at) === ledgerDay(now) ? timeFmt.format(at) : dayFmt.format(at);
}

/** "in a moment", "in about 1 min", "in about 12 min". */
export function untilNext(at: Date, now: Date): string {
  const mins = Math.round((at.getTime() - now.getTime()) / 60_000);
  return mins < 1 ? "in a moment" : `in about ${mins} min`;
}

const changes = (n: number) => `${n} new ${n === 1 ? "entry" : "entries"}`;

/** Header-sized countdown: "in 2 min", "in a moment". */
function shortUntil(at: Date, now: Date): string {
  const mins = Math.round((at.getTime() - now.getTime()) / 60_000);
  return mins < 1 ? "in a moment" : `in ${mins} min`;
}

export function backupStatus(f: BackupFacts): BackupStatus {
  const last = f.lastBackupAt && f.now ? whenBackedUp(f.lastBackupAt, f.now) : null;
  const lastLine = last ? `Last backup ${last}` : "Encrypted on this phone before it’s sent";

  if (f.state === "syncing") {
    return {
      line: "Backing up automatically…",
      title: "Backing up automatically…",
      detail: "Encrypting on this phone and uploading",
      tone: "working",
    };
  }
  if (f.state === "offline") {
    return f.pending > 0
      ? {
          line: `Offline · ${f.pending} new saved on phone`,
          title: "Backs up when you’re online",
          detail: `${changes(f.pending)} saved on this phone. ${lastLine}.`,
          tone: "waiting",
        }
      : {
          line: "Offline · everything is backed up",
          title: "Automatic backup is on",
          detail: `You’re offline, and everything is backed up. ${lastLine}.`,
          tone: "ok",
        };
  }
  if (f.state === "error") {
    const retry = f.nextBackupAt && f.now ? ` ${untilNext(f.nextBackupAt, f.now)}` : "";
    return {
      line: "Backup will retry automatically",
      title: "Backup will retry automatically",
      detail: `It tries again${retry || " soon"}. ${f.pending > 0 ? `${changes(f.pending)} saved on this phone. ` : ""}${lastLine}.`,
      tone: "attention",
    };
  }
  if (f.pending > 0) {
    const next = f.nextBackupAt && f.now ? untilNext(f.nextBackupAt, f.now) : "soon";
    const nextShort = f.nextBackupAt && f.now ? shortUntil(f.nextBackupAt, f.now) : "soon";
    return {
      line: `${f.pending} new · auto backup ${nextShort}`,
      title: "Automatic backup is on",
      detail: `${changes(f.pending)} will back up ${next}. ${lastLine}.`,
      tone: "waiting",
    };
  }
  return {
    line: last ? `Backed up automatically · ${last}` : "Automatic backup is on",
    title: "Automatic backup is on",
    detail: last ? `Everything is backed up. ${lastLine}.` : "Everything is backed up.",
    tone: "ok",
  };
}
