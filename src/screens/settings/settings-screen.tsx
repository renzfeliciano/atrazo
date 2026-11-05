"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { APP_VERSION } from "@/core/app-version";
import { type Cents, formatPeso, fromPesos } from "@/core/money";
import { formatLedgerDay, ledgerDay } from "@/core/time";
import { type CustomerId } from "@/modules/ledger/domain/ids";
import { SyncHttpError } from "@/modules/sync/infrastructure/http-sync-api";
import { type PhoneInfo } from "@/modules/vault/application/ledger-access";
import { useApp } from "@/app/providers";
import { DEFAULTS as SYNC_TIMING } from "@/modules/sync/application/sync-coordinator";
import { AppShell } from "@/ui/app-shell";
import { Icon } from "@/ui/icons";
import { ThemeToggle, type ThemePreference, useThemePreference } from "@/ui/theme";
import { ProgressStrip, SAVE_FEEDBACK_MS, useJustSaved } from "@/ui/save-feedback";
import { usePendingAction } from "@/ui/use-pending-action";
import { recordsToCsv } from "./records-csv";
import { useMinimumDelay } from "@/ui/use-minimum-delay";
import { SettingsBodySkeleton } from "@/ui/skeletons";

/** A new recovery code waits here until the owner confirms they wrote it down (survives a reload). */
const NEW_CODE_KEY = "settings.newRecoveryCode";

/**
 * Error text for an action that needs the server. Each action supplies both phrasings (a noun
 * phrase and a verb phrase) so every message reads as a proper sentence.
 */
interface Action {
  /** "Making a new recovery code" → "… needs the internet." */
  readonly doing: string;
  /** "make a new recovery code" → "Couldn’t …" */
  readonly verb: string;
}
const ACTIONS = {
  rotate: { doing: "Making a new recovery code", verb: "make a new recovery code" },
  phones: { doing: "Loading your phones", verb: "load your phones" },
  signOutPhone: { doing: "Signing out a phone", verb: "sign out that phone" },
  signOut: { doing: "Signing out", verb: "sign you out" },
  deleteLedger: { doing: "Deleting the listahan", verb: "delete the listahan" },
} satisfies Record<string, Action>;

function problemText(e: unknown, action: Action): string {
  if (e instanceof SyncHttpError) {
    if (e.code === "NETWORK")
      return `${action.doing} needs the internet. Check your connection and try again.`;
    if (e.code === "RATE_LIMITED")
      return "Too many tries. Please wait a few minutes and try again.";
    // The phone still has the ledger, but the server no longer knows this phone (for example,
    // the browser's cookies were cleared). Retrying can't fix that; opening the ledger again can.
    if (e.code === "UNAUTHENTICATED")
      return `Couldn’t ${action.verb}: this phone’s connection to your backup has ended. Your entries here are safe. Back them up from another phone, or sign out and open the listahan again with your recovery code.`;
  }
  return `Couldn’t ${action.verb}. Please try again.`;
}

const timeFmt = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Manila",
});

