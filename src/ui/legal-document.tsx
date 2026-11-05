import Link from "next/link";
import { type ReactNode } from "react";
import {
  LEGAL_DETAILS,
  type LegalBlock,
  type LegalDocument,
  type LegalToken,
  PLACEHOLDER_LABEL,
} from "@/content/legal";
import { BackButton } from "@/ui/back-button";
import { CopyButton } from "@/ui/copy-button";
import { Icon } from "@/ui/icons";

const TOKEN = /\{(\w+)\}/g;

/** Key-point tile colours, in order. */
const TINTS = [
  ["var(--brand-tint)", "var(--on-brand-tint)"],
  ["var(--success-tint)", "var(--on-success-tint)"],
  ["var(--info-tint)", "var(--on-info-tint)"],
  ["var(--danger-tint)", "var(--on-danger-tint)"],
] as const;

function Placeholder({ label }: { label: string }) {
  return <span className="legal-placeholder">[{label}]</span>;
}

/** Replaces {token} with the filled-in value, or a highlighted placeholder while it is still unset. */
function fill(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const token = m[1] as LegalToken;
    out.push(text.slice(last, m.index));
    out.push(
      LEGAL_DETAILS[token] ?? <Placeholder key={m.index} label={PLACEHOLDER_LABEL[token]} />,
    );
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

function Block({ block }: { block: LegalBlock }) {
  if ("p" in block) return <p className="legal-p">{fill(block.p)}</p>;
  return (
    <ul className="legal-ul">
      {block.ul.map((item) => (
        <li key={item}>{fill(item)}</li>
      ))}
    </ul>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

function minutesToRead(doc: LegalDocument): number {
  const words = doc.sections
    .flatMap((s) => s.blocks.flatMap((b) => ("p" in b ? [b.p] : b.ul)))
    .join(" ")
    .split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

/** Terms of Use and Privacy Policy. Readable without a store, and from Welcome or Settings. */
export function LegalDocumentScreen({ doc }: { doc: LegalDocument }) {
  const other =
    doc.kind === "terms"
      ? { href: "/privacy", label: "Read the Privacy Policy" }
      : { href: "/terms", label: "Read the Terms of Use" };

  return (
    <div className="app solo">
      <div className="vscroll" style={{ display: "flex", flexDirection: "column" }}>
        <header className="hero legal-hero">
          <div className="legal-topline">
            <BackButton group={["/terms", "/privacy"]} />
            <span className="legal-kicker">Atrazo · Legal</span>
            {!LEGAL_DETAILS.reviewed && <span className="legal-draft">Draft</span>}
          </div>
          <h1 className="disp legal-title">{doc.title}</h1>
          <p className="legal-sub">{doc.subtitle}</p>
          <p className="legal-meta mono">
            <span>
              Effective{" "}
              {LEGAL_DETAILS.effectiveDate ?? (
                <Placeholder label={PLACEHOLDER_LABEL.effectiveDate} />
              )}
            </span>
            <span aria-hidden="true">·</span>
            <span>{doc.sections.length} sections</span>
            <span aria-hidden="true">·</span>
            <span>{minutesToRead(doc)} min read</span>
          </p>
          <nav className="legal-tabs" aria-label="Legal documents">
            <Link href="/terms" replace aria-current={doc.kind === "terms" ? "page" : undefined}>
              Terms of Use
            </Link>
            <Link
              href="/privacy"
              replace
              aria-current={doc.kind === "privacy" ? "page" : undefined}
            >
              Privacy Policy
            </Link>
          </nav>
        </header>

        <main className="legal-body">
          <section aria-labelledby="points-h">
            <h2 id="points-h" className="legal-label">
              In short
            </h2>
            <ul className="legal-points">
              {doc.points.map((p, i) => {
                const [tint, ink] = TINTS[i % TINTS.length]!;
                return (
                  <li key={p.title} className="legal-point">
                    <span className="legal-point-icon" style={{ background: tint, color: ink }}>
                      <Icon name={p.icon} size={17} />
                    </span>
                    <strong>{p.title}</strong>
                    <span>{fill(p.text)}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <nav className="card legal-toc" aria-labelledby="toc-h">
            <h2 id="toc-h" className="legal-label" style={{ padding: "12px 14px 6px" }}>
              Contents
            </h2>
            <ol>
              {doc.sections.map((s, i) => (
                <li key={s.title}>
                  {/* replace: jumping to a clause must not become a Back step */}
                  <Link href={`#s${i + 1}`} replace>
                    <span className="mono">{pad(i + 1)}</span>
                    {s.title}
                  </Link>
                </li>
              ))}
            </ol>
          </nav>

          <article className="card legal-doc">
            {doc.sections.map((s, i) => (
              <section
                key={s.title}
                id={`s${i + 1}`}
                aria-labelledby={`s${i + 1}-h`}
                className="legal-sec"
              >
                <span className="legal-num mono" aria-hidden="true">
                  {pad(i + 1)}
                </span>
                <div className="legal-sec-body">
                  <h2 id={`s${i + 1}-h`}>{s.title}</h2>
                  {s.blocks.map((b, j) => (
                    <Block key={j} block={b} />
                  ))}
                </div>
              </section>
            ))}
          </article>

          <ContactCard kind={doc.kind} />

          <Link href={other.href} replace className="btn btn-secondary btn-lg btn-block">
            {other.label}
            <Icon name="chevron" size={18} />
          </Link>
        </main>
      </div>
    </div>
  );
}

/** Who to contact about this document, with the two things people actually do: email, or copy. */
function ContactCard({ kind }: { kind: LegalDocument["kind"] }) {
  const email = LEGAL_DETAILS.contactEmail;
  const privacy = kind === "privacy";
  const subject = privacy ? "Atrazo: privacy request" : "Atrazo: question about the Terms of Use";
  return (
    <section className="card legal-contact" aria-labelledby="contact-h">
      <div className="legal-contact-head">
        <span className="legal-point-icon" style={{ background: "var(--ink)", color: "#fff" }}>
          <Icon name="message" size={17} />
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <h2 id="contact-h">
            {privacy ? "Privacy questions or data requests?" : "Questions about these terms?"}
          </h2>
          <span className="legal-contact-who">
            {LEGAL_DETAILS.operator ?? <Placeholder label={PLACEHOLDER_LABEL.operator} />}
            {privacy ? " · Data Protection Officer" : " · operator of Atrazo"}
          </span>
        </div>
      </div>

      {email ? (
        <>
          <div className="legal-contact-actions">
            <a
              className="btn btn-dark"
              href={`mailto:${email}?subject=${encodeURIComponent(subject)}`}
            >
              <Icon name="message" size={16} />
              Email us
            </a>
            <CopyButton value={email} label="Copy address" />
          </div>
          <p className="legal-contact-email mono">{email}</p>
        </>
      ) : (
        <Placeholder label={PLACEHOLDER_LABEL.contactEmail} />
      )}

      {privacy && (
        <p className="legal-contact-note">
          Include your listahan ID from Settings so we can find your listahan. We never ask for your
          recovery code: anyone who does is not us.
        </p>
      )}
    </section>
  );
}
