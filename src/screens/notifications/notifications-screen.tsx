"use client";

import Link from "next/link";
import { useState } from "react";
import { type Cents, formatPeso } from "@/core/money";
import { formatStoreDay, STORE_TIME_ZONE } from "@/core/time";
import { isToday } from "@/modules/ledger/application/notifications";
import { AppShell } from "@/ui/app-shell";
import { Lapis } from "@/ui/brand";
import { EmptyState } from "@/ui/empty-state";
import { Icon, type IconName } from "@/ui/icons";
import { ThemeToggle } from "@/ui/theme";
import { useMinimumDelay } from "@/ui/use-minimum-delay";
import { usePendingAction } from "@/ui/use-pending-action";
import { type AppNotification, useNotifications } from "./use-notifications";

type Tab = "all" | "alerts" | "account";
const peso = (c: number) => formatPeso(c as Cents);
const timeFmt = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: STORE_TIME_ZONE,
});

const TILE: Record<AppNotification["severity"], [string, string]> = {
  danger: ["var(--danger-tint)", "var(--danger)"],
  info: ["var(--info-tint)", "var(--info)"],
  success: ["var(--success-tint)", "var(--success)"],
  neutral: ["var(--surface-3)", "var(--text-2)"],
};

function view(n: AppNotification, now: Date) {
  switch (n.kind) {
    case "over-limit":
      return {
        icon: "alert" as IconName,
        title: `${n.customerName} is over the limit`,
        body: `Balance ${peso(n.balance!)} of a ${peso(n.limit!)} limit, ${peso(n.overBy!)} over.`,
        action: { label: "Open ledger", href: `/client?id=${n.customerId}` },
      };
    case "overdue":
      return {
        icon: "calendar" as IconName,
        title: `${n.customerName}: ${n.daysUnpaid} days unpaid`,
        body: `${peso(n.balance!)} owed.${n.lastBayadAt ? ` Last bayad was on ${formatStoreDay(n.lastBayadAt, now)}.` : " No bayad yet."}`,
        action: { label: "Open ledger", href: `/client?id=${n.customerId}` },
      };
    case "weekly":
      return {
        icon: "activity" as IconName,
        title: "Your week so far",
        body: `Collected ${peso(n.week!.bayad)} in bayad and gave ${peso(n.week!.utang)} in new utang. Total owed is ${peso(n.week!.totalOwed)}.`,
        action: { label: "See activity", href: "/activity" },
      };
    case "new-phone":
      return {
        icon: "phone" as IconName,
        title: "A new phone opened your store",
        body: `${n.phone.name} opened your store with your recovery code on ${formatStoreDay(new Date(n.phone.createdAt), now)}. Not you? Sign it out and make a new code.`,
        action: { label: "Review phones", href: "/settings" },
      };
    case "backup":
      return {
        icon: "cloud" as IconName,
        title: "Backup is waiting",
        body: `${n.pending} ${n.pending === 1 ? "entry is" : "entries are"} only on this phone. They back up by themselves once you are online.`,
        action: { label: "Open backup", href: "/settings" },
      };
  }
}

