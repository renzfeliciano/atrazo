"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatPeso } from "@/core/money";
import { type CustomerOverview } from "@/modules/ledger/application/queries";
import { useApp } from "@/app/providers";
import { AppShell, syncLabel } from "@/ui/app-shell";
import { Lapis, LogoTile } from "@/ui/brand";
import { EmptyState } from "@/ui/empty-state";
import { Icon } from "@/ui/icons";
import { ThemeToggle } from "@/ui/theme";
import { useMinimumDelay } from "@/ui/use-minimum-delay";
import { NotificationBell } from "./notifications/notifications-screen";
import { BorrowerRowsPhone, BorrowerTable } from "./borrower-table";

type Filter = "all" | "overdue" | "over" | "ahead";
const SORTS = [
  {
    label: "Highest balance",
    fn: (a: CustomerOverview, b: CustomerOverview) => b.account.balance - a.account.balance,
  },
  {
    label: "Longest unpaid",
    fn: (a: CustomerOverview, b: CustomerOverview) => b.account.daysUnpaid - a.account.daysUnpaid,
  },
  {
    label: "Most recent",
    fn: (a: CustomerOverview, b: CustomerOverview) =>
      (b.account.lastEntryAt?.getTime() ?? 0) - (a.account.lastEntryAt?.getTime() ?? 0),
  },
  {
    label: "Name A–Z",
    fn: (a: CustomerOverview, b: CustomerOverview) =>
      a.customer.name.localeCompare(b.customer.name),
  },
  {
    label: "Most limit used",
    fn: (a: CustomerOverview, b: CustomerOverview) =>
      b.account.limitUsedPercent - a.account.limitUsedPercent,
  },
] as const;

const peso = (c: number, sign: "auto" | "always" = "auto") => formatPeso(c as never, { sign });
const whole = (c: number) => formatPeso(c as never, { whole: true });

function reminderHref(o: CustomerOverview, ledger: string): string {
  const body = `Magandang araw po, ${o.customer.name}. Ang balanse ninyo sa ${ledger} ay ${peso(o.account.balance)}. Salamat po!`;
  return `sms:${o.customer.phone ?? ""}?body=${encodeURIComponent(body)}`;
}

