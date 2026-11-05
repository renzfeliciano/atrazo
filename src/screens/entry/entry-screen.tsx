"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { type Cents, formatPeso } from "@/core/money";
import { formatStoreDay, storeDay } from "@/core/time";
import { type CustomerId } from "@/modules/ledger/domain/ids";
import { useApp } from "@/app/providers";
import { Icon } from "@/ui/icons";
import { usePendingAction } from "@/ui/use-pending-action";
import {
  amountOf,
  type CalcKey,
  displayExpression,
  hasOperator,
  keyFromKeyboard,
  press,
} from "./calculator";
import { DatePickerDialog } from "@/ui/date-picker";
import { EntrySkeleton } from "@/ui/skeletons";
import { useMinimumDelay } from "@/ui/use-minimum-delay";

const KEYS: { k: CalcKey; cls?: string; label?: string; aria?: string; wide?: boolean }[] = [
  { k: "C", cls: "key-fn", aria: "Clear" },
  { k: "⌫", cls: "key-fn", aria: "Backspace" },
  { k: "00", cls: "key-fn" },
  { k: "÷", cls: "key-op", aria: "Divide" },
  { k: "7" },
  { k: "8" },
  { k: "9" },
  { k: "×", cls: "key-op", aria: "Times" },
  { k: "4" },
  { k: "5" },
  { k: "6" },
  { k: "-", cls: "key-op", label: "−", aria: "Minus" },
  { k: "1" },
  { k: "2" },
  { k: "3" },
  { k: "+", cls: "key-op", aria: "Plus" },
  { k: "0", wide: true },
  { k: ".", aria: "Decimal point" },
  { k: "=", cls: "key-eq", aria: "Equals" },
];

const peso = (c: number, sign: "auto" | "always" = "auto") => formatPeso(c as Cents, { sign });

/** Noon in Manila on the chosen day, or "now" when the day is today. */
function occurredAtFor(day: string): Date {
  return day === storeDay(new Date()) ? new Date() : new Date(`${day}T04:00:00Z`);
}

