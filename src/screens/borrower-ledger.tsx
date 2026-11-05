"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLayoutEffect, useMemo, useState } from "react";
import { add, type Cents, formatPeso, ZERO } from "@/core/money";
import { formatLedgerDay, LEDGER_TIME_ZONE } from "@/core/time";
import { type LedgerRow } from "@/modules/ledger/domain/account";
import { formatPhilippineMobile } from "@/modules/ledger/domain/customer";
import { type Entry } from "@/modules/ledger/domain/entry";
import { type CustomerId } from "@/modules/ledger/domain/ids";
import { useApp } from "@/app/providers";
import { AppShell } from "@/ui/app-shell";
import { EmptyState } from "@/ui/empty-state";
import { Icon } from "@/ui/icons";
import { useMinimumDelay } from "@/ui/use-minimum-delay";

type Tab = "all" | "utang" | "bayad";
const yearFmt = new Intl.DateTimeFormat("en-PH", {
  year: "numeric",
  timeZone: LEDGER_TIME_ZONE,
});
const dayFmt = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  timeZone: LEDGER_TIME_ZONE,
});
const weekdayFmt = new Intl.DateTimeFormat("en-PH", {
  weekday: "short",
  timeZone: LEDGER_TIME_ZONE,
});
const sinceFmt = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: LEDGER_TIME_ZONE,
});
const plain = (c: number, sign: "auto" | "always" = "always") =>
  formatPeso(c as Cents, { symbol: false, sign });
const peso = (c: number) => formatPeso(c as Cents);
const VOID_REASONS = ["Entered twice", "Wrong amount", "Wrong borrower"];

interface Group {
  readonly label: string;
  readonly net: Cents;
  readonly rows: LedgerRow[];
}

function groupByYear(rows: readonly LedgerRow[], tab: Tab): Group[] {
  const groups: Group[] = [];
  for (const r of rows) {
    if (tab !== "all" && (r.type !== "entry" || r.entry.kind !== tab)) continue;
    const at = r.type === "settled" ? r.at : r.entry.occurredAt;
    const label = yearFmt.format(at);
    let g = groups.at(-1);
    if (!g || g.label !== label) {
      g = { label, net: ZERO, rows: [] };
      groups.push(g);
    }
    g.rows.push(r);
    if (r.type === "entry") (g as { net: Cents }).net = add(g.net, r.entry.amount);
  }
  return groups;
}