export function SettingsScreen() {
  const { phone, session } = useApp();
  const settings = useLiveQuery(() => phone?.queries.settings(), [phone]);
  const shown = useMinimumDelay();
  const ready = !!phone && !!session && !!settings && shown;
  const router = useRouter();
  // No ledger on this device (signed out, or opened from a bookmark): go to Welcome.
  useEffect(() => {
    if (session === null) router.replace("/welcome");
  }, [session, router]);

  return (
    <AppShell active="settings">
      <header className="bar" style={{ paddingLeft: 4 }}>
        <Link href="/" className="icon-btn" aria-label="Back to home" style={{ color: "#fff" }}>
          <Icon name="back" size={22} />
        </Link>
        <div className="bar-title">
          <h1>Settings</h1>
          <span className="bar-sub">Listahan, phones, backup and rules</span>
        </div>
        <ThemeToggle className="bar-theme" />
      </header>
      <main className="vscroll">
        <div className="page set-page" aria-busy={!ready}>
          {ready ? (
            <>
              <LedgerSection name={settings.name} />
              <RecoverySection />
              <PhonesSection />
              <BackupSection />
              <CreditRulesSection
                defaultLimit={settings.defaultLimit}
                overdueAfterDays={settings.overdueAfterDays}
                name={settings.name}
              />
              <AppearanceSection />
              <DataSection ledgerName={settings.name} />
              <LegalSection />
              <AccountSection ledgerName={settings.name} />
              <p className="set-version">
                Atrazo {APP_VERSION} · Your records are encrypted on this phone before backup.
              </p>
            </>
          ) : (
            <SettingsBodySkeleton />
          )}
        </div>
      </main>
    </AppShell>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  const id = `set-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section className="set-section" aria-labelledby={id}>
      <h2 id={id} className="set-label">
        {title}
      </h2>
      {children}
      {note && <p className="set-note">{note}</p>}
    </section>
  );
}

/** A modal confirmation that keeps focus inside and closes on the backdrop or Escape. */
function Dialog({
  title,
  children,
  onClose,
  danger,
}: {
  title: string;
  children: ReactNode;
  onClose(): void;
  /** Destructive confirmation: red accent, danger icon and a "can't be undone" line. */
  danger?: { subtitle: string };
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`dialog set-dialog ${danger ? "is-danger" : ""}`}
        role={danger ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby="set-dialog-h"
        onClick={(e) => e.stopPropagation()}
      >
        {danger ? (
          <header className="dlg-head">
            <span className="dlg-icon" aria-hidden="true">
              <Icon name="trash" size={20} />
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <h2 id="set-dialog-h" className="disp" style={{ fontSize: 18, lineHeight: 1.25 }}>
                {title}
              </h2>
              <span className="dlg-sub">{danger.subtitle}</span>
            </div>
          </header>
        ) : (
          <h2 id="set-dialog-h" className="disp" style={{ fontSize: 19 }}>
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}

type PhoneApi = NonNullable<ReturnType<typeof useApp>["phone"]>;

/** Saves every record as a CSV file (see records-csv.ts). Returns how many rows it holds. */
async function downloadRecords(phone: PhoneApi, ledgerName: string): Promise<number> {
  const { customers, entries } = await phone.queries.records();
  const csv = recordsToCsv(customers, entries);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const slug = ledgerName.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "atrazo";
  a.download = `${slug}-records-${ledgerDay(new Date())}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return csv.trimEnd().split("\r\n").length - 1; // rows, without the header
}

// ── Ledger ─────────────────────────────────────────────────────────────────────

function LedgerSection({ name }: { name: string }) {
  const { phone, sync, toast } = useApp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = usePendingAction();
  const [savedAt, markSaved] = useJustSaved();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!phone || pending) return;
    // The form shows "Saving…" with the progress strip for the full feedback time, then closes on
    // "Saved just now" (React applies both updates together, so nothing flashes in between).
    const r = await run(() => phone.commands.saveSettings({ name: draft }), SAVE_FEEDBACK_MS);
    if (!r.ok) return setError(r.error.issues[0]?.message ?? r.error.message);
    sync.notifyWrite();
    toast({ title: "Listahan name saved", detail: r.value.name });
    markSaved();
    setEditing(false);
  }

  return (
    <Section title="Listahan">
      <div className="card set-ledger" style={{ overflow: "hidden" }} aria-live="polite">
        {editing ? (
          <form onSubmit={save} className="set-ledger-form" noValidate>
            <label className="label" htmlFor="set-ledger-name">
              Listahan name
            </label>
            <input
              id="set-ledger-name"
              className={`input ${error ? "input-error" : ""}`}
              value={draft}
              maxLength={60}
              autoFocus
              readOnly={pending}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              aria-invalid={!!error}
            />
            {error && (
              <span className="help-error">
                <Icon name="alert" size={14} />
                {error}
              </span>
            )}
            <div className="set-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={pending}
                onClick={() => {
                  setDraft(name);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending && <span className="spin" aria-hidden="true" />}
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        ) : (
          <div className="row" style={{ cursor: "default" }}>
            <span
              className={savedAt ? "set-icon" : "logo"}
              aria-hidden="true"
              style={
                savedAt
                  ? {
                      width: 40,
                      height: 40,
                      background: "var(--success-tint)",
                      color: "var(--on-success-tint)",
                    }
                  : { width: 40, height: 40 }
              }
            >
              <Icon name={savedAt ? "check" : "home"} size={20} />
            </span>
            <span className="row-main">
              <span className="row-title" style={{ fontWeight: 700 }}>
                {name}
              </span>
              <span
                className="row-sub"
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                {savedAt ? (
                  <span className="set-saved">Saved just now · {timeFmt.format(savedAt)}</span>
                ) : (
                  <>
                    <Icon name="lock" size={12} />
                    Encrypted · your recovery code is your account
                  </>
                )}
              </span>
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setDraft(name);
                setEditing(true);
              }}
            >
              <Icon name="edit" size={14} />
              Edit
            </button>
          </div>
        )}
        {pending && <ProgressStrip label="Saving the listahan name" />}
      </div>
    </Section>
  );
}

