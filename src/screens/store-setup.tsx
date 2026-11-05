"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type Cents, fromPesos } from "@/core/money";
import { SyncHttpError } from "@/modules/sync/infrastructure/http-sync-api";
import { useApp } from "@/app/providers";
import { guessDeviceName } from "@/ui/device-name";
import { Icon } from "@/ui/icons";
import { SecureContextNotice } from "@/ui/secure-context-notice";

/** Kept on this device until the owner confirms they wrote it down, so leaving mid-setup never loses it. */
export const UNCONFIRMED_CODE_KEY = "setup.unconfirmedCode";

type Step = "name" | "code" | "confirm";
const STEPS: { key: Step; label: string }[] = [
  { key: "name", label: "Listahan" },
  { key: "code", label: "Recovery code" },
  { key: "confirm", label: "Confirm" },
];

const normalizeGroup = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .slice(0, 5);

function explain(e: unknown): string {
  if (e instanceof SyncHttpError) {
    if (e.code === "NETWORK")
      return "Starting a listahan needs the internet once. Check your connection and try again.";
    if (e.code === "RATE_LIMITED")
      return "Too many attempts from this network. Please try again later.";
  }
  return "We couldn't start your listahan. Please try again.";
}

export function StoreSetupScreen() {
  const router = useRouter();
  const { phone, session } = useApp();
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("1,000.00");
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [wroteItDown, setWroteItDown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [typed, setTyped] = useState("");

  // Resume an unfinished setup (the store exists but the code was never confirmed).
  useEffect(() => {
    if (!phone || session === undefined) return;
    void phone.db.device.get(UNCONFIRMED_CODE_KEY).then((row) => {
      if (row) {
        setCode(row.value as string);
        setStep("code");
      } else if (session) {
        router.replace("/");
      }
    });
  }, [phone, session, router]);

  async function createStore(e: React.FormEvent) {
    e.preventDefault();
    if (!phone) return;
    if (!name.trim()) return setNameError("Enter your listahan's name");
    // An empty limit means the default (₱1,000), not ₱0, which would put every client over limit.
    const typed = limit.replace(/[^0-9.]/g, "");
    const pesos = typed ? Number(typed) : 1000;
    setBusy(true);
    setProblem(null);
    try {
      const { code: newCode } = await phone.access.startStore(guessDeviceName());
      await phone.db.device.put({ key: UNCONFIRMED_CODE_KEY, value: newCode });
      await phone.commands.saveSettings({
        name,
        defaultLimit: (Number.isFinite(pesos) ? fromPesos(pesos) : fromPesos(1000)) as Cents,
      });
      setCode(newCode);
      setStep("code");
    } catch (err) {
      setProblem(explain(err));
    } finally {
      setBusy(false);
    }
  }

  const groups = code?.split("-") ?? [];
  const lastGroup = groups.at(-1) ?? "";
  const typedClean = normalizeGroup(typed);
  const matches = typedClean.length === 5 && typedClean === lastGroup;
  const mismatch = typedClean.length === 5 && !matches;

  async function finish() {
    if (!phone || !matches) return;
    await phone.db.device.delete(UNCONFIRMED_CODE_KEY);
    router.replace("/");
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="app solo">
      <header className="hero" style={{ flex: "none", padding: "8px 12px 12px 4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {step === "confirm" ? (
            <button
              type="button"
              className="icon-btn"
              aria-label="Back to the code"
              onClick={() => setStep("code")}
              style={{ color: "#fff" }}
            >
              <Icon name="back" size={22} />
            </button>
          ) : step === "name" ? (
            <Link href="/welcome" className="icon-btn" aria-label="Back" style={{ color: "#fff" }}>
              <Icon name="back" size={22} />
            </Link>
          ) : (
            <span style={{ width: 12 }} />
          )}
          <div className="bar-title">
            <h1>Set up your listahan</h1>
            <span className="bar-sub">
              Step {stepIndex + 1} of {STEPS.length}
            </span>
          </div>
        </div>
        <ol
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 6,
            padding: "10px 0 0 12px",
          }}
        >
          {STEPS.map((s, i) => (
            <li
              key={s.key}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 5,
                fontSize: 11.5,
                fontWeight: 600,
                color: i <= stepIndex ? "#fff" : "#868F9A",
              }}
            >
              <span
                style={{
                  height: 3,
                  borderRadius: 2,
                  background: i <= stepIndex ? "#FFC72C" : "rgba(255,255,255,.18)",
                }}
              />
              {s.label}
            </li>
          ))}
        </ol>
      </header>

      <main
        className="vscroll"
        style={{ display: "flex", flexDirection: "column", gap: 14, padding: "18px 16px 16px" }}
      >
        {step === "name" && <SecureContextNotice />}
        {step === "name" && (
          <form
            id="store-form"
            onSubmit={createStore}
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
            noValidate
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <h2 className="disp" style={{ fontSize: 22 }}>
                Name your listahan
              </h2>
              <p className="muted" style={{ fontSize: 14 }}>
                It appears on statements and reminders. You can change it later.
              </p>
            </div>
            <div className="field">
              <label className="label" htmlFor="store-name">
                Listahan name
              </label>
              <input
                id="store-name"
                className={`input ${nameError ? "input-error" : ""}`}
                value={name}
                autoFocus
                maxLength={60}
                placeholder="e.g. Tindahan ni Aling Rosa, or Listahan ni Renzo"
                aria-invalid={!!nameError}
                aria-describedby={nameError ? "store-name-err" : undefined}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(null);
                }}
              />
              {nameError && (
                <span id="store-name-err" className="help-error">
                  <Icon name="alert" size={14} />
                  {nameError}
                </span>
              )}
            </div>
            <div className="field">
              <label className="label" htmlFor="store-limit">
                Default credit limit <span className="opt">· optional</span>
              </label>
              <div className="input-wrap">
                <span className="pre">₱</span>
                <input
                  id="store-limit"
                  className="input mono"
                  inputMode="decimal"
                  placeholder="1,000.00"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                />
              </div>
              <span className="help">
                New borrowers start with this limit (₱1,000 if left empty). You can set each
                borrower’s own limit.
              </span>
            </div>
            {problem && (
              <div className="banner banner-danger" role="alert">
                <Icon name="alert" size={16} />
                <span>{problem}</span>
              </div>
            )}
          </form>
        )}

        {step === "code" && code && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <h2 className="disp" style={{ fontSize: 22 }}>
                Your recovery code
              </h2>
              <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--text-2)" }}>
                Use it to open your listahan on a new phone. It also unlocks your encrypted backups.
              </p>
            </div>
            <section
              className="card-raised"
              aria-label="Recovery code"
              style={{ overflow: "hidden" }}
            >
              <ol>
                {groups.map((g, i) => (
                  <li
                    key={g + i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      padding: "9px 16px",
                      borderTop: i ? "1px solid var(--line-soft)" : undefined,
                    }}
                  >
                    <span className="mono muted" style={{ width: 14, fontSize: 12 }}>
                      {i + 1}
                    </span>
                    <span
                      className="tape"
                      style={{ fontSize: 28, fontWeight: 600, letterSpacing: "0.18em" }}
                    >
                      {g}
                    </span>
                  </li>
                ))}
              </ol>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  padding: 10,
                  borderTop: "1px solid var(--line-soft)",
                  background: "var(--surface-2)",
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1 }}
                  onClick={() =>
                    void navigator.clipboard?.writeText(code).then(() => setCopied(true))
                  }
                >
                  <Icon name={copied ? "check" : "copy"} size={15} />
                  {copied ? "Copied" : "Copy code"}
                </button>
              </div>
            </section>
            <div className="banner banner-warn" role="note">
              <Icon name="alert" size={16} />
              <span>
                This code is the only way to open your store on another phone.{" "}
                <strong>Atrazo can’t see it or recover it.</strong> Write it down and keep it
                somewhere safe.
              </span>
            </div>
            <label
              className="card"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                minHeight: 56,
                padding: "0 14px",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={wroteItDown}
                onChange={(e) => setWroteItDown(e.target.checked)}
                style={{ width: 22, height: 22, accentColor: "#1C2024" }}
              />
              <span style={{ fontSize: 15, fontWeight: 600 }}>I wrote it down</span>
            </label>
            <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              Tip: write it on the inside cover of your old utang notebook, or keep a photo
              somewhere other than this phone.
            </p>
          </>
        )}

        {step === "confirm" && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <h2 className="disp" style={{ fontSize: 22 }}>
                Type the last group to confirm
              </h2>
              <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--text-2)" }}>
                This checks that you have the code before you start writing utang.
              </p>
            </div>
            <div className="field">
              <label className="label" htmlFor="last-group">
                Group 5 of your code
              </label>
              <input
                id="last-group"
                className={`input tape ${mismatch ? "input-error" : ""}`}
                value={typedClean}
                autoFocus
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={5}
                onChange={(e) => setTyped(e.target.value)}
                aria-invalid={mismatch}
                style={{
                  height: 60,
                  fontSize: 30,
                  letterSpacing: "0.3em",
                  textAlign: "center",
                  borderColor: matches ? "var(--success)" : undefined,
                }}
              />
              {matches && (
                <span className="help" style={{ color: "var(--success)", fontWeight: 700 }}>
                  That matches. Your code is saved.
                </span>
              )}
              {mismatch && (
                <span className="help-error">
                  <Icon name="alert" size={14} />
                  That doesn’t match group 5. Check your paper.
                </span>
              )}
              {!matches && !mismatch && (
                <span className="help">
                  {5 - typedClean.length} more to go. O and 0, I and 1 count as the same.
                </span>
              )}
            </div>
          </>
        )}
      </main>

      {/* The step's action stays pinned to the bottom, so it is always visible however long the step is. */}
      <footer className="action-bar">
        {step === "name" && (
          <button
            type="submit"
            form="store-form"
            className="btn btn-primary btn-lg btn-block"
            disabled={busy || !phone}
          >
            {busy ? (
              <>
                <span className="spin" aria-hidden="true" />
                Creating your listahan…
              </>
            ) : (
              "Continue"
            )}
          </button>
        )}
        {step === "code" && (
          <>
            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              disabled={!wroteItDown}
              onClick={() => setStep("confirm")}
            >
              Continue
            </button>
            {!wroteItDown && <p className="action-hint">Tick “I wrote it down” to continue.</p>}
          </>
        )}
        {step === "confirm" && (
          <>
            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              disabled={!matches}
              onClick={() => void finish()}
            >
              Open my listahan
            </button>
            {!matches && (
              <p className="action-hint">Type the 5 characters of group 5 to continue.</p>
            )}
          </>
        )}
      </footer>
    </div>
  );
}