export function EntryScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { phone, toast, sync } = useApp();
  const [kind, setKind] = useState<"utang" | "bayad">(
    params.get("kind") === "bayad" ? "bayad" : "utang",
  );
  const [customerId, setCustomerId] = useState<CustomerId | null>(
    (params.get("c") as CustomerId | null) ?? null,
  );
  const [picking, setPicking] = useState(!params.get("c"));
  const [search, setSearch] = useState("");
  const [expr, setExpr] = useState("");
  const [note, setNote] = useState("");
  const [day, setDay] = useState(() => storeDay(new Date()));
  const [pickingDate, setPickingDate] = useState(false);
  const backdated = day !== storeDay(new Date());
  const dayLabel = backdated ? formatStoreDay(new Date(`${day}T04:00:00Z`), new Date()) : "Today";
  const { pending: saving, run } = usePendingAction();
  const [error, setError] = useState<string | null>(null);

  const dash = useLiveQuery(() => phone?.queries.dashboard(), [phone]);
  const minimumShown = useMinimumDelay();
  const customers = useMemo(
    () =>
      [...(dash?.customers ?? [])].sort(
        (a, b) => (b.account.lastEntryAt?.getTime() ?? 0) - (a.account.lastEntryAt?.getTime() ?? 0),
      ),
    [dash],
  );
  const selected = customers.find((o) => o.customer.id === customerId);

  const amount = amountOf(expr);
  const balance = selected?.account.balance ?? 0;
  const after = balance + (kind === "utang" ? amount : -amount);
  const limit = selected?.account.limit ?? 0;
  const overBy = after - limit;
  const pct = limit > 0 ? Math.max(0, Math.min(100, Math.round((after / limit) * 100))) : 0;
  const canSave = !!selected && amount > 0 && !saving;

  // Close goes to a fixed place and replaces this page in history, so it can never bounce back
  // and forth with the client form ("Add a new client" → Cancel → New entry → Close → …).
  const from = params.get("c");
  const close = () => router.replace(from ? `/client?id=${from}` : "/");

  async function save() {
    if (!phone || !selected || amount <= 0 || saving) return;
    setError(null);
    const r = await run(() =>
      phone.commands.recordEntry({
        customerId: selected.customer.id,
        kind,
        amount,
        note: note || null,
        occurredAt: occurredAtFor(day),
      }),
    );
    if (!r.ok) {
      setError(r.error.issues[0]?.message ?? r.error.message);
      return;
    }
    sync.notifyWrite();
    const entryId = r.value.entry.id;
    toast({
      title: `${kind === "utang" ? "Utang" : "Bayad"} saved · ${selected.customer.name}`,
      detail: `${peso(r.value.entry.amount, "always")} · balance ${peso(r.value.account.balance)}`,
      tone: kind,
      action: {
        label: "Undo",
        onPress: () =>
          void phone.commands.undoEntry(entryId).then((u) => {
            if (u.ok) {
              sync.notifyWrite();
              toast({
                title: u.value === "removed" ? "Entry removed" : "Entry voided",
                detail: selected.customer.name,
              });
            }
          }),
      },
    });
    router.replace(`/client?id=${selected.customer.id}`);
  }

  // Physical keyboard: digits and operators type, Enter saves, Escape closes.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    // The date picker handles its own keys (arrows, Enter, Escape) while it is open.
    if (pickingDate) return;
    if (e.key === "Escape") return picking ? setPicking(false) : close();
    if (picking) return;
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
      return;
    }
    const k = keyFromKeyboard(e);
    if (k) {
      e.preventDefault();
      setExpr((x) => press(x, k));
    }
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const shown = customers.filter(
    (o) => !search.trim() || o.customer.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  if (!dash || !minimumShown) return <EntrySkeleton />;

  return (
    <div className="app solo">
      <header className="bar" style={{ paddingLeft: 4 }}>
        <button
          type="button"
          className="icon-btn"
          aria-label="Back (doesn’t save)"
          title="Back (doesn’t save)"
          onClick={close}
          style={{ color: "#fff" }}
        >
          <Icon name="back" size={22} />
        </button>
        <div className="bar-title">
          <h1>New entry</h1>
          <span className="bar-sub">Saves on this device, then backs up</span>
        </div>
        {/* Entry date: today by default; pick an earlier day to copy in older notebook entries. */}
        <button
          type="button"
          className={`btn btn-sm entry-date ${backdated ? "is-backdated" : "btn-ink"}`}
          aria-label={`Date of this entry: ${dayLabel}. Change the date`}
          title="Change the date of this entry"
          aria-haspopup="dialog"
          onClick={() => setPickingDate(true)}
        >
          <Icon name="calendar" size={15} />
          {dayLabel}
          <Icon name="chevronDown" size={13} strokeWidth={2.4} />
        </button>
        {pickingDate && (
          <DatePickerDialog
            value={day}
            max={storeDay(new Date())}
            onPick={(d) => {
              setDay(d);
              setPickingDate(false);
            }}
            onClose={() => setPickingDate(false)}
          />
        )}
      </header>

      {picking ? (
        <main
          className="vscroll"
          style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 12px 16px" }}
        >
          <h2 className="section-label" style={{ paddingTop: 4 }}>
            Who is this for?
          </h2>
          <div className="input-wrap">
            <span
              style={{ position: "absolute", left: 12, color: "var(--muted)", display: "flex" }}
            >
              <Icon name="search" size={18} />
            </span>
            <label htmlFor="pick-search" className="sr">
              Search clients
            </label>
            <input
              id="pick-search"
              className="input"
              type="search"
              autoFocus
              placeholder="Search clients"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 38 }}
            />
          </div>
          <ul className="card" style={{ overflow: "hidden" }}>
            {shown.map((o) => (
              <li key={o.customer.id}>
                <button
                  type="button"
                  className="row"
                  style={{
                    width: "100%",
                    border: 0,
                    background: "transparent",
                    font: "inherit",
                    textAlign: "left",
                    cursor: "pointer",
                    borderTop: "1px solid var(--line-soft)",
                  }}
                  onClick={() => {
                    setCustomerId(o.customer.id);
                    setPicking(false);
                  }}
                >
                  <span className="row-main">
                    <span className="row-title">{o.customer.name}</span>
                    <span className="row-sub">
                      {o.account.isOverLimit
                        ? "Over limit"
                        : `Limit ${formatPeso(o.account.limit, { whole: true })}`}
                    </span>
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontWeight: 700,
                      color: o.account.isPaidAhead ? "var(--info)" : "var(--text)",
                    }}
                  >
                    {peso(o.account.balance)}
                  </span>
                </button>
              </li>
            ))}
            {shown.length === 0 && (
              <li style={{ padding: "16px 14px", fontSize: 14 }}>
                {customers.length ? `No client matches “${search}”.` : "No clients yet."}
              </li>
            )}
          </ul>
          <Link
            href={`/clients/new?next=entry${search ? `&name=${encodeURIComponent(search)}` : ""}`}
            className="btn btn-secondary btn-block"
          >
            <Icon name="userPlus" size={18} />
            {search ? `Add “${search}” as a new client` : "Add a new client"}
          </Link>
        </main>
      ) : (
        <main
          className="vscroll"
          style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 12px 12px" }}
        >
          <div className="seg seg-entry" role="group" aria-label="Entry type">
            <button
              type="button"
              className="is-utang"
              aria-pressed={kind === "utang"}
              onClick={() => setKind("utang")}
            >
              <Icon name="plus" size={16} strokeWidth={2.6} />
              Utang
            </button>
            <button
              type="button"
              className="is-bayad"
              aria-pressed={kind === "bayad"}
              onClick={() => setKind("bayad")}
            >
              <Icon name="minus" size={16} strokeWidth={2.6} />
              Bayad
            </button>
          </div>

          <button
            type="button"
            className="card"
            onClick={() => setPicking(true)}
            aria-label={`Client: ${selected?.customer.name ?? "none"}. Tap to change`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              height: 58,
              padding: "0 12px 0 14px",
              font: "inherit",
              color: "var(--text)",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <span
              style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Client</span>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {selected?.customer.name ?? "Choose a client"}
              </span>
            </span>
            {selected && (
              <span
                style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}
              >
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Balance</span>
                <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>
                  {peso(balance)}
                </span>
              </span>
            )}
            <span style={{ color: "var(--muted)", display: "flex" }}>
              <Icon name="chevronDown" size={18} />
            </span>
          </button>

          <section
            className="card"
            aria-live="polite"
            aria-label="Amount and new balance"
            style={{ padding: "10px 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                minHeight: 20,
              }}
            >
              <span className={`tag ${kind === "utang" ? "tag-warn" : "tag-info"}`}>
                {kind === "utang" ? "Utang · adds to balance" : "Bayad · lowers balance"}
              </span>
              <span
                className="tape muted"
                style={{
                  fontSize: 14,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {hasOperator(expr) ? displayExpression(expr) : " "}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "flex-end",
                gap: 6,
                color: !amount ? "var(--faint)" : kind === "utang" ? "var(--text)" : "var(--info)",
              }}
            >
              <span className="disp" style={{ fontSize: 22, opacity: 0.7 }}>
                {amount ? (kind === "utang" ? "+" : "−") : ""}₱
              </span>
              <span className="disp mono" style={{ fontSize: 42, lineHeight: 1.05 }}>
                {formatPeso(amount, { symbol: false, sign: "never" })}
              </span>
            </div>
            {selected && (
              <>
                <div
                  aria-hidden="true"
                  style={{ borderTop: "1px dashed var(--line-strong)", margin: "2px 0" }}
                />
                <div
                  className="tape"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13.5,
                    color: "var(--muted)",
                  }}
                >
                  <span>Balance now</span>
                  <span>{peso(balance)}</span>
                </div>
                <div
                  className="tape"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 15,
                    fontWeight: 600,
                  }}
                >
                  <span>After saving</span>
                  <span>{peso(after)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
                  <span
                    className={`meter ${overBy > 0 ? "is-danger" : ""}`}
                    aria-hidden="true"
                    style={{ flex: 1 }}
                  >
                    <span style={{ width: `${pct}%` }} />
                  </span>
                  {overBy > 0 ? (
                    <span className="tag tag-danger">
                      <span className="pip" />
                      {peso(overBy)} over limit
                    </span>
                  ) : (
                    <span className="mono muted" style={{ fontSize: 12.5 }}>
                      {peso(Math.max(0, limit - after))} left of{" "}
                      {formatPeso(limit as Cents, { whole: true })}
                    </span>
                  )}
                </div>
              </>
            )}
          </section>

          <div className="input-wrap">
            <span
              style={{ position: "absolute", left: 12, color: "var(--muted)", display: "flex" }}
            >
              <Icon name="edit" size={17} />
            </span>
            <label htmlFor="entry-note" className="sr">
              Note
            </label>
            <input
              id="entry-note"
              className="input"
              maxLength={120}
              placeholder="Note: what did they get? (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ height: 44, paddingLeft: 38, fontSize: 15 }}
            />
          </div>

          {error && (
            <div className="banner banner-danger" role="alert">
              <Icon name="alert" size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="pad" role="group" aria-label="Calculator">
            {KEYS.map((key) => (
              <button
                key={key.k}
                type="button"
                className={`key ${key.cls ?? ""} ${key.wide ? "key-wide" : ""}`}
                aria-label={key.aria ?? key.k}
                onClick={() => setExpr((x) => press(x, key.k))}
              >
                {key.k === "⌫" ? <Icon name="backspace" size={22} /> : (key.label ?? key.k)}
              </button>
            ))}
          </div>
        </main>
      )}

      {!picking && (
        <footer className="action-bar">
          <button
            type="button"
            className={`btn btn-lg btn-block ${kind === "utang" ? "btn-primary" : "btn-info"}`}
            disabled={!canSave}
            onClick={() => void save()}
          >
            {saving ? <span className="spin" aria-hidden="true" /> : null}
            {saving
              ? `Saving ${kind}…`
              : amount > 0
                ? `Save ${kind} · ${peso(amount)}`
                : "Enter an amount"}
          </button>
          {!selected && <p className="action-hint">Choose a client to save this entry.</p>}
        </footer>
      )}
    </div>
  );
}