// ── Recovery code ─────────────────────────────────────────────────────────────

function RecoverySection() {
  const { phone, toast } = useApp();
  const pendingCode = useLiveQuery(
    async () => ((await phone?.db.device.get(NEW_CODE_KEY))?.value as string | undefined) ?? null,
    [phone],
  );
  const [confirming, setConfirming] = useState(false);
  const { pending: busy, run } = usePendingAction();
  const [problem, setProblem] = useState<string | null>(null);
  const [wrote, setWrote] = useState(false);

  async function rotate() {
    if (!phone) return;
    setProblem(null);
    await run(async () => {
      try {
        const { code } = await phone.access.rotateCode();
        await phone.db.device.put({ key: NEW_CODE_KEY, value: code });
        setConfirming(false);
        setWrote(false);
      } catch (e) {
        setProblem(problemText(e, ACTIONS.rotate));
      }
    });
  }

  async function done() {
    await phone?.db.device.delete(NEW_CODE_KEY);
    toast({ title: "New recovery code saved", detail: "The old code no longer works" });
  }

  return (
    <Section
      title="Recovery code"
      note="Your code is the only way to open this listahan on a new phone. Atrazo can’t see it or send it to you."
    >
      <ul className="card">
        <li>
          <button type="button" className="row set-row-btn" onClick={() => setConfirming(true)}>
            <span
              className="set-icon"
              style={{ background: "var(--brand-tint)", color: "var(--on-brand-tint)" }}
            >
              <Icon name="key" size={17} />
            </span>
            <span className="row-main">
              <span className="row-title">Make a new recovery code</span>
              <span className="row-sub">
                Lost the paper? The old code stops working; phones already open stay open.
              </span>
            </span>
            <Icon name="chevron" size={16} />
          </button>
        </li>
      </ul>

      {confirming && (
        <Dialog title="Make a new recovery code?" onClose={() => !busy && setConfirming(false)}>
          <p className="set-dialog-p">
            Your current code will stop working right away. You’ll see the new code once, so have
            paper and a pen ready.
          </p>
          {problem && (
            <div className="banner banner-danger" role="alert">
              <Icon name="alert" size={16} />
              <span>{problem}</span>
            </div>
          )}
          <div className="set-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Keep my code
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void rotate()}
              disabled={busy}
            >
              {busy && <span className="spin" aria-hidden="true" />}
              Make new code
            </button>
          </div>
        </Dialog>
      )}

      {pendingCode && (
        <Dialog title="Your new recovery code" onClose={() => undefined}>
          <p className="set-dialog-p">
            Write it on paper now and keep it somewhere other than where you keep your phone.
          </p>
          <div className="set-code mono" aria-label="New recovery code">
            {pendingCode.split("-").map((g, i) => (
              <span key={i}>
                <small>{i + 1}</small>
                {g}
              </span>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ alignSelf: "flex-start" }}
            onClick={() => void navigator.clipboard?.writeText(pendingCode)}
          >
            <Icon name="copy" size={14} />
            Copy
          </button>
          <label className="set-check">
            <input type="checkbox" checked={wrote} onChange={(e) => setWrote(e.target.checked)} />
            <span>I wrote it down</span>
          </label>
          <button
            type="button"
            className="btn btn-dark btn-lg btn-block"
            disabled={!wrote}
            onClick={() => void done()}
          >
            Done
          </button>
        </Dialog>
      )}
    </Section>
  );
}

// ── Phones ────────────────────────────────────────────────────────────────────

type PhonesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; phones: PhoneInfo[] };