export function BorrowerLedgerScreen() {
  const id = useSearchParams().get("id") as CustomerId | null;
  const { phone, toast, sync } = useApp();
  const ledger = useLiveQuery(
    async () => (phone && id ? ((await phone.queries.customerLedger(id)) ?? null) : undefined),
    [phone, id],
  );
  const settings = useLiveQuery(() => phone?.queries.settings(), [phone]);
  const shown = useMinimumDelay(id);
  const [tab, setTab] = useState<Tab>("all");
  const [voiding, setVoiding] = useState<Entry | null>(null);
  // Next keeps this page mounted when you leave it; close the dialog so it never reopens on return.
  useLayoutEffect(() => () => setVoiding(null), []);
  const groups = useMemo(() => (ledger ? groupByYear(ledger.rows, tab) : []), [ledger, tab]);

  if (ledger === undefined || !shown) return <LedgerSkeleton />;
  if (ledger === null) {
    return (
      <AppShell active="home">
        <header className="bar">
          <div className="bar-title">
            <h1>Borrower not found</h1>
          </div>
        </header>
        <main className="vscroll" style={{ padding: 16 }}>
          <Link href="/" className="btn btn-secondary">
            Back to borrowers
          </Link>
        </main>
      </AppShell>
    );
  }

  const { customer, account, counts } = ledger;
  const reminder = `Magandang araw po, ${customer.name}. Ang balanse ninyo sa ${settings?.name ?? "aming tindahan"} ay ${peso(account.balance)}. Salamat po!`;
  const status = account.isOverLimit
    ? { cls: "tag-danger", text: `${peso(account.overLimitBy)} over limit` }
    : account.isOverdue
      ? { cls: "tag-danger", text: `${account.daysUnpaid} days unpaid` }
      : account.isPaidAhead
        ? { cls: "tag-info", text: "Paid ahead" }
        : account.balance === 0
          ? { cls: "tag-success", text: "Fully paid" }
          : { cls: "tag-success", text: "Within limit" };

  async function confirmVoid(reason: string) {
    if (!phone || !voiding) return;
    const r = await phone.commands.voidEntry(voiding.id, reason);
    setVoiding(null);
    if (r.ok) {
      sync.notifyWrite();
      toast({ title: "Entry voided", detail: `${plain(voiding.amount)} · ${reason}` });
    } else {
      toast({ title: "Couldn't void this entry", detail: r.error.message, tone: "error" });
    }
  }

  return (
    <AppShell active="home">
      <header className="bar" style={{ paddingLeft: 4 }}>
        <Link
          href="/"
          className="icon-btn"
          aria-label="Back to borrowers"
          style={{ color: "#fff" }}
        >
          <Icon name="back" size={22} />
        </Link>
        <div className="bar-title">
          <h1>{customer.name}</h1>
          <span className="bar-sub">
            <span className="bar-sub-text">
              {customer.phone ? (
                <span className="mono">{formatPhilippineMobile(customer.phone)}</span>
              ) : (
                "No mobile number"
              )}{" "}
              · borrower since {sinceFmt.format(customer.createdAt)}
            </span>
          </span>
        </div>
        <Link
          href={`/statement?id=${customer.id}`}
          className="icon-btn"
          aria-label="Statement"
          title="Statement"
          style={{ color: "#fff" }}
        >
          <Icon name="file" size={20} />
        </Link>
        <Link
          href={`/borrowers/edit?id=${customer.id}`}
          className="icon-btn"
          aria-label="Edit borrower"
          style={{ color: "#fff" }}
        >
          <Icon name="edit" size={20} />
        </Link>
      </header>

      {/* Only the entries table scrolls; the balance card and actions stay in view. */}
      <main className="vscroll fit-main">
        <div className="hero" style={{ height: 44 }} />
        <div
          className="page fit-page"
          style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 12px 24px" }}
        >
          <section
            className="card-raised"
            aria-label="Balance"
            style={{ position: "relative", marginTop: -36, overflow: "hidden" }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: "14px 14px 12px",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <span style={{ fontSize: 13, color: "var(--muted)" }}>Balance</span>
                <span className={`tag ${status.cls}`}>
                  <span className="pip" />
                  {status.text}
                </span>
              </div>
              <span
                className="disp mono"
                style={{
                  fontSize: 36,
                  lineHeight: 1,
                  color: account.isPaidAhead ? "var(--info)" : "var(--text)",
                }}
              >
                {account.isPaidAhead
                  ? `(${formatPeso(account.balance, { sign: "never" })})`
                  : peso(account.balance)}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  className={`meter ${account.limitUsedPercent >= 90 ? "is-danger" : ""}`}
                  aria-hidden="true"
                  style={{ flex: 1 }}
                >
                  <span style={{ width: `${account.limitUsedPercent}%` }} />
                </span>
                <span className="mono muted" style={{ fontSize: 12.5 }}>
                  {account.isOverLimit
                    ? `limit ${formatPeso(account.limit, { whole: true })}`
                    : `${peso(Math.max(0, account.limit - account.balance))} more they can borrow · limit ${formatPeso(account.limit, { whole: true })}`}
                </span>
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                borderTop: "1px solid var(--line-soft)",
                background: "var(--surface-2)",
              }}
            >
              <MiniStat
                label={
                  account.settledAt
                    ? `Utang since ${formatLedgerDay(account.settledAt, new Date())}`
                    : "Total utang"
                }
                value={peso(account.utangSinceSettled)}
                hint={account.settledAt ? "after last fully paid" : undefined}
              />
              <MiniStat
                label={
                  account.settledAt
                    ? `Bayad since ${formatLedgerDay(account.settledAt, new Date())}`
                    : "Total bayad"
                }
                hint={account.settledAt ? "after last fully paid" : undefined}
                value={peso(account.bayadSinceSettled)}
                color="var(--info)"
                divider
              />
              <MiniStat
                label="Last bayad"
                value={account.lastBayadAt ? daysAgo(account.lastBayadAt) : "None yet"}
                divider
              />
            </div>
          </section>

          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}
          >
            {customer.phone ? (
              <a href={`tel:${customer.phone}`} className="btn btn-secondary btn-sm">
                <Icon name="phone" size={15} />
                Call
              </a>
            ) : (
              // No number yet: offer to add one instead of a dead Call button.
              <Link
                href={`/borrowers/edit?id=${customer.id}&focus=phone`}
                className="btn btn-secondary btn-sm"
              >
                <Icon name="plus" size={15} />
                Add number
              </Link>
            )}
            <a
              href={`sms:${customer.phone ?? ""}?body=${encodeURIComponent(reminder)}`}
              className="btn btn-secondary btn-sm"
            >
              <Icon name="message" size={15} />
              Remind
            </a>
          </div>

          <section
            className="card scroll-card"
            aria-label="Entries"
            style={{ ["--head-h" as string]: "var(--tabs-h)" }}
          >
            <div className="tabs" role="tablist" aria-label="Show entries">
              {(["all", "utang", "bayad"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  className="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                >
                  {t === "all" ? "All" : t === "utang" ? "Utang" : "Bayad"}
                  <span className="n">{counts[t]}</span>
                </button>
              ))}
            </div>

            {groups.length === 0 ? (
              <EmptyState
                bare
                compact
                art={<Icon name={tab === "bayad" ? "minus" : "plus"} size={24} />}
                title={
                  tab === "all"
                    ? `Nothing written for ${customer.name} yet`
                    : `No ${tab} for ${customer.name} yet`
                }
                body={
                  tab === "bayad"
                    ? "When they pay, record it here and the balance goes down."
                    : "Write what they took on credit; the balance adds up for you."
                }
                action={
                  <Link
                    href={`/entry?c=${customer.id}&kind=${tab === "bayad" ? "bayad" : "utang"}`}
                    className={`btn ${tab === "bayad" ? "btn-info" : "btn-primary"}`}
                  >
                    <Icon name={tab === "bayad" ? "minus" : "plus"} size={16} strokeWidth={2.6} />
                    {tab === "bayad" ? "Record a bayad" : "Write the first utang"}
                  </Link>
                }
              />
            ) : (
              <>
                <EntryRowsPhone groups={groups} onVoid={setVoiding} />
                <table className="tbl le-table">
                  <thead>
                    <tr>
                      <th scope="col" style={{ width: 66 }}>
                        Date
                      </th>
                      <th scope="col">Details</th>
                      <th scope="col" className="num" style={{ width: 92 }}>
                        Amount
                      </th>
                      <th scope="col" className="num" style={{ width: 92 }}>
                        Balance
                      </th>
                    </tr>
                  </thead>
                  {groups.map((g) => (
                    <tbody key={g.label}>
                      <tr className="grp">
                        <td colSpan={2}>{g.label}</td>
                        <td colSpan={2} className="num mono">
                          net {plain(g.net)}
                        </td>
                      </tr>
                      {g.rows.map((r) =>
                        r.type === "settled" ? (
                          <tr key={`settled-${r.at.getTime()}`}>
                            <td
                              colSpan={4}
                              style={{
                                padding: "8px 14px",
                                background: "var(--success-tint)",
                                color: "var(--on-success-tint)",
                                fontSize: 12.5,
                                fontWeight: 700,
                              }}
                            >
                              <span
                                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                              >
                                <Icon name="check" size={14} strokeWidth={2.8} />
                                Fully paid · {formatLedgerDay(r.at, new Date())} · balance ₱0.00
                              </span>
                            </td>
                          </tr>
                        ) : (
                          <tr
                            key={r.entry.id}
                            className={r.type === "voided" ? "void" : undefined}
                            onClick={r.type === "entry" ? () => setVoiding(r.entry) : undefined}
                            style={{ cursor: r.type === "entry" ? "pointer" : undefined }}
                            title={r.type === "entry" ? "Tap to void this entry" : undefined}
                          >
                            <td>
                              <span style={{ display: "flex", flexDirection: "column" }}>
                                <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                                  {dayFmt.format(r.entry.occurredAt)}
                                </span>
                                <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                                  {weekdayFmt.format(r.entry.occurredAt)}
                                </span>
                              </span>
                            </td>
                            <td>
                              <span
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 3,
                                  alignItems: "flex-start",
                                }}
                              >
                                <span>
                                  {r.entry.note ?? (r.entry.kind === "bayad" ? "Bayad" : "Utang")}
                                </span>
                                {r.type === "voided" && (
                                  <span className="tag tag-outline">
                                    Voided{r.reason ? ` · ${r.reason}` : ""}
                                  </span>
                                )}
                                {r.pending && r.type === "entry" && (
                                  <span className="tag tag-warn">Not backed up yet</span>
                                )}
                              </span>
                            </td>
                            <td className="num">
                              <span
                                className="amt mono"
                                style={{
                                  fontWeight: 700,
                                  color:
                                    r.entry.kind === "bayad"
                                      ? "var(--info)"
                                      : r.type === "voided"
                                        ? "var(--faint)"
                                        : "var(--text)",
                                }}
                              >
                                {plain(r.entry.amount)}
                              </span>
                            </td>
                            <td className="num mono muted">
                              {r.type === "entry" ? plain(r.balanceAfter, "auto") : "—"}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  ))}
                </table>
              </>
            )}
          </section>
          <p className="muted" style={{ fontSize: 12, padding: "0 4px" }}>
            Entries are never deleted. A mistake is voided and stays visible, so the balance can
            always be traced.
          </p>
        </div>
      </main>

      <footer className="action-bar ledger-actions" style={{ flexDirection: "row", gap: 10 }}>
        <Link
          href={`/entry?c=${customer.id}&kind=utang`}
          className="btn btn-lg btn-primary"
          style={{ flex: 1 }}
        >
          <Icon name="plus" size={18} strokeWidth={2.6} />
          Utang
        </Link>
        <Link
          href={`/entry?c=${customer.id}&kind=bayad`}
          className="btn btn-lg btn-info"
          style={{ flex: 1 }}
        >
          <Icon name="minus" size={18} strokeWidth={2.6} />
          Bayad
        </Link>
      </footer>

      {voiding && (
        <div className="dialog-backdrop" role="presentation" onClick={() => setVoiding(null)}>
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="void-h"
            onClick={(e) => e.stopPropagation()}
            style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}
          >
            <h2 id="void-h" className="disp" style={{ fontSize: 19 }}>
              Void this entry?
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--text-2)" }}>
              <strong className="mono">{plain(voiding.amount)}</strong> on{" "}
              {formatLedgerDay(voiding.occurredAt, new Date())}
              {voiding.note ? ` · ${voiding.note}` : ""}. It stays on the page, crossed out, and the
              balance is corrected.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {VOID_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  className="btn btn-secondary btn-block"
                  onClick={() => void confirmVoid(reason)}
                >
                  {reason}
                </button>
              ))}
              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={() => setVoiding(null)}
              >
                Keep entry
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

