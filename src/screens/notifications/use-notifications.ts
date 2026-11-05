"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { type Cents } from "@/core/money";
import {
  type LedgerNotification,
  ledgerNotifications,
  type Severity,
} from "@/modules/ledger/application/notifications";
import { type PhoneInfo } from "@/modules/vault/application/store-access";
import { useApp } from "@/app/providers";

/** Kept on this phone only: which notifications have been read (device table, never synced). */
const READ_KEY = "notifications.read";
const KEEP_READ = 300;
const NEW_PHONE_DAYS = 30;

export type AppNotification =
  | (LedgerNotification & { readonly category: "alerts" | "summary" })
  | {
      readonly key: string;
      readonly kind: "new-phone";
      readonly category: "account";
      readonly severity: Severity;
      readonly at: Date;
      readonly phone: PhoneInfo;
    }
  | {
      readonly key: string;
      readonly kind: "backup";
      readonly category: "account";
      readonly severity: Severity;
      readonly at: Date;
      readonly pending: number;
    };

export function useNotifications() {
  const { phone, session, sync } = useApp();
  const dash = useLiveQuery(
    () => (session ? phone?.queries.dashboard() : undefined),
    [phone, session],
  );
  const settings = useLiveQuery(() => phone?.queries.settings(), [phone]);
  const read = useLiveQuery(
    async () => ((await phone?.db.device.get(READ_KEY))?.value as string[] | undefined) ?? [],
    [phone],
  );
  const [phones, setPhones] = useState<PhoneInfo[]>([]);

  // Phones that recently opened this store (needs the internet; skipped quietly offline).
  useEffect(() => {
    if (!phone || !session) return;
    let alive = true;
    phone.access
      .listPhones()
      .then((list) => alive && setPhones(list))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [phone, session]);

  const items: AppNotification[] = [];
  // The clock is read only once data is here: on the server (prerender) there is none, and a time
  // frozen at build time would be wrong.
  if (dash && settings) {
    const now = new Date();
    for (const n of ledgerNotifications(
      dash.customers,
      dash.week,
      dash.totalOwed as Cents,
      settings.overdueAfterDays,
      now,
    )) {
      items.push({ ...n, category: n.kind === "weekly" ? "summary" : "alerts" });
    }
    for (const p of phones) {
      const opened = new Date(p.createdAt);
      if (
        p.current ||
        p.revokedAt ||
        now.getTime() - opened.getTime() > NEW_PHONE_DAYS * 86_400_000
      )
        continue;
      items.push({
        key: `new-phone:${p.id}`,
        kind: "new-phone",
        category: "account",
        severity: "info",
        at: opened,
        phone: p,
      });
    }
    if (sync.state === "error" || (sync.state === "offline" && sync.pending > 0)) {
      items.push({
        key: `backup:${now.toDateString()}`,
        kind: "backup",
        category: "account",
        severity: "danger",
        at: now,
        pending: sync.pending,
      });
    }
  }
  items.sort((a, b) => b.at.getTime() - a.at.getTime());

  const readSet = new Set(read ?? []);
  const unread = items.filter((n) => !readSet.has(n.key)).length;

  async function markRead(keys: string[]) {
    if (!phone) return;
    const next = [...new Set([...(read ?? []), ...keys])].slice(-KEEP_READ);
    await phone.db.device.put({ key: READ_KEY, value: next });
  }

  return {
    ready: dash !== undefined && settings !== undefined && read !== undefined,
    items,
    isRead: (key: string) => readSet.has(key),
    unread,
    markRead,
    markAllRead: () => markRead(items.map((n) => n.key)),
  };
}