function PhonesSection() {
  const { phone, toast } = useApp();
  const [state, setState] = useState<PhonesState>({ status: "loading" });
  const [reload, setReload] = useState(0);
  const [signingOut, setSigningOut] = useState<PhoneInfo | null>(null);
  const { pending: busy, run } = usePendingAction();

  useEffect(() => {
    if (!phone) return;
    let alive = true;
    phone.access
      .listPhones()
      .then((phones) => {
        if (alive) setState({ status: "ready", phones });
      })
      .catch((e: unknown) => {
        if (alive) setState({ status: "error", message: problemText(e, ACTIONS.phones) });
      });
    return () => {
      alive = false;
    };
  }, [phone, reload]);

  async function signOut(p: PhoneInfo) {
    if (!phone) return;
    await run(async () => {
      try {
        await phone.access.signOutPhone(p.id);
        toast({
          title: "Phone signed out",
          detail: `${p.name} · its copy is erased when it reconnects`,
        });
        setSigningOut(null);
        setReload((n) => n + 1);
      } catch (e) {
        toast({
          title: "Couldn’t sign it out",
          detail: problemText(e, ACTIONS.signOutPhone),
          tone: "error",
        });
      }
    });
  }

  const now = new Date();
  const seen = (d: string) => {
    const at = new Date(d);
    return `Last online ${formatLedgerDay(at, now)}, ${timeFmt.format(at)}`;
  };
  const phones =
    state.status === "ready"
      ? [...state.phones].sort(
          (a, b) =>
            Number(b.current) - Number(a.current) || Number(!!a.revokedAt) - Number(!!b.revokedAt),
        )
      : [];

  return (
    <Section
      title="Phones with your listahan"
      note="Lost or replaced a phone? Sign it out here, then make a new recovery code. Its copy of your records is erased the next time it connects."
    >
      <ul className="card" aria-busy={state.status === "loading"}>
        {state.status === "loading" && (
          <li className="row">
            <span className="skeleton" style={{ height: 36, flex: 1 }} />
          </li>
        )}
        {state.status === "error" && (
          <li className="row" style={{ cursor: "default" }}>
            <span
              className="set-icon"
              style={{ background: "var(--surface-3)", color: "var(--muted)" }}
            >
              <Icon name="offline" size={17} />
            </span>
            <span className="row-main">
              <span className="row-sub">{state.message}</span>
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setReload((n) => n + 1)}
            >
              Retry
            </button>
          </li>
        )}
        {phones.map((p) => (
          <li key={p.id} className="row" style={{ cursor: "default" }}>
            <span
              className="set-icon"
              style={
                p.revokedAt
                  ? { background: "var(--surface-3)", color: "var(--muted)" }
                  : { background: "var(--info-tint)", color: "var(--on-info-tint)" }
              }
            >
              <Icon name="phone" size={17} />
            </span>
            <span className="row-main">
              <span
                className="row-title"
                style={{ color: p.revokedAt ? "var(--muted)" : undefined }}
              >
                {p.name}
              </span>
              <span className="row-sub">
                {p.current
                  ? `Active now · opened ${formatLedgerDay(new Date(p.createdAt), now)}`
                  : p.revokedAt
                    ? "Signed out · erased when it reconnects"
                    : seen(p.lastSeenAt)}
              </span>
            </span>
            {p.current ? (
              <span className="tag tag-success">This phone</span>
            ) : p.revokedAt ? (
              <span className="tag">Signed out</span>
            ) : (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => setSigningOut(p)}
              >
                Sign out
              </button>
            )}
          </li>
        ))}
      </ul>

      {signingOut && (
        <Dialog title={`Sign out ${signingOut.name}?`} onClose={() => !busy && setSigningOut(null)}>
          <p className="set-dialog-p">
            It stops backing up right away, and its copy of your records is erased the next time it
            goes online. Anything it hadn’t backed up yet is lost.
          </p>
          <div className="set-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setSigningOut(null)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger-solid"
              onClick={() => void signOut(signingOut)}
              disabled={busy}
            >
              {busy && <span className="spin" aria-hidden="true" />}
              Sign it out
            </button>
          </div>
        </Dialog>
      )}
    </Section>
  );
}

// ── Backup ────────────────────────────────────────────────────────────────────

/** A backup takes milliseconds; hold the progress state this long so people can see it happen. */
const MIN_BACKUP_FEEDBACK_MS = 1200;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Backup runs on its own (src/modules/sync/application/sync-coordinator.ts). This card says so and
 * shows when it last ran and when it runs next; "Back up now" is only a shortcut past the wait.
 */