export function DashboardScreen() {
  const { phone, sync } = useApp();
  const data = useLiveQuery(() => phone!.queries.dashboard(), [phone]);
  const settings = useLiveQuery(() => phone!.queries.settings(), [phone]);
  const shown = useMinimumDelay();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sortIdx, setSortIdx] = useState(0);
  const now = new Date();

  const customers = useMemo(() => data?.customers ?? [], [data]);
  const counts = {
    all: customers.length,
    overdue: customers.filter((o) => o.account.isOverdue).length,
    over: customers.filter((o) => o.account.isOverLimit).length,
    ahead: customers.filter((o) => o.account.isPaidAhead).length,
  };
  const list = useMemo(() => {
    const key = q.trim().toLowerCase();
    const pick: Record<Filter, (o: CustomerOverview) => boolean> = {
      all: () => true,
      overdue: (o) => o.account.isOverdue,
      over: (o) => o.account.isOverLimit,
      ahead: (o) => o.account.isPaidAhead,
    };
    return customers
      .filter(pick[filter])
      .filter((o) => !key || o.customer.name.toLowerCase().includes(key))
      .sort(SORTS[sortIdx]!.fn);
  }, [customers, q, filter, sortIdx]);

  const ledgerName = settings?.name ?? "My listahan";
  const overdueDays = settings?.overdueAfterDays ?? 30;

  if (!data || !settings || !shown) return <DashboardSkeleton />;

  return (
    <AppShell active="home">
      <header className="bar">
        <span className="dash-logo">
          <LogoTile />
        </span>
        <div className="bar-title">
          <h1>{ledgerName}</h1>
          <span className="bar-sub" role="status">
            <span className="live" aria-hidden="true" />
            {syncLabel(sync.state, sync.pending)}
          </span>
        </div>
        <NotificationBell />
        <ThemeToggle className="bar-theme" />
      </header>

      {/* With borrowers, only the borrower table scrolls; the totals, search and filters stay put. */}
      <main className={`vscroll ${customers.length > 0 ? "fit-main" : ""}`}>
        <section className="hero" aria-labelledby="total-l" style={{ padding: "6px 16px 66px" }}>
          <div className="page page-wide" style={{ padding: "0 0" }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: "8px 12px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <span id="total-l" style={{ fontSize: 13, color: "#9AA3AD" }}>
                  Total owed to you
                </span>
                <span
                  className="disp mono"
                  style={{ fontSize: "clamp(30px, 10vw, 38px)", lineHeight: 1 }}
                >
                  {data ? peso(data.totalOwed) : "₱—"}
                </span>
              </div>
              <span
                className="tag mono"
                style={{
                  background: "rgba(255,255,255,.1)",
                  color: "#E6E9ED",
                  whiteSpace: "nowrap",
                }}
              >
                {data?.owingCount ?? 0} {data?.owingCount === 1 ? "borrower" : "borrowers"}
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                marginTop: 16,
                borderTop: "1px solid rgba(255,255,255,.12)",
              }}
            >
              <Stat label="Utang this week" value={data ? `+${whole(data.week.utang)}` : "—"} />
              <Stat
                label="Bayad this week"
                value={data ? `−${whole(data.week.bayad)}` : "—"}
                color="#7CC3E6"
                divider
              />
              <Stat
                label={`Overdue ${overdueDays}+`}
                value={data ? whole(data.overdueTotal) : "—"}
                color="#FFB199"
                divider
              />
            </div>
          </div>
        </section>

        <div className="page page-wide dash-body" style={{ marginTop: -50 }}>
          <div
            className="dash-side"
            style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 12px" }}
          >
            {data && customers.length === 0 && (
              <section
                className="card-raised"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  padding: "18px 18px 18px",
                  textAlign: "center",
                }}
              >
                <Lapis pose="wave" size={112} />
                <h2 className="disp" style={{ fontSize: 20 }}>
                  Wala pang nakalista
                </h2>
                <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--text-2)" }}>
                  Write the first utang: a name and an amount. Lapis keeps every balance and the
                  total owed to you added up.
                </p>
                <Link
                  href="/entry"
                  className="btn btn-primary btn-lg btn-block"
                  style={{ marginTop: 6 }}
                >
                  <Icon name="plus" size={18} strokeWidth={2.6} />
                  Write the first utang
                </Link>
                <Link href="/borrowers/new" className="btn btn-secondary btn-block">
                  <Icon name="userPlus" size={18} />
                  Add a borrower
                </Link>
              </section>
            )}

            {data && customers.length > 0 && data.toCollect.length === 0 && (
              <section
                className="card-raised dash-caughtup"
                aria-label="Nobody to collect from today"
                style={{
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  padding: 18,
                  textAlign: "center",
                }}
              >
                <Lapis pose="cheer" size={96} />
                <h2 className="disp" style={{ fontSize: 18 }}>
                  Walang sisingilin today
                </h2>
                <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--text-2)" }}>
                  Nobody is overdue. Borrowers show up here, longest unpaid first, once a balance
                  goes unpaid too long.
                </p>
              </section>
            )}

            {data && data.toCollect.length > 0 && (
              <section
                className="card-raised"
                aria-labelledby="collect-h"
                style={{ overflow: "hidden" }}
              >
                <div className="card-head">
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <h2 id="collect-h">Singilin today</h2>
                    <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                      Longest unpaid first
                    </span>
                  </div>
                  <span className="tag tag-danger">
                    <span className="pip" />
                    {data.toCollect.length} overdue
                  </span>
                </div>
                <ul>
                  {data.toCollect.slice(0, 3).map((o) => (
                    <li key={o.customer.id} className="row">
                      <Link
                        href={`/borrower?id=${o.customer.id}`}
                        className="row-main"
                        style={{ textDecoration: "none", color: "var(--text)" }}
                      >
                        <span className="row-title">{o.customer.name}</span>
                        <span style={{ fontSize: 12.5, color: "var(--danger)", fontWeight: 600 }}>
                          {o.account.daysUnpaid} days unpaid
                        </span>
                      </Link>
                      <span
                        className="mono"
                        style={{ flex: "none", fontSize: 15, fontWeight: 700 }}
                      >
                        {peso(o.account.balance)}
                      </span>
                      <a
                        href={reminderHref(o, ledgerName)}
                        className="btn btn-secondary btn-sm"
                        aria-label={`Send ${o.customer.name} a reminder`}
                      >
                        <Icon name="message" size={15} />
                        Remind
                      </a>
                    </li>
                  ))}
                </ul>
                {data.toCollect.length > 3 && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilter("overdue");
                      setSortIdx(1);
                    }}
                    className="dash-more"
                  >
                    See all {data.toCollect.length} overdue
                    <Icon name="chevron" size={14} strokeWidth={2.4} />
                  </button>
                )}
              </section>
            )}
          </div>

          {customers.length > 0 && (
            <div
              className="dash-main"
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <div
                className="dash-tools"
                style={{ display: "flex", flexDirection: "column", gap: 10, padding: "6px 12px 0" }}
              >
                <div style={{ display: "flex", gap: 8 }}>
                  <label htmlFor="borrower-search" className="sr">
                    Search borrowers
                  </label>
                  <div className="input-wrap" style={{ flex: 1 }}>
                    <span
                      style={{
                        position: "absolute",
                        left: 12,
                        color: "var(--muted)",
                        display: "flex",
                      }}
                    >
                      <Icon name="search" size={18} />
                    </span>
                    <input
                      id="borrower-search"
                      className="input"
                      type="search"
                      placeholder={`Search ${customers.length} ${customers.length === 1 ? "borrower" : "borrowers"}`}
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      style={{ height: 44, paddingLeft: 38 }}
                    />
                  </div>
                  <Link
                    href="/borrowers/new"
                    className="btn btn-secondary"
                    aria-label="Add a borrower"
                    style={{ width: 44, padding: 0 }}
                  >
                    <Icon name="userPlus" size={20} />
                  </Link>
                </div>
                <div
                  role="group"
                  aria-label="Filter borrowers"
                  className="hscroll"
                  style={{ display: "flex", gap: 6 }}
                >
                  {(
                    [
                      ["all", "All"],
                      ["overdue", "Overdue"],
                      ["over", "Over limit"],
                      ["ahead", "Paid ahead"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className="chip"
                      aria-pressed={filter === key}
                      onClick={() => setFilter(key)}
                    >
                      {label}
                      <span className="n">{counts[key]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <section
                className="card scroll-card"
                aria-label="Borrowers"
                style={{ margin: "0 12px 12px", ["--head-h" as string]: "38px" }}
              >
                <div className="list-head">
                  <span role="status">
                    {list.length} {list.length === 1 ? "borrower" : "borrowers"}
                  </span>
                  <button
                    type="button"
                    className="sort-btn"
                    onClick={() => setSortIdx((sortIdx + 1) % SORTS.length)}
                  >
                    {SORTS[sortIdx]!.label}
                    <Icon name="sort" size={13} strokeWidth={2.4} />
                  </button>
                </div>

                {/* Phones and tablets: rows with a limit meter. */}
                <BorrowerRowsPhone list={list} now={now} />

                {/* Desktop: a proper data table. */}
                <BorrowerTable
                  list={list}
                  now={now}
                  sort={SORTS[sortIdx]!.label}
                  onSort={(label) =>
                    setSortIdx(
                      Math.max(
                        0,
                        SORTS.findIndex((x) => x.label === label),
                      ),
                    )
                  }
                />

                {list.length === 0 && (
                  <EmptyState
                    bare
                    compact
                    art={<Icon name="search" size={24} />}
                    title={q ? `No borrower matches “${q}”` : "No borrowers in this filter"}
                    body={
                      q
                        ? "Check the spelling, or add them as a new borrower."
                        : "Everyone is in good standing here. Try another filter."
                    }
                    action={
                      q ? (
                        <Link
                          href={`/borrowers/new?name=${encodeURIComponent(q)}`}
                          className="btn btn-primary btn-sm"
                        >
                          <Icon name="userPlus" size={15} />
                          Add “{q}”
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setFilter("all")}
                        >
                          Show all borrowers
                        </button>
                      )
                    }
                    secondary={
                      q ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setQ("")}
                        >
                          Clear search
                        </button>
                      ) : undefined
                    }
                  />
                )}
              </section>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  color,
  divider,
}: {
  label: string;
  value: string;
  color?: string;
  divider?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 2,
        padding: divider ? "10px 10px 0 12px" : "10px 10px 0 0",
        borderLeft: divider ? "1px solid rgba(255,255,255,.12)" : undefined,
      }}
    >
      <span style={{ fontSize: 12, color: "#9AA3AD" }}>{label}</span>
      <span className="mono" style={{ fontSize: 16, fontWeight: 700, color }}>
        {value}
      </span>
    </div>
  );
}

