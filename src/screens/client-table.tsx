"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type Cents, formatPeso } from "@/core/money";
import { calendarDaysBetween, formatStoreDay } from "@/core/time";
import { type CustomerOverview } from "@/modules/ledger/application/queries";
import { formatPhilippineMobile } from "@/modules/ledger/domain/customer";
import { Icon } from "@/ui/icons";

/**
 * The client list on tablets and desktops: one row per client with what a store owner scans for
 * (who owes most, who is late, who is near the limit), quick + Utang / − Bayad, sortable headers
 * and a totals row. Phones use the stacked list instead.
 */
export type SortLabel =
  "Highest balance" | "Longest unpaid" | "Most recent" | "Name A–Z" | "Most limit used";

const COLUMNS: { label: string; sort?: SortLabel; className?: string }[] = [
  { label: "Borrower", sort: "Name A–Z", className: "ct-client" },
  { label: "Balance", sort: "Highest balance", className: "num ct-balance" },
  { label: "Limit used", sort: "Most limit used", className: "ct-limit" },
  { label: "Days unpaid", sort: "Longest unpaid", className: "num ct-days" },
  { label: "Last activity", sort: "Most recent", className: "ct-last" },
  { label: "Status", className: "ct-status" },
  { label: "Record", className: "ct-actions" },
];