const AUTO_BACKUP = {
  afterWritingMin: SYNC_TIMING.debounceMs / 60_000,
  everyMin: SYNC_TIMING.periodicMs / 60_000,
};

function BackupSection() {
  const { phone, sync, toast } = useApp();
  const [manual, setManual] = useState(false);
  const status = sync.status;
  const working = manual || status.tone === "working";

  async function backUp() {
    if (!phone || working) return;
    setManual(true);
    const waiting = sync.pending;
    // The real backup and a minimum display time run together; whichever is slower decides.
    await Promise.all([sync.syncNow().catch(() => undefined), wait(MIN_BACKUP_FEEDBACK_MS)]);
    const left = await phone.db.outbox.count();
    setManual(false);
    if (left > 0) {
      toast({
        title: "Couldn’t back up right now",
        detail: `${left} saved on this phone · it retries automatically`,
        tone: "error",
      });
      return;
    }
    toast({
      title: "Backed up",
      detail:
        waiting > 0
          ? `${waiting} ${waiting === 1 ? "change" : "changes"} encrypted and saved`
          : "Everything was already backed up",
    });
  }

  const icon =
    status.tone === "ok"
      ? { bg: "var(--success-tint)", fg: "var(--on-success-tint)", name: "check" as const }
      : status.tone === "attention"
        ? { bg: "var(--brand-tint)", fg: "var(--on-brand-tint)", name: "alert" as const }
        : { bg: "var(--info-tint)", fg: "var(--on-info-tint)", name: "cloud" as const };

  return (
    <Section title="Backup">
      <div className="card set-backup" style={{ overflow: "hidden" }}>
        <div className="row" style={{ cursor: "default" }} aria-live="polite">
          <span className="set-icon" style={{ background: icon.bg, color: icon.fg }}>
            {working ? (
              <span className="spin" aria-hidden="true" />
            ) : (
              <Icon name={icon.name} size={17} />
            )}
          </span>
          <span className="row-main">
            <span className="row-title">{manual ? "Backing up…" : status.title}</span>
            <span className="row-sub">
              {manual ? "Encrypting on this phone and uploading" : status.detail}
            </span>
          </span>
          <span className={`set-auto is-${status.tone === "attention" ? "warn" : "on"}`}>
            <span className="pip" aria-hidden="true" />
            Auto
          </span>
        </div>
        <div className="set-backup-foot">
          <span>
            Backs up on its own: about {AUTO_BACKUP.afterWritingMin} minutes after you stop writing,
            when you open or leave Atrazo, and every {AUTO_BACKUP.everyMin} minutes while it’s open.
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void backUp()}
            disabled={working}
          >
            Back up now
          </button>
        </div>
        {working && <ProgressStrip label="Backing up" />}
      </div>
    </Section>
  );
}

// ── Credit rules ──────────────────────────────────────────────────────────────