/**
 * Entries on phones: one fixed grid per entry instead of a four-column table, so long notes
 * get the full width and amounts and running balances line up on the right.
 */
function EntryRowsPhone({
  groups,
  onVoid,
}: {
  groups: readonly Group[];
  onVoid: (e: Entry) => void;
}) {
  return (
    <div className="le-rows">
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <div className="le-group">
            <span>{g.label}</span>
            <span className="mono">net {plain(g.net)}</span>
          </div>
          <ul>
            {g.rows.map((r) => {
              if (r.type === "settled") {
                return (
                  <li key={`settled-${r.at.getTime()}`} className="le-settled">
                    <Icon name="check" size={14} strokeWidth={2.8} />
                    Fully paid · {formatLedgerDay(r.at, new Date())} · balance ₱0.00
                  </li>
                );
              }
              const e = r.entry;
              const voided = r.type === "voided";
              const kind = e.kind === "bayad" ? "bayad" : "utang";
              const body = (
                <>
                  <span className={`le-icon is-${kind}`} aria-hidden="true">
                    <Icon name={kind === "bayad" ? "minus" : "plus"} size={14} strokeWidth={2.8} />
                  </span>
                  <span className="le-note">
                    {e.note ?? (kind === "bayad" ? "Bayad" : "Utang")}
                  </span>
                  <span className={`le-amount mono is-${kind}`}>{plain(e.amount)}</span>
                  <span className="le-meta">
                    <span>
                      {dayFmt.format(e.occurredAt)} · {weekdayFmt.format(e.occurredAt)}
                    </span>
                    {voided && (
                      <span className="le-flag is-void">
                        Voided{r.reason ? ` · ${r.reason}` : ""}
                      </span>
                    )}
                    {r.pending && !voided && (
                      <span className="le-flag is-pending">Not backed up</span>
                    )}
                  </span>
                  <span className="le-bal mono">
                    {voided ? "—" : `bal ${plain(r.balanceAfter, "auto")}`}
                  </span>
                </>
              );
              return (
                <li key={e.id} className={voided ? "is-void" : undefined}>
                  {voided ? (
                    <div className="le-row">{body}</div>
                  ) : (
                    <button
                      type="button"
                      className="le-row"
                      onClick={() => onVoid(e)}
                      title="Tap to void this entry"
                    >
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function daysAgo(d: Date): string {
  const days = Math.max(0, Math.round((Date.now() - d.getTime()) / 86_400_000));
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
}

function MiniStat({
  label,
  value,
  color,
  divider,
  hint,
}: {
  label: string;
  value: string;
  color?: string;
  divider?: boolean;
  hint?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        padding: divider ? "9px 12px 10px" : "9px 12px 10px 14px",
        borderLeft: divider ? "1px solid var(--line-soft)" : undefined,
      }}
    >
      <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{label}</span>
      <span className="mono" style={{ fontSize: 14, fontWeight: 700, color }}>
        {value}
      </span>
      {hint && <span style={{ fontSize: 10.5, color: "var(--faint)" }}>{hint}</span>}
    </div>
  );
}

/** Ledger-shaped placeholder: header, balance card, actions and a few entry rows. */
function LedgerSkeleton() {
  return (
    <AppShell active="home">
      <header className="bar" style={{ paddingLeft: 4 }}>
        <Link
          href="/"
          className="icon-btn"
          aria-label="Back to borrowers"
          style={{ color: "#fff" }}
        >
          <Icon name="back" size={22} />
        </Link>
        <div className="bar-title" style={{ gap: 6 }}>
          <span className="skeleton skel-ink" style={{ height: 16, width: 150 }} />
          <span className="skeleton skel-ink" style={{ height: 11, width: 190 }} />
        </div>
      </header>
      <main className="vscroll" aria-busy="true" aria-label="Loading the ledger">
        <div className="hero" style={{ height: 44 }} />
        <div
          className="page"
          style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 12px 24px" }}
        >
          <section
            className="card-raised"
            style={{
              marginTop: -36,
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <span className="skeleton" style={{ height: 12, width: 70 }} />
            <span className="skeleton" style={{ height: 34, width: 180 }} />
            <span className="skeleton" style={{ height: 6, width: "100%" }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[0, 1, 2].map((i) => (
                <span key={i} className="skeleton" style={{ height: 30 }} />
              ))}
            </div>
          </section>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <span className="skeleton" style={{ height: 34 }} />
            <span className="skeleton" style={{ height: 34 }} />
          </div>
          <section
            className="card"
            style={{ padding: 14, display: "flex", flexDirection: "column", gap: 16 }}
          >
            <span className="skeleton" style={{ height: 14, width: 160 }} />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span className="skeleton" style={{ height: 26, width: 44 }} />
                <span className="skeleton" style={{ height: 13, flex: 1 }} />
                <span className="skeleton" style={{ height: 14, width: 64 }} />
                <span className="skeleton" style={{ height: 14, width: 56 }} />
              </div>
            ))}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