/** /notifications: alerts worked out on this phone from the store's own records. */
export function NotificationsScreen() {
  const { ready, items, isRead, unread, markRead, markAllRead } = useNotifications();
  const shown = useMinimumDelay();
  const [tab, setTab] = useState<Tab>("all");
  const marking = usePendingAction();
  const loaded = ready && shown;
  const now = loaded ? new Date() : null;

  const inTab = (n: AppNotification) =>
    tab === "all" || (tab === "alerts" ? n.category === "alerts" : n.category === "account");
  const counts = {
    all: items.length,
    alerts: items.filter((n) => n.category === "alerts").length,
    account: items.filter((n) => n.category === "account").length,
  };
  const list = items.filter(inTab);
  const groups = now
    ? [
        { label: "Today", items: list.filter((n) => isToday(n.at, now)) },
        { label: "Earlier", items: list.filter((n) => !isToday(n.at, now)) },
      ].filter((g) => g.items.length > 0)
    : [];

  return (
    <AppShell active="home">
      <header className="bar" style={{ paddingLeft: 4 }}>
        <Link href="/" className="icon-btn" aria-label="Back to home" style={{ color: "#fff" }}>
          <Icon name="back" size={22} />
        </Link>
        <div className="bar-title">
          <h1>Notifications</h1>
          <span className="bar-sub">
            {loaded ? (unread ? `${unread} unread` : "You’re all caught up") : "Checking…"}
          </span>
        </div>
        <ThemeToggle className="bar-theme" />
      </header>

      <main className="vscroll">
        <div className="page ntf-page">
          {!loaded ? (
            <div aria-busy="true" aria-label="Loading notifications" className="ntf-skel">
              <span className="skeleton" style={{ display: "block", height: 40 }} />
              {[0, 1, 2].map((i) => (
                <div key={i} className="card" style={{ padding: 14, display: "flex", gap: 12 }}>
                  <span
                    className="skeleton"
                    style={{ display: "block", width: 36, height: 36, borderRadius: 10 }}
                  />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                    <span
                      className="skeleton"
                      style={{ display: "block", height: 14, width: "70%" }}
                    />
                    <span
                      className="skeleton"
                      style={{ display: "block", height: 11, width: "95%" }}
                    />
                    <span
                      className="skeleton"
                      style={{ display: "block", height: 11, width: "40%" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="ntf-tools">
                <div className="seg" role="group" aria-label="Show">
                  {(["all", "alerts", "account"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={tab === t}
                      onClick={() => setTab(t)}
                    >
                      {t === "all" ? "All" : t === "alerts" ? "Alerts" : "Account"}
                      <span className="ntf-n">{counts[t]}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={unread === 0 || marking.pending}
                  onClick={() => void marking.run(markAllRead)}
                >
                  {marking.pending ? (
                    <span className="spin" aria-hidden="true" />
                  ) : (
                    <Icon name="check" size={14} />
                  )}
                  Mark all read
                </button>
              </div>

              {groups.length === 0 ? (
                <EmptyState
                  art={<Lapis pose="cheer" size={110} />}
                  title="Walang bagong balita"
                  body={
                    tab === "all"
                      ? "No one is overdue or over the limit. New alerts show up here."
                      : "Nothing here right now. Try another tab."
                  }
                  action={
                    <Link href="/" className="btn btn-secondary">
                      Back to clients
                    </Link>
                  }
                />
              ) : (
                groups.map((g) => (
                  <section key={g.label} className="ntf-group" aria-label={g.label}>
                    <h2 className="ntf-label">{g.label}</h2>
                    <ul className="card ntf-list">
                      {g.items.map((n) => {
                        const v = view(n, now!);
                        const [bg, fg] = TILE[n.severity];
                        const unreadItem = !isRead(n.key);
                        return (
                          <li key={n.key} className={`ntf-item ${unreadItem ? "is-unread" : ""}`}>
                            <span
                              className="ntf-icon"
                              style={{ background: bg, color: fg }}
                              aria-hidden="true"
                            >
                              <Icon name={v.icon} size={18} />
                            </span>
                            <div className="ntf-body">
                              <div className="ntf-top">
                                <strong>{v.title}</strong>
                                <span className="ntf-time">
                                  {isToday(n.at, now!)
                                    ? timeFmt.format(n.at)
                                    : formatStoreDay(n.at, now!)}
                                </span>
                              </div>
                              <p>{v.body}</p>
                              <Link
                                href={v.action.href}
                                className="ntf-action"
                                onClick={() => void markRead([n.key])}
                              >
                                {v.action.label}
                                <Icon name="chevron" size={13} strokeWidth={2.4} />
                              </Link>
                            </div>
                            {unreadItem && <span className="ntf-dot" aria-label="Unread" />}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))
              )}

              <p className="ntf-foot">
                <Icon name="lock" size={13} />
                Only you see these, and they’re worked out on this phone. Atrazo never texts your
                clients by itself.
              </p>
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}

/** Bell with an unread badge, for app bars. */
export function NotificationBell() {
  const { ready, unread } = useNotifications();
  return (
    <Link
      href="/notifications"
      className="icon-btn bar-bell"
      aria-label={ready && unread ? `Notifications, ${unread} unread` : "Notifications"}
      style={{ color: "#fff" }}
    >
      <Icon name="bell" size={20} />
      {ready && unread > 0 && <span className="count-badge">{unread > 9 ? "9+" : unread}</span>}
    </Link>
  );
}