function CreditRulesSection(props: {
  defaultLimit: Cents;
  overdueAfterDays: number;
  name: string;
}) {
  const { phone, sync, toast } = useApp();
  const initialLimit = formatPeso(props.defaultLimit, { symbol: false });
  const [limit, setLimit] = useState(initialLimit);
  const [days, setDays] = useState(String(props.overdueAfterDays));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = limit !== initialLimit || days !== String(props.overdueAfterDays);
  const { pending, run } = usePendingAction();
  const [savedAt, markSaved] = useJustSaved();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!phone || pending) return;
    const typed = limit.replace(/[^0-9.]/g, "");
    const pesos = Number(typed);
    if (!typed || !Number.isFinite(pesos)) {
      return setErrors({ defaultLimit: "Enter a limit, e.g. 1,000" });
    }
    const r = await run(
      () =>
        phone.commands.saveSettings({
          name: props.name,
          defaultLimit: fromPesos(pesos),
          overdueAfterDays: Number(days),
        }),
      SAVE_FEEDBACK_MS,
    );
    if (!r.ok) {
      const next: Record<string, string> = {};
      for (const i of r.error.issues) next[i.field] ??= i.message;
      return setErrors(next);
    }
    setErrors({});
    setLimit(formatPeso(r.value.defaultLimit, { symbol: false }));
    sync.notifyWrite();
    toast({ title: "Credit rules saved" });
    markSaved();
  }

  return (
    <Section title="Credit rules">
      <form
        className="card set-form"
        onSubmit={save}
        noValidate
        style={{ position: "relative", overflow: "hidden" }}
        aria-live="polite"
      >
        {savedAt && !dirty && (
          <p className="set-saved-banner">
            <Icon name="check" size={15} />
            Saved just now · {timeFmt.format(savedAt)}
          </p>
        )}
        <div className="field">
          <label className="label" htmlFor="set-limit">
            Default credit limit
          </label>
          <div className="input-wrap">
            <span className="pre">₱</span>
            <input
              id="set-limit"
              className={`input mono ${errors.defaultLimit ? "input-error" : ""}`}
              inputMode="decimal"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              aria-invalid={!!errors.defaultLimit}
            />
          </div>
          {errors.defaultLimit ? (
            <span className="help-error">
              <Icon name="alert" size={14} />
              {errors.defaultLimit}
            </span>
          ) : (
            <span className="help">For new borrowers. Each borrower can have their own limit.</span>
          )}
        </div>
        <div className="field">
          <label className="label" htmlFor="set-days">
            Mark as overdue after
          </label>
          <div className="input-wrap">
            <input
              id="set-days"
              className={`input mono ${errors.overdueAfterDays ? "input-error" : ""}`}
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ""))}
              aria-invalid={!!errors.overdueAfterDays}
              style={{ paddingRight: 56 }}
            />
            <span className="set-suffix">days</span>
          </div>
          {errors.overdueAfterDays ? (
            <span className="help-error">
              <Icon name="alert" size={14} />
              {errors.overdueAfterDays}
            </span>
          ) : (
            <span className="help">Counted from the first unpaid utang.</span>
          )}
        </div>
        {dirty && (
          <div className="set-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setLimit(initialLimit);
                setDays(String(props.overdueAfterDays));
                setErrors({});
              }}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending && <span className="spin" aria-hidden="true" />}
              {pending ? "Saving…" : "Save rules"}
            </button>
          </div>
        )}
        {pending && <ProgressStrip label="Saving credit rules" edge />}
      </form>
    </Section>
  );
}

// ── Appearance ────────────────────────────────────────────────────────────────

const THEMES: { id: ThemePreference; label: string; icon: "sun" | "moon" | "phone" }[] = [
  { id: "light", label: "Light", icon: "sun" },
  { id: "dark", label: "Dark", icon: "moon" },
  { id: "system", label: "System", icon: "phone" },
];

