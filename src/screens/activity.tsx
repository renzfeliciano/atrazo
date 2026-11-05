"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useState } from "react";
import { type Cents, formatPeso } from "@/core/money";
import { formatLedgerDay, LEDGER_TIME_ZONE, ledgerDay } from "@/core/time";
import { type ActivityDay, type ActivityItem } from "@/modules/ledger/application/activity";
import { useApp } from "@/app/providers";
import { AppShell } from "@/ui/app-shell";
import { Lapis } from "@/ui/brand";
import { EmptyState } from "@/ui/empty-state";
import { Icon } from "@/ui/icons";
import { ThemeToggle } from "@/ui/theme";
import { useMinimumDelay } from "@/ui/use-minimum-delay";

type Filter = "all" | "utang" | "bayad";
const STEP_DAYS = 7;

const timeFmt = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: LEDGER_TIME_ZONE,
});
const weekdayFmt = new Intl.DateTimeFormat("en-PH", {
  weekday: "long",
  timeZone: LEDGER_TIME_ZONE,
});
const peso = (c: number, sign: "auto" | "always" = "always") => formatPeso(c as Cents, { sign });
const noon = (day: string) => new Date(`${day}T04:00:00Z`);

function dayLabel(day: string, now: Date): string {
  const today = ledgerDay(now);
  const yesterday = ledgerDay(new Date(now.getTime() - 86_400_000));
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  return `${weekdayFmt.format(noon(day))}, ${formatLedgerDay(noon(day), now)}`;
}

