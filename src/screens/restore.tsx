"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatPeso } from "@/core/money";
import { SyncHttpError } from "@/modules/sync/infrastructure/http-sync-api";
import { VaultError } from "@/modules/vault/infrastructure/web-crypto";
import { useApp } from "@/app/providers";
import { Lapis } from "@/ui/brand";
import { guessDeviceName } from "@/ui/device-name";
import { Icon } from "@/ui/icons";
import { SecureContextNotice } from "@/ui/secure-context-notice";

type Step = "enter" | "opening" | "done";
interface Restored {
  readonly clients: number;
  readonly entries: number;
  readonly total: string;
  readonly store: string;
}

/** Formats as the owner types: uppercase, Crockford-friendly, dashes every 5 characters. */
function formatTyping(raw: string): string {
  const clean = raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, 25);
  return clean.match(/.{1,5}/g)?.join("-") ?? "";
}

function explain(e: unknown): string {
  if (e instanceof SyncHttpError) {
    if (e.code === "UNAUTHENTICATED")
      return "That code didn’t match a listahan. Check each group. O and 0, I and 1 count as the same.";
    if (e.code === "RATE_LIMITED")
      return "Too many tries from this network. Please wait a few minutes and try again.";
    if (e.code === "NETWORK")
      return "Opening a listahan needs the internet. Check your connection and try again.";
  }
  if (e instanceof VaultError)
    return "The code was accepted, but the backup could not be unlocked. Check the code and try again.";
  return "We couldn’t open the listahan. Please try again.";
}