function AppearanceSection() {
  const [pref, setPref] = useThemePreference();
  return (
    <Section title="Appearance" note="System follows your phone’s light or dark setting.">
      <div className="card set-form">
        <span className="label" id="theme-l">
          Theme
        </span>
        <div className="seg" role="group" aria-labelledby="theme-l">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={pref === t.id}
              onClick={() => setPref(t.id)}
              disabled={pref === null}
            >
              <Icon name={t.icon} size={15} />
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────

function DataSection({ ledgerName }: { ledgerName: string }) {
  const { phone, sync, toast } = useApp();
  const hidden = useLiveQuery(
    async () => (phone ? (await phone.db.customers.toArray()).filter((c) => c.hiddenAt) : []),
    [phone],
  );
  const [showHidden, setShowHidden] = useState(false);
  const [restoring, setRestoring] = useState<CustomerId | null>(null);
  const { run } = usePendingAction();

  async function download() {
    if (!phone) return;
    const entries = await downloadRecords(phone, ledgerName);
    toast({
      title: "Records downloaded",
      detail: `${entries.toLocaleString("en-PH")} entries · CSV`,
    });
  }

  async function restore(id: CustomerId, name: string) {
    if (!phone || restoring) return;
    setRestoring(id);
    const r = await run(() => phone.commands.setHidden(id, false)).finally(() =>
      setRestoring(null),
    );
    if (r.ok) {
      sync.notifyWrite();
      toast({ title: "Borrower restored", detail: name });
    }
  }

  return (
    <Section title="Data">
      <ul className="card">
        <li>
          <button type="button" className="row set-row-btn" onClick={() => void download()}>
            <span
              className="set-icon"
              style={{ background: "var(--success-tint)", color: "var(--on-success-tint)" }}
            >
              <Icon name="file" size={17} />
            </span>
            <span className="row-main">
              <span className="row-title">Download all records</span>
              <span className="row-sub">CSV file for Excel or Google Sheets</span>
            </span>
            <Icon name="chevron" size={16} />
          </button>
        </li>
        <li>
          <button
            type="button"
            className="row set-row-btn"
            onClick={() => setShowHidden((v) => !v)}
            aria-expanded={showHidden}
            disabled={!hidden?.length}
          >
            <span
              className="set-icon"
              style={{ background: "var(--surface-3)", color: "var(--text-2)" }}
            >
              <Icon name="userPlus" size={17} />
            </span>
            <span className="row-main">
              <span className="row-title">Hidden borrowers</span>
              <span className="row-sub">
                {hidden?.length
                  ? "Their history is kept and can be restored"
                  : "No hidden borrowers"}
              </span>
            </span>
            {!!hidden?.length && <span className="tag">{hidden.length}</span>}
            {!!hidden?.length && <Icon name={showHidden ? "chevronDown" : "chevron"} size={16} />}
          </button>
        </li>
        {showHidden &&
          hidden?.map((c) => (
            <li key={c.id} className="row set-sub-row" style={{ cursor: "default" }}>
              <span className="row-main">
                <span className="row-title">{c.name}</span>
                <span className="row-sub">Hidden {formatLedgerDay(c.hiddenAt!, new Date())}</span>
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void restore(c.id, c.name)}
                disabled={restoring === c.id}
              >
                {restoring === c.id && <span className="spin" aria-hidden="true" />}
                {restoring === c.id ? "Restoring…" : "Restore"}
              </button>
            </li>
          ))}
      </ul>
    </Section>
  );
}

// ── Legal ─────────────────────────────────────────────────────────────────────

function LegalSection() {
  return (
    <Section title="Legal">
      <ul className="card">
        {[
          { href: "/terms", label: "Terms of Use" },
          { href: "/privacy", label: "Privacy Policy" },
        ].map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="row set-row-btn">
              <span className="row-main">
                <span className="row-title">{l.label}</span>
              </span>
              <Icon name="chevron" size={16} />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ── Sign out / delete ─────────────────────────────────────────────────────────

function AccountSection({ ledgerName }: { ledgerName: string }) {
  const router = useRouter();
  const { phone, sync, toast } = useApp();
  const [dialog, setDialog] = useState<"signout" | "delete" | null>(null);
  const { pending: busy, run } = usePendingAction();
  const [problem, setProblem] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const nameMatches = typed.trim().toLowerCase() === ledgerName.trim().toLowerCase();
  const [downloaded, setDownloaded] = useState(false);
  // Real numbers for the delete confirmation, read only while it is open.
  const impact = useLiveQuery(async () => {
    if (!phone || dialog !== "delete") return undefined;
    const [borrowers, entries, dash] = await Promise.all([
      phone.db.customers.count(),
      phone.db.entries.count(),
      phone.queries.dashboard(),
    ]);
    return { borrowers, entries, owed: dash.totalOwed };
  }, [phone, dialog]);

  async function downloadFirst() {
    if (!phone) return;
    const n = await downloadRecords(phone, ledgerName);
    setDownloaded(true);
    toast({ title: "Records downloaded", detail: `${n.toLocaleString("en-PH")} entries · CSV` });
  }

  function close() {
    if (busy) return;
    setDialog(null);
    setProblem(null);
    setTyped("");
  }

  async function signOut() {
    if (!phone) return;
    setProblem(null);
    await run(async () => {
      try {
        // Back up anything still waiting first, so signing out never loses an entry.
        if (sync.pending > 0) await sync.syncNow();
        if ((await phone.db.outbox.count()) > 0) {
          setProblem("Some entries haven’t backed up yet. Connect to the internet and try again.");
          return;
        }
        await phone.access.signOut().catch((e: unknown) => {
          // Already unknown to the server (session ended): nothing left to sign out there.
          if (!(e instanceof SyncHttpError && e.code === "UNAUTHENTICATED")) throw e;
        });
        await phone.db.wipe();
        router.replace("/welcome");
        toast({
          title: "Signed out",
          detail: "This phone’s copy was erased. Your backup is safe.",
        });
      } catch (e) {
        setProblem(problemText(e, ACTIONS.signOut));
      }
    });
  }

  async function deleteLedger() {
    if (!phone || !nameMatches) return;
    setProblem(null);
    await run(async () => {
      try {
        await phone.access.deleteLedger();
        await phone.db.wipe();
        router.replace("/welcome");
        toast({ title: "Listahan deleted", detail: "Its backups were removed from our servers." });
      } catch (e) {
        setProblem(problemText(e, ACTIONS.deleteLedger));
      }
    });
  }

  return (
    <section className="set-section" aria-label="Sign out and delete">
      <button
        type="button"
        className="btn btn-danger btn-lg btn-block"
        onClick={() => setDialog("signout")}
      >
        Sign out of this phone
      </button>
      <p className="set-note">
        Erases this phone’s copy of your listahan. Your backup stays safe; to open the listahan here
        again you’ll need your recovery code.
      </p>
      <button type="button" className="set-delete" onClick={() => setDialog("delete")}>
        Delete listahan
      </button>

      {dialog === "signout" && (
        <Dialog title="Sign out of this phone?" onClose={close}>
          <p className="set-dialog-p">
            This phone’s copy of <strong>{ledgerName}</strong> is erased. To open it here again
            you’ll need your recovery code.
          </p>
          {sync.pending > 0 && (
            <div className="banner banner-warn" role="status">
              <Icon name="cloud" size={16} />
              <span>
                {sync.pending} {sync.pending === 1 ? "entry is" : "entries are"} waiting to back up.
                They’ll be backed up first.
              </span>
            </div>
          )}
          {problem && (
            <div className="banner banner-danger" role="alert">
              <Icon name="alert" size={16} />
              <span>{problem}</span>
            </div>
          )}
          <div className="set-actions">
            <button type="button" className="btn btn-ghost" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger-solid"
              onClick={() => void signOut()}
              disabled={busy}
            >
              {busy && <span className="spin" aria-hidden="true" />}
              Sign out
            </button>
          </div>
        </Dialog>
      )}

      {dialog === "delete" && (
        <Dialog
          title={`Delete ${ledgerName}?`}
          onClose={close}
          danger={{ subtitle: "Permanent. This can’t be undone." }}
        >
          <section className="impact" aria-label="What gets deleted">
            <h3>What gets deleted</h3>
            <ul>
              <li>
                <span>Borrowers</span>
                <strong className="mono">
                  {impact ? impact.borrowers.toLocaleString("en-PH") : "…"}
                </strong>
              </li>
              <li>
                <span>Entries</span>
                <strong className="mono">
                  {impact ? impact.entries.toLocaleString("en-PH") : "…"}
                </strong>
              </li>
              <li>
                <span>Still owed to you</span>
                <strong className="mono">{impact ? formatPeso(impact.owed) : "…"}</strong>
              </li>
            </ul>
            <p>
              <Icon name="alert" size={14} />
              Every phone is signed out, all backups are erased from our servers, and the recovery
              code stops working.
            </p>
          </section>

          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={() => void downloadFirst()}
            disabled={busy}
          >
            <Icon name="file" size={16} />
            {downloaded ? "Downloaded · download again" : "Download records first (CSV)"}
          </button>

          <div className="field">
            <label className="label" htmlFor="set-delete-name">
              To confirm, type <span className="confirm-pill mono">{ledgerName}</span>
            </label>
            <div className="input-wrap">
              <input
                id="set-delete-name"
                className={`input ${nameMatches ? "input-ok" : ""}`}
                value={typed}
                autoComplete="off"
                spellCheck={false}
                placeholder={ledgerName}
                onChange={(e) => setTyped(e.target.value)}
                aria-describedby="set-delete-help"
              />
              {nameMatches && (
                <span className="confirm-ok" aria-hidden="true">
                  <Icon name="check" size={16} strokeWidth={2.6} />
                </span>
              )}
            </div>
            <span id="set-delete-help" className="help">
              Capital letters don’t matter.
            </span>
          </div>

          {problem && (
            <div className="banner banner-danger" role="alert">
              <Icon name="alert" size={16} />
              <span>{problem}</span>
            </div>
          )}
          <div className="dlg-actions">
            <button type="button" className="btn btn-secondary" onClick={close} disabled={busy}>
              Keep my listahan
            </button>
            <button
              type="button"
              className="btn btn-danger-solid"
              onClick={() => void deleteLedger()}
              disabled={busy || !nameMatches}
            >
              {busy ? (
                <span className="spin" aria-hidden="true" />
              ) : (
                <Icon name="trash" size={16} />
              )}
              {busy ? "Deleting…" : "Delete listahan forever"}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
