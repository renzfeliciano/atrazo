"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { type Cents, formatPeso, fromPesos } from "@/core/money";
import { type Customer, formatPhilippineMobile, sameName } from "@/modules/ledger/domain/customer";
import { type CustomerId } from "@/modules/ledger/domain/ids";
import { useApp } from "@/app/providers";
import { Icon } from "@/ui/icons";
import { usePendingAction } from "@/ui/use-pending-action";
import { BorrowerFormSkeleton } from "@/ui/skeletons";
import { useMinimumDelay } from "@/ui/use-minimum-delay";

type Errors = Partial<
  Record<"name" | "phone" | "creditLimit" | "startingBalance" | "note", string>
>;

const toCents = (text: string): Cents | null => {
  const t = text.replace(/[^0-9.]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? fromPesos(n) : null;
};

/** New borrower (/borrowers/new) and edit borrower (/borrowers/edit?id=…). */
export function BorrowerFormScreen({ mode }: { mode: "new" | "edit" }) {
  const router = useRouter();
  const params = useSearchParams();
  const { phone, toast, sync } = useApp();
  const editId = params.get("id") as CustomerId | null;
  const existing = useLiveQuery(
    async () =>
      mode === "edit" && editId && phone ? ((await phone.db.customers.get(editId)) ?? null) : null,
    [phone, editId, mode],
  );
  const settings = useLiveQuery(() => phone?.queries.settings(), [phone]);
  const shown = useMinimumDelay();
  const all = useLiveQuery(async () => (phone ? phone.db.customers.toArray() : []), [phone]);

  if (!shown || settings === undefined || (mode === "edit" && existing === undefined))
    return <BorrowerFormSkeleton />;
  return (
    <BorrowerForm
      key={existing?.id ?? "new"}
      mode={mode}
      existing={existing ?? null}
      defaultLimit={settings?.defaultLimit}
      others={all ?? []}
      next={params.get("next")}
      initialName={params.get("name") ?? ""}
      focusPhone={params.get("focus") === "phone"}
      onDone={(id, name, created) => {
        sync.notifyWrite();
        toast({ title: created ? "Borrower added" : "Borrower saved", detail: name });
        if (params.get("next") === "entry") router.replace(`/entry?c=${id}`);
        else router.replace(`/borrower?id=${id}`);
      }}
      onHidden={(name) => {
        sync.notifyWrite();
        toast({ title: "Borrower hidden", detail: `${name} · restore from Settings` });
        router.replace("/");
      }}
      phoneReady={!!phone}
      commands={phone?.commands}
    />
  );
}

function BorrowerForm(props: {
  mode: "new" | "edit";
  existing: Customer | null;
  defaultLimit: Cents | undefined;
  others: Customer[];
  next: string | null;
  initialName: string;
  focusPhone: boolean;
  phoneReady: boolean;
  commands: NonNullable<ReturnType<typeof useApp>["phone"]>["commands"] | undefined;
  onDone(id: CustomerId, name: string, created: boolean): void;
  onHidden(name: string): void;
}) {
  const { mode, existing } = props;
  // Cancel returns to where the form was opened from, replacing this page in history.
  const cancelHref = existing
    ? `/borrower?id=${existing.id}`
    : props.next === "entry"
      ? "/entry"
      : "/";
  const [name, setName] = useState(existing?.name ?? props.initialName);
  const [phoneText, setPhoneText] = useState(
    existing?.phone ? formatPhilippineMobile(existing.phone).slice(1) : "",
  );
  const [limit, setLimit] = useState(
    existing?.creditLimit != null ? formatPeso(existing.creditLimit, { symbol: false }) : "",
  );
  const [starting, setStarting] = useState("");
  const [note, setNote] = useState(existing?.note ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const { pending: saving, run } = usePendingAction();
  const hiding = usePendingAction();
  const [confirmHide, setConfirmHide] = useState(false);

  const duplicate = name.trim()
    ? props.others.find((c) => !c.hiddenAt && c.id !== existing?.id && sameName(c.name, name))
    : undefined;
  const ledgerDefault = props.defaultLimit != null ? formatPeso(props.defaultLimit) : "₱1,000.00";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const commands = props.commands;
    if (!commands || saving) return;
    const draft = {
      name,
      phone: phoneText.trim() ? `0${phoneText.replace(/^0/, "")}` : null,
      note: note || null,
      creditLimit: toCents(limit),
    };
    const r = await run(() =>
      mode === "new"
        ? commands.createCustomer({ ...draft, startingBalance: toCents(starting) })
        : commands.updateCustomer(existing!.id, draft),
    );
    if (!r.ok) {
      const next: Errors = {};
      for (const i of r.error.issues) next[i.field as keyof Errors] ??= i.message;
      setErrors(next);
      return;
    }
    props.onDone(r.value.id, r.value.name, mode === "new");
  }

  async function hide() {
    const commands = props.commands;
    if (!commands || !existing || hiding.pending) return;
    const r = await hiding.run(() => commands.setHidden(existing.id, true));
    if (r.ok) props.onHidden(existing.name);
  }

  const err = (field: keyof Errors) =>
    errors[field] ? (
      <span id={`${field}-err`} className="help-error">
        <Icon name="alert" size={14} />
        {errors[field]}
      </span>
    ) : null;

  return (
    <div className="app solo">
      <header className="bar" style={{ paddingLeft: 4 }}>
        <Link
          href={cancelHref}
          replace
          className="icon-btn"
          aria-label="Back (doesn’t save)"
          title="Back (doesn’t save)"
          style={{ color: "#fff" }}
        >
          <Icon name="back" size={22} />
        </Link>
        <div className="bar-title">
          <h1>{mode === "new" ? "New borrower" : "Edit borrower"}</h1>
          <span className="bar-sub">
            {mode === "new" ? "Only a name is needed" : existing?.name}
          </span>
        </div>
      </header>

      <main
        className="vscroll"
        style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px 14px 16px" }}
      >
        <form
          id="borrower-form"
          onSubmit={submit}
          noValidate
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <section
            className="card"
            style={{ display: "flex", flexDirection: "column", gap: 14, padding: 14 }}
          >
            <div className="field">
              <label className="label" htmlFor="c-name">
                Name
              </label>
              <input
                id="c-name"
                className={`input ${errors.name ? "input-error" : ""}`}
                value={name}
                autoFocus={mode === "new"}
                maxLength={80}
                placeholder="e.g. Aling Nena Santos"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "name-err" : undefined}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors((x) => ({ ...x, name: undefined }));
                }}
              />
              {err("name")}
            </div>
            {duplicate && (
              <div className="banner banner-warn" role="status">
                <Icon name="alert" size={16} />
                <span>
                  There’s already a <strong>{duplicate.name}</strong>. Same person?
                </span>
                <Link href={`/borrower?id=${duplicate.id}`} className="banner-act">
                  Open it
                </Link>
              </div>
            )}
            <div className="field">
              <label className="label" htmlFor="c-phone">
                Mobile number <span className="opt">· optional</span>
              </label>
              <div className="input-wrap">
                <span className="pre" style={{ fontSize: 15 }}>
                  +63
                </span>
                <input
                  id="c-phone"
                  className={`input mono ${errors.phone ? "input-error" : ""}`}
                  inputMode="tel"
                  autoFocus={props.focusPhone}
                  autoComplete="off"
                  placeholder="917 123 4567"
                  value={phoneText}
                  onChange={(e) => {
                    setPhoneText(e.target.value);
                    setErrors((x) => ({ ...x, phone: undefined }));
                  }}
                  style={{ paddingLeft: 46 }}
                  aria-invalid={!!errors.phone}
                />
              </div>
              {err("phone") ?? (
                <span className="help">For calls and reminder texts. Stays encrypted.</span>
              )}
            </div>
          </section>

          <section
            className="card"
            style={{ display: "flex", flexDirection: "column", gap: 14, padding: 14 }}
          >
            <div className="field">
              <label className="label" htmlFor="c-limit">
                Credit limit <span className="opt">· optional</span>
              </label>
              <div className="input-wrap">
                <span className="pre">₱</span>
                <input
                  id="c-limit"
                  className={`input mono ${errors.creditLimit ? "input-error" : ""}`}
                  inputMode="decimal"
                  placeholder={ledgerDefault.replace("₱", "")}
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                />
              </div>
              {err("creditLimit") ?? (
                <span className="help">Leave empty to use the default limit, {ledgerDefault}.</span>
              )}
            </div>
            {mode === "new" && (
              <div className="field">
                <label className="label" htmlFor="c-start">
                  Starting balance <span className="opt">· optional</span>
                </label>
                <div className="input-wrap">
                  <span className="pre">₱</span>
                  <input
                    id="c-start"
                    className={`input mono ${errors.startingBalance ? "input-error" : ""}`}
                    inputMode="decimal"
                    placeholder="0.00"
                    value={starting}
                    onChange={(e) => setStarting(e.target.value)}
                  />
                </div>
                {err("startingBalance") ?? (
                  <span className="help">
                    What they already owe from your old notebook. Saved as their first utang.
                  </span>
                )}
              </div>
            )}
            <div className="field">
              <label className="label" htmlFor="c-note">
                Note <span className="opt">· optional</span>
              </label>
              <input
                id="c-note"
                className="input"
                maxLength={200}
                placeholder="e.g. Pays every Friday"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              {err("note")}
            </div>
          </section>
        </form>

        {mode === "edit" && existing && (
          <section
            className="card"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              padding: 14,
              borderColor: "var(--danger-line)",
            }}
          >
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>Hide borrower</h2>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
              Removes them from your lists and totals. Their entries are kept, and you can restore
              them from Settings.
            </p>
            {confirmHide ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-danger-solid btn-sm"
                  onClick={() => void hide()}
                  disabled={hiding.pending}
                >
                  {hiding.pending && <span className="spin" aria-hidden="true" />}
                  {hiding.pending ? "Hiding…" : `Yes, hide ${existing.name}`}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setConfirmHide(false)}
                >
                  Keep
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                style={{ alignSelf: "flex-start" }}
                onClick={() => setConfirmHide(true)}
              >
                Hide borrower
              </button>
            )}
          </section>
        )}
      </main>

      <footer className="action-bar" style={{ flexDirection: "row", gap: 10 }}>
        <Link href={cancelHref} replace className="btn btn-secondary btn-lg" style={{ flex: 1 }}>
          Cancel
        </Link>
        <button
          type="submit"
          form="borrower-form"
          className="btn btn-primary btn-lg"
          disabled={!props.phoneReady || saving}
          style={{ flex: 2 }}
        >
          {saving && <span className="spin" aria-hidden="true" />}
          {saving ? "Saving…" : mode === "new" ? "Save borrower" : "Save changes"}
        </button>
      </footer>
    </div>
  );
}
