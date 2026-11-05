import { describe, expect, it } from "vitest";
import { backupStatus, type BackupFacts, untilNext, whenBackedUp } from "./backup-status";

// 2:00 PM in Manila.
const now = new Date("2026-11-06T06:00:00Z");
const base: BackupFacts = {
  state: "idle",
  pending: 0,
  lastBackupAt: new Date("2026-11-06T05:14:00Z"),
  nextBackupAt: null,
  now,
};

describe("backup status wording", () => {
  it("reports a finished backup as automatic, with its time", () => {
    const s = backupStatus(base);
    expect(s.line).toBe("Backed up automatically · 1:14 PM");
    expect(s.title).toBe("Automatic backup is on");
    expect(s.tone).toBe("ok");
  });

  it("says when new entries will back up, never asking the owner to do it", () => {
    const s = backupStatus({
      ...base,
      state: "waiting",
      pending: 3,
      nextBackupAt: new Date("2026-11-06T06:02:00Z"),
    });
    expect(s.line).toBe("3 new · auto backup in 2 min");
    expect(s.detail).toBe("3 new entries will back up in about 2 min. Last backup 1:14 PM.");
    expect(s.tone).toBe("waiting");
  });

  it("covers backing up, offline and retrying", () => {
    expect(backupStatus({ ...base, state: "syncing", pending: 1 }).line).toBe(
      "Backing up automatically…",
    );
    expect(backupStatus({ ...base, state: "offline", pending: 1 }).line).toBe(
      "Offline · 1 new saved on phone",
    );
    expect(backupStatus({ ...base, state: "offline" }).line).toBe(
      "Offline · everything is backed up",
    );
    const retry = backupStatus({
      ...base,
      state: "error",
      pending: 2,
      nextBackupAt: new Date("2026-11-06T06:01:00Z"),
    });
    expect(retry.line).toBe("Backup will retry automatically");
    expect(retry.detail).toBe(
      "It tries again in about 1 min. 2 new entries saved on this phone. Last backup 1:14 PM.",
    );
    expect(retry.tone).toBe("attention");
  });

  it("stays sensible before the clock is read or before the first backup", () => {
    expect(backupStatus({ ...base, now: null }).line).toBe("Automatic backup is on");
    expect(backupStatus({ ...base, lastBackupAt: null }).line).toBe("Automatic backup is on");
    expect(backupStatus({ ...base, pending: 2, now: null }).line).toBe("2 new · auto backup soon");
  });

  it("formats times the way a person would say them", () => {
    expect(whenBackedUp(new Date("2026-11-06T05:59:40Z"), now)).toBe("just now");
    expect(whenBackedUp(new Date("2026-11-05T05:00:00Z"), now)).toBe("Nov 5");
    expect(untilNext(new Date("2026-11-06T06:00:20Z"), now)).toBe("in a moment");
    expect(untilNext(new Date("2026-11-06T06:12:00Z"), now)).toBe("in about 12 min");
  });
});