/** "Every utang and bayad, newest first", across all borrowers. */
export function ActivityScreen() {
  const { phone } = useApp();
  const [days, setDays] = useState(STEP_DAYS);
  const [filter, setFilter] = useState<Filter>("all");
  const loaded = useLiveQuery(() => phone?.queries.activity(days), [phone, days]);
  const minimumShown = useMinimumDelay();
  const feed = minimumShown ? loaded : undefined;
  // Read the clock only once the phone's data is here: on the server (prerender) there is no feed,
  // and a date frozen at build time would be wrong on every visit.
  const now = feed ? new Date() : null;

  const counts = feed && {
    all: feed.totals.utangCount + feed.totals.bayadCount,
    utang: feed.totals.utangCount,
    bayad: feed.totals.bayadCount,
  };
  const shown: ActivityDay[] =
    feed?.days
      .map((d) => ({
        ...d,
        items: d.items.filter((i) => filter === "all" || i.entry.kind === filter),
      }))
      .filter((d) => d.items.length > 0) ?? [];

  return (
    <AppShell active="activity">
      <header className="bar" style={{ paddingLeft: 4 }}>
        <Link href="/" className="icon-btn" aria-label="Back to home" style={{ color: "#fff" }}>
          <Icon name="back" size={22} />
        </Link>
        <div className="bar-title">
          <h1>Activity</h1>
          <span className="bar-sub">Every utang and bayad, newest first</span>
        </div>
        <ThemeToggle className="bar-theme" />
      </header>

      <main className="vscroll">
        <section className="hero act-hero" aria-label="Totals for these days">
          <div className="page">
            <p className="act-range">
              <Icon name="calendar" size={14} />
              {feed ? (
                <>
                  {formatLedgerDay(noon(feed.from), now!)} – {formatLedgerDay(noon(feed.to), now!)}
                  <span>{days === STEP_DAYS ? "Last 7 days" : `Last ${days} days`}</span>
                </>
              ) : (
                <span className="skeleton act-skel-line" style={{ width: 150 }} />
              )}
            </p>
            <div className="act-stats">
              <Stat
                label="Utang given"
                value={feed && peso(feed.totals.utang)}
                sub={feed && `${feed.totals.utangCount} entries`}
              />
              <Stat
                label="Bayad received"
                value={feed && peso(-feed.totals.bayad)}
                sub={feed && `${feed.totals.bayadCount} entries`}
                tone="bayad"
              />
              <Stat
                label="Net change"
                value={feed && peso(feed.totals.net)}
                sub={
                  feed &&
                  (feed.totals.net > 0
                    ? "owed went up"
                    : feed.totals.net < 0
                      ? "owed went down"
                      : "no change")
                }
              />
            </div>
          </div>
        </section>

        <div className="page act-body">
          {!feed ? (
            <ActivitySkeleton />
          ) : feed.days.length === 0 ? (
            <EmptyState
              art={<Lapis pose="sleep" size={120} />}
              title="Tahimik pa ang listahan"
              body={`No utang or bayad in the last ${days} days. New entries show up here as you write them.`}
              action={
                <Link href="/entry" className="btn btn-primary btn-lg">
                  <Icon name="plus" size={18} strokeWidth={2.6} />
                  Write an entry
                </Link>
              }
              secondary={
                feed.hasEarlier ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setDays((d) => d + STEP_DAYS)}
                  >
                    Show earlier days
                  </button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="tabs act-tabs" role="tablist" aria-label="Show entries">
                {(["all", "utang", "bayad"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    className="tab"
                    aria-selected={filter === t}
                    onClick={() => setFilter(t)}
                  >
                    {t === "all" ? "All" : t === "utang" ? "Utang" : "Bayad"}
                    <span className="n">{counts?.[t]}</span>
                  </button>
                ))}
              </div>

              {shown.length === 0 ? (
                <EmptyState
                  compact
                  art={<Icon name="search" size={26} />}
                  title={`No ${filter} in these days`}
                  body="Try another tab, or look further back."
                  action={
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setFilter("all")}
                    >
                      Show all entries
                    </button>
                  }
                />
              ) : (
                shown.map((d) => <DayCard key={d.day} day={d} label={dayLabel(d.day, now!)} />)
              )}

              {feed.hasEarlier && (
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  onClick={() => setDays((d) => d + STEP_DAYS)}
                >
                  <Icon name="chevronDown" size={16} />
                  Show earlier days
                </button>
              )}
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | undefined;
  sub: string | undefined;
  tone?: "bayad";
}) {
  return (
    <div className="act-stat">
      <span className="act-stat-label">{label}</span>
      {value === undefined ? (
        <span className="skeleton act-skel-line" style={{ width: 84, height: 20 }} />
      ) : (
        <strong className={`mono ${tone === "bayad" ? "act-bayad" : ""}`}>{value}</strong>
      )}
      <span className="act-stat-sub">{sub ?? " "}</span>
    </div>
  );
}

function DayCard({ day, label }: { day: ActivityDay; label: string }) {
  return (
    <section className="card act-day" aria-label={label}>
      <header className="act-day-head">
        <h2>{label}</h2>
        <span className="mono">
          {day.utang > 0 && <span>{peso(day.utang)}</span>}
          {day.bayad > 0 && <span className="act-bayad">{peso(-day.bayad)}</span>}
        </span>
      </header>
      <ul>
        {day.items.map((i) => (
          <Row key={i.entry.id} item={i} />
        ))}
      </ul>
    </section>
  );
}

function Row({ item }: { item: ActivityItem }) {
  const { entry, customer, voided, voidedReason } = item;
  const bayad = entry.kind === "bayad";
  return (
    <li>
      <Link
        href={`/borrower?id=${customer.id}`}
        className={`row act-row ${voided ? "is-void" : ""}`}
      >
        <span className="act-time mono">{timeFmt.format(entry.occurredAt)}</span>
        <span className="row-main">
          <span className="row-title">{customer.name}</span>
          <span className="row-sub">
            {voided ? (
              <span className="tag tag-outline">
                Voided{voidedReason ? ` · ${voidedReason}` : ""}
              </span>
            ) : (
              (entry.note ?? (bayad ? "Bayad" : "Utang"))
            )}
          </span>
        </span>
        <span className={`act-amt mono ${bayad ? "act-bayad" : ""}`}>{peso(entry.amount)}</span>
      </Link>
    </li>
  );
}

function ActivitySkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading activity"
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div className="skeleton" style={{ height: 40 }} />
      {[3, 2].map((n, d) => (
        <div
          key={d}
          className="card"
          style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}
        >
          <div className="skeleton" style={{ height: 14, width: 120 }} />
          {Array.from({ length: n }, (_, i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div className="skeleton" style={{ height: 12, width: 52 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="skeleton" style={{ height: 13, width: "60%" }} />
                <div className="skeleton" style={{ height: 11, width: "35%" }} />
              </div>
              <div className="skeleton" style={{ height: 14, width: 70 }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
