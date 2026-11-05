"use client";

import Link from "next/link";
import { AtrazoMark, Lapis } from "@/ui/brand";
import { Icon } from "@/ui/icons";
import { ThemeToggle } from "@/ui/theme";

// Oldest first; running balances add up (it opened at ₱1,200.00). The sample card shows as many of
// the newest rows as the screen has room for, so spare height becomes ledger, not empty space.
const SAMPLE = [
  { date: "Sep 2", what: "Kape, asukal", amount: "+250.00", balance: "1,450.00", bayad: false },
  { date: "Sep 9", what: "Bayad", amount: "−700.00", balance: "750.00", bayad: true },
  { date: "Sep 16", what: "Bigas, 10 kilo", amount: "+520.00", balance: "1,270.00", bayad: false },
  { date: "Sep 22", what: "Bayad", amount: "−120.00", balance: "1,150.00", bayad: true },
  { date: "Sep 28", what: "Load", amount: "+100.00", balance: "1,250.00", bayad: false },
  { date: "Oct 4", what: "Bigas, 25 kilo", amount: "+1,450.00", balance: "2,700.00", bayad: false },
  { date: "Oct 10", what: "Bayad", amount: "−1,000.00", balance: "1,700.00", bayad: true },
  { date: "Oct 15", what: "Sardinas, kape", amount: "+180.00", balance: "1,880.00", bayad: false },
  { date: "Oct 21", what: "Gatas, asukal", amount: "+420.00", balance: "2,300.00", bayad: false },
  { date: "Oct 28", what: "Bayad", amount: "−500.00", balance: "1,800.00", bayad: true },
  { date: "Nov 3", what: "Bigas, mantika", amount: "+350.00", balance: "2,150.00", bayad: false },
  { date: "Nov 5", what: "Load", amount: "+150.00", balance: "2,300.00", bayad: false },
];

function Cols() {
  return (
    <colgroup>
      <col style={{ width: 68 }} />
      <col />
      <col style={{ width: 90 }} />
      <col style={{ width: 84 }} />
    </colgroup>
  );
}

/** First screen on a phone with no store: start one, or open an existing one with its recovery code. */
export function WelcomeScreen() {
  return (
    <div className="app solo">
      <div className="vscroll welcome-scroll">
        <header className="hero welcome-hero">
          <div className="welcome-brand">
            <span className="logo" aria-hidden="true">
              <AtrazoMark size={28} />
            </span>
            <span className="disp" style={{ fontSize: 20, fontWeight: 800 }}>
              Atrazo
            </span>
            <ThemeToggle className="welcome-theme" />
          </div>

          <div className="welcome-promise">
            <div>
              <p className="welcome-quote">“Isulat mo lang, ako na sa kwenta.”</p>
              <h1 className="disp welcome-title">Write the utang. Atrazo adds it up.</h1>
              <p className="welcome-sub">
                Every line updates the client’s balance and your store total.
              </p>
            </div>
          </div>
          <div className="welcome-lapis">
            <Lapis pose="hero" size={140} onDark />
          </div>
        </header>

        <main className="welcome-sheet">
          <div className="welcome-cta">
            <Link href="/start" className="btn btn-primary btn-lg btn-block">
              Start my store
              <Icon name="chevron" size={18} strokeWidth={2.6} />
            </Link>
            <Link href="/restore" className="btn btn-secondary btn-lg btn-block">
              <Icon name="key" size={18} />I have a recovery code
            </Link>
            <p className="welcome-legal">
              Free, no sign-up. By continuing you agree to the <Link href="/terms">Terms</Link> and{" "}
              <Link href="/privacy">Privacy Policy</Link>.
            </p>
          </div>

          <figure className="card welcome-sample" aria-label="Example client ledger (demo data)">
            <div className="welcome-sample-head">
              <strong style={{ fontSize: 14 }}>Kuya Travis Renz</strong>
              <span className="tag tag-outline">Demo data</span>
            </div>
            <table className="tbl welcome-cols" aria-hidden="true">
              <Cols />
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Details</th>
                  <th className="num">Amount</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
            </table>
            <div className="welcome-rows">
              <table className="tbl" style={{ fontSize: 13 }}>
                <Cols />
                <caption className="sr">Kuya Travis Renz’s entries, oldest first</caption>
                <tbody>
                  {SAMPLE.map((r) => (
                    <tr key={r.date + r.what}>
                      <td className="muted">{r.date}</td>
                      <td>{r.what}</td>
                      <td
                        className="num mono"
                        style={{ fontWeight: 700, color: r.bayad ? "var(--info)" : "var(--text)" }}
                      >
                        {r.amount}
                      </td>
                      <td className="num mono muted">{r.balance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="welcome-sample-total">
              <strong style={{ fontSize: 13 }}>Owes you now</strong>
              <span className="disp mono" style={{ fontSize: 19 }}>
                ₱2,300.00
              </span>
            </div>
            <div className="welcome-sample-foot">
              <span>
                <span className="live" aria-hidden="true" />
                Saved offline on this phone
              </span>
              <span>
                <Icon name="lock" size={13} />
                Encrypted backup
              </span>
            </div>
          </figure>
        </main>
      </div>
    </div>
  );
}