type Tone = "danger" | "warn" | "info" | "ok" | "neutral";
export function statusOf(o: CustomerOverview): { label: string; tone: Tone } {
  const a = o.account;
  if (a.isOverdue) return { label: "Overdue", tone: "danger" };
  if (a.isOverLimit) return { label: "Over limit", tone: "danger" };
  if (a.isPaidAhead) return { label: "Paid ahead", tone: "info" };
  if (a.balance === 0) return { label: "Paid up", tone: "ok" };
  if (a.limitUsedPercent >= 80) return { label: "Near limit", tone: "warn" };
  return { label: "Good standing", tone: "neutral" };
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[\p{L}]/u.test(w))
    .slice(-2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

export function relative(at: Date | null, now: Date): string {
  if (!at) return "No entries yet";
  const d = calendarDaysBetween(at, now);
  return d === 0 ? "Today" : d === 1 ? "Yesterday" : `${d} days ago`;
}

export function ClientTable({
  list,
  now,
  sort,
  onSort,
}: {
  list: readonly CustomerOverview[];
  now: Date;
  sort: string;
  onSort(label: SortLabel): void;
}) {
  const router = useRouter();
  const total = list.reduce((sum, o) => sum + Math.max(0, o.account.balance), 0);
  const late = list.filter((o) => o.account.isOverdue).length;

  return (
    <table className="tbl client-table ct">
      <thead>
        <tr>
          {COLUMNS.map((c) => {
            const active = c.sort === sort;
            return (
              <th
                key={c.label}
                scope="col"
                className={c.className}
                aria-sort={
                  active ? (c.sort === "Name A–Z" ? "ascending" : "descending") : undefined
                }
              >
                {c.sort ? (
                  <button
                    type="button"
                    className={`ct-sort ${active ? "is-active" : ""}`}
                    onClick={() => onSort(c.sort!)}
                    title={`Sort by ${c.sort.toLowerCase()}`}
                  >
                    {c.label}
                    <Icon name={active ? "chevronDown" : "sort"} size={12} strokeWidth={2.4} />
                  </button>
                ) : (
                  <span className={c.label === "Record" ? "sr" : undefined}>{c.label}</span>
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {list.map((o) => {
          const a = o.account;
          const status = statusOf(o);
          const pct = Math.min(100, Math.round(a.limitUsedPercent));
          const meterTone =
            a.limitUsedPercent >= 100 ? "danger" : a.limitUsedPercent >= 80 ? "warn" : "ok";
          const href = `/client?id=${o.customer.id}`;
          return (
            <tr
              key={o.customer.id}
              className="ct-row"
              onClick={(e) => {
                // Whole row opens the ledger; links and buttons inside keep their own action.
                if (!(e.target as HTMLElement).closest("a, button")) router.push(href);
              }}
            >
              <td className="ct-client">
                <span className={`ct-avatar tone-${status.tone}`} aria-hidden="true">
                  {initials(o.customer.name)}
                </span>
                <span className="ct-who">
                  <Link href={href} className="ct-name">
                    {o.customer.name}
                  </Link>
                  <span className="ct-sub">
                    {o.customer.phone ? (
                      <span className="mono">{formatPhilippineMobile(o.customer.phone)}</span>
                    ) : (
                      (o.customer.note ?? "No mobile number")
                    )}
                  </span>
                </span>
              </td>
              <td className="num ct-balance">
                {a.isPaidAhead ? (
                  <span className="ct-ahead mono">{formatPeso(-a.balance as Cents)} ahead</span>
                ) : (
                  <strong className="mono">{formatPeso(a.balance)}</strong>
                )}
              </td>
              <td className="ct-limit">
                <div className="ct-limit-top">
                  <span className="mono">{a.balance > 0 ? `${pct}%` : "0%"}</span>
                  <span className="mono ct-muted">of {formatPeso(a.limit, { whole: true })}</span>
                </div>
                <span className={`ct-meter tone-${meterTone}`} aria-hidden="true">
                  <span style={{ width: `${a.balance > 0 ? pct : 0}%` }} />
                </span>
              </td>
              <td className="num ct-days">
                {a.balance <= 0 ? (
                  <span className="ct-muted">—</span>
                ) : a.isOverdue ? (
                  <span className="ct-pill tone-danger">{a.daysUnpaid} days</span>
                ) : (
                  <span className="mono">{a.daysUnpaid}</span>
                )}
              </td>
              <td className="ct-last">
                <span>{relative(a.lastEntryAt, now)}</span>
                {a.lastEntryAt && calendarDaysBetween(a.lastEntryAt, now) > 1 && (
                  <span className="ct-sub">{formatStoreDay(a.lastEntryAt, now)}</span>
                )}
              </td>
              <td className="ct-status">
                <span className={`ct-chip tone-${status.tone}`}>
                  <span className="ct-dot" aria-hidden="true" />
                  {status.label}
                </span>
              </td>
              <td className="ct-actions">
                <Link
                  href={`/entry?c=${o.customer.id}&kind=utang`}
                  className="ct-act is-utang"
                  aria-label={`Add utang for ${o.customer.name}`}
                  title="Add utang"
                >
                  <Icon name="plus" size={14} strokeWidth={2.6} />
                  <span>Utang</span>
                </Link>
                <Link
                  href={`/entry?c=${o.customer.id}&kind=bayad`}
                  className="ct-act is-bayad"
                  aria-label={`Record bayad from ${o.customer.name}`}
                  title="Record bayad"
                >
                  <Icon name="minus" size={14} strokeWidth={2.6} />
                  <span>Bayad</span>
                </Link>
              </td>
            </tr>
          );
        })}
      </tbody>
      {list.length > 0 && (
        <tfoot>
          <tr>
            <td className="ct-client">
              {list.length} {list.length === 1 ? "borrower" : "borrowers"}
              {late > 0 && <span className="ct-foot-late"> · {late} overdue</span>}
            </td>
            <td className="num ct-balance">
              <strong className="mono">{formatPeso(total as Cents)}</strong>
            </td>
            <td colSpan={5} className="ct-foot-note">
              Owed to you in this list
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

/**
 * The same list on phones: one fixed grid per row (avatar · name and status · amount), so names,
 * chips and amounts line up down the list. Same statuses and colours as the table.
 */
export function ClientRowsPhone({ list, now }: { list: readonly CustomerOverview[]; now: Date }) {
  return (
    <ul className="client-rows cr">
      {list.map((o) => {
        const a = o.account;
        const status = statusOf(o);
        const pct = a.balance > 0 ? Math.min(100, Math.round(a.limitUsedPercent)) : 0;
        const meterTone =
          a.limitUsedPercent >= 100 ? "danger" : a.limitUsedPercent >= 80 ? "warn" : "ok";
        return (
          <li key={o.customer.id}>
            <Link href={`/client?id=${o.customer.id}`} className="cr-row">
              <span className={`ct-avatar tone-${status.tone} cr-avatar`} aria-hidden="true">
                {initials(o.customer.name)}
              </span>
              <span className="cr-name">{o.customer.name}</span>
              <span className={`cr-amount mono ${a.isPaidAhead ? "is-ahead" : ""}`}>
                {a.isPaidAhead ? `${formatPeso(-a.balance as Cents)} ahead` : formatPeso(a.balance)}
              </span>
              <span className="cr-meta">
                <span className={`ct-chip tone-${status.tone}`}>
                  <span className="ct-dot" aria-hidden="true" />
                  {a.isOverdue ? `${a.daysUnpaid} days unpaid` : status.label}
                </span>
                <span className="cr-when">{relative(a.lastEntryAt, now)}</span>
              </span>
              <span className="cr-limit mono">of {formatPeso(a.limit, { whole: true })}</span>
              <span className={`ct-meter tone-${meterTone} cr-meter`} aria-hidden="true">
                <span style={{ width: `${pct}%` }} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