/** Dashboard-shaped placeholder inside the real shell, so navigation is usable while data loads. */
export function DashboardSkeleton() {
  return (
    <AppShell active="home">
      <header className="bar">
        <div className="bar-title" style={{ gap: 6 }}>
          <span className="skeleton skel-ink" style={{ height: 16, width: 170 }} />
          <span className="skeleton skel-ink" style={{ height: 11, width: 120 }} />
        </div>
      </header>
      <main className="vscroll" aria-busy="true" aria-label="Loading your borrowers">
        <section className="hero" style={{ padding: "6px 16px 66px" }}>
          <div
            className="page page-wide"
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            <span className="skeleton skel-ink" style={{ height: 12, width: 110 }} />
            <span className="skeleton skel-ink" style={{ height: 38, width: 210 }} />
            <span
              className="skeleton skel-ink"
              style={{ height: 34, width: "100%", marginTop: 10 }}
            />
          </div>
        </section>
        <div
          className="page page-wide"
          style={{
            marginTop: -50,
            padding: "0 12px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div className="skeleton" style={{ height: 44 }} />
          <div
            className="card"
            style={{ padding: 14, display: "flex", flexDirection: "column", gap: 16 }}
          >
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
                  <div className="skeleton" style={{ height: 14, width: `${62 - i * 7}%` }} />
                  <div className="skeleton" style={{ height: 11, width: "34%" }} />
                </div>
                <div className="skeleton" style={{ height: 16, width: 76 }} />
              </div>
            ))}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