export function RestoreScreen() {
  const router = useRouter();
  const { phone, session } = useApp();
  const [step, setStep] = useState<Step>("enter");
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [progress, setProgress] = useState<"checking" | "downloading">("checking");
  const [restored, setRestored] = useState<Restored | null>(null);

  // A device that already has a store open goes straight to it.
  useEffect(() => {
    if (session && step === "enter") router.replace("/");
  }, [session, step, router]);

  const typedLength = code.replace(/-/g, "").length;

  async function open(e: React.FormEvent) {
    e.preventDefault();
    if (!phone) return;
    setProblem(null);
    if (typedLength !== 25)
      return setProblem("A recovery code has 25 letters and numbers in 5 groups.");
    setStep("opening");
    setProgress("checking");
    try {
      const r = await phone.access.openStore(code, deviceName.trim() || guessDeviceName());
      if (!r.ok) {
        setStep("enter");
        return setProblem(r.error.issues[0]?.message ?? r.error.message);
      }
      setProgress("downloading");
      const pulled = await (await phone.engine()).pullAll();
      const [dash, settings] = await Promise.all([
        phone.queries.dashboard(),
        phone.queries.settings(),
      ]);
      setRestored({
        clients: dash.customers.length,
        entries: pulled.applied,
        total: formatPeso(dash.totalOwed),
        store: settings.name,
      });
      setStep("done");
    } catch (err) {
      setStep("enter");
      setProblem(explain(err));
    }
  }

  return (
    <div className="app solo">
      <header className="bar" style={{ paddingLeft: 4 }}>
        {step === "enter" ? (
          <Link href="/welcome" className="icon-btn" aria-label="Back" style={{ color: "#fff" }}>
            <Icon name="back" size={22} />
          </Link>
        ) : (
          <span style={{ width: 12 }} />
        )}
        <div className="bar-title">
          <h1>Open your listahan</h1>
          <span className="bar-sub">With the recovery code you wrote down</span>
        </div>
      </header>

      {step === "enter" && (
        <>
          <main
            className="vscroll"
            style={{ display: "flex", flexDirection: "column", gap: 14, padding: "18px 16px 16px" }}
          >
            <SecureContextNotice />
            <form
              id="restore-form"
              onSubmit={open}
              noValidate
              style={{ display: "flex", flexDirection: "column", gap: 16 }}
            >
              <div className="field">
                <label className="label" htmlFor="code">
                  Recovery code
                </label>
                <input
                  id="code"
                  className={`input tape ${problem ? "input-error" : ""}`}
                  value={code}
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  inputMode="text"
                  placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
                  onChange={(e) => {
                    setCode(formatTyping(e.target.value));
                    setProblem(null);
                  }}
                  aria-invalid={!!problem}
                  aria-describedby="code-help"
                  style={{ height: 56, fontSize: 18, letterSpacing: "0.08em", textAlign: "center" }}
                />
                <span id="code-help" className="help">
                  {typedLength}/25 · spaces and dashes don’t matter
                </span>
              </div>
              <div className="field">
                <label className="label" htmlFor="device">
                  Name this device
                </label>
                <input
                  id="device"
                  className="input"
                  maxLength={60}
                  placeholder={guessDeviceName()}
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                />
                <span className="help">
                  Shown in Settings → Phones, so you can sign it out later.
                </span>
              </div>
              {problem && (
                <div className="banner banner-danger" role="alert">
                  <Icon name="alert" size={16} />
                  <span>{problem}</span>
                </div>
              )}
              <p
                style={{
                  display: "flex",
                  gap: 8,
                  fontSize: 13,
                  lineHeight: 1.45,
                  color: "var(--text-2)",
                }}
              >
                <span style={{ color: "var(--success)", flex: "none", marginTop: 1 }}>
                  <Icon name="lock" size={16} />
                </span>
                <span>
                  Your code never leaves this device. It unlocks your encrypted backup here.
                </span>
              </p>
            </form>
          </main>
          <footer className="action-bar">
            <button
              type="submit"
              form="restore-form"
              className="btn btn-primary btn-lg btn-block"
              disabled={!phone}
            >
              Open my listahan
            </button>
            {typedLength < 25 && (
              <p className="action-hint">{25 - typedLength} more characters to go.</p>
            )}
          </footer>
        </>
      )}

      {step === "opening" && (
        <main
          className="vscroll"
          style={{ display: "flex", flexDirection: "column", gap: 14, padding: "24px 16px" }}
          aria-busy="true"
        >
          <section
            className="card"
            style={{ display: "flex", flexDirection: "column" }}
            aria-live="polite"
          >
            <ProgressRow done label="Checking the code" />
            <ProgressRow
              done={progress === "downloading"}
              active={progress === "checking"}
              label="Unlocking your records"
            />
            <ProgressRow
              active={progress === "downloading"}
              label="Downloading and decrypting entries"
            />
          </section>
          <p className="muted" style={{ fontSize: 13, textAlign: "center" }}>
            Keep the app open. This takes a few seconds.
          </p>
        </main>
      )}

      {step === "done" && restored && (
        <>
          <main
            className="vscroll"
            style={{ display: "flex", flexDirection: "column", gap: 14, padding: "16px" }}
          >
            <section
              className="card"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                padding: "14px 16px 16px",
                textAlign: "center",
              }}
            >
              <Lapis pose="cheer" size={118} />
              <h2 className="disp" style={{ fontSize: 22 }}>
                Andito pa lahat.
              </h2>
              <p className="muted" style={{ fontSize: 14 }}>
                {restored.store} is open on this device.
              </p>
            </section>
            <ul className="card" style={{ overflow: "hidden" }}>
              {[
                ["Listahan unlocked", ""],
                ["Borrowers", String(restored.clients)],
                ["Entries downloaded", restored.entries.toLocaleString("en-PH")],
                ["Total owed to you", restored.total],
              ].map(([label, value], i) => (
                <li
                  key={label}
                  className="row"
                  style={{ minHeight: 48, borderTop: i ? "1px solid var(--line-soft)" : 0 }}
                >
                  <span style={{ color: "var(--success)", display: "flex" }}>
                    <Icon name="check" size={18} strokeWidth={2.6} />
                  </span>
                  <span className="row-main">
                    <span style={{ fontSize: 14.5 }}>{label}</span>
                  </span>
                  <span className="mono" style={{ fontWeight: 700 }}>
                    {value}
                  </span>
                </li>
              ))}
            </ul>
          </main>
          <footer className="action-bar">
            <Link href="/" className="btn btn-dark btn-lg btn-block">
              Open my listahan
            </Link>
          </footer>
        </>
      )}
    </div>
  );
}

function ProgressRow({ label, done, active }: { label: string; done?: boolean; active?: boolean }) {
  return (
    <div className="row" style={{ minHeight: 52 }}>
      <span
        style={{
          width: 20,
          display: "flex",
          justifyContent: "center",
          color: done ? "var(--success)" : "var(--muted)",
        }}
      >
        {done ? (
          <Icon name="check" size={18} strokeWidth={2.6} />
        ) : active ? (
          <span className="spin" aria-hidden="true" />
        ) : (
          <span
            style={{ width: 8, height: 8, borderRadius: 4, background: "var(--line-strong)" }}
          />
        )}
      </span>
      <span className="row-main">
        <span
          style={{
            fontSize: 14.5,
            fontWeight: active ? 700 : 500,
            color: done || active ? "var(--text)" : "var(--muted)",
          }}
        >
          {label}
        </span>
      </span>
    </div>
  );
}
