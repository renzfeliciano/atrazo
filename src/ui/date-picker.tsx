"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/ui/icons";

/**
 * Atrazo's date picker (bottom sheet on phones, dialog on larger screens). Works on store calendar
 * days ("2026-11-05", Manila), never on device time zones. Future days can't be picked.
 *
 * Keyboard: arrows move by day/week, PageUp/PageDown by month, Home/End to week start/end,
 * Enter picks, Escape closes.
 */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthFmt = new Intl.DateTimeFormat("en-PH", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const longFmt = new Intl.DateTimeFormat("en-PH", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const fullFmt = new Intl.DateTimeFormat("en-PH", { dateStyle: "full", timeZone: "UTC" });

const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const toDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => toDay(new Date(toDate(day).getTime() + n * 86_400_000));
const monthOf = (day: string) => day.slice(0, 7);
function addMonths(day: string, n: number): string {
  const d = toDate(day);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return toDay(target);
}

export function formatPickedDay(day: string) {
  return longFmt.format(toDate(day));
}

export function DatePickerDialog({
  value,
  max,
  title = "Entry date",
  hint = "For entries you’re copying in from your notebook. It can’t be in the future.",
  onPick,
  onClose,
}: {
  value: string;
  /** Latest allowed day (today). */
  max: string;
  title?: string;
  hint?: string;
  onPick(day: string): void;
  onClose(): void;
}) {
  const [chosen, setChosen] = useState(value);
  const [focus, setFocus] = useState(value);
  const [month, setMonth] = useState(monthOf(value));
  const grid = useRef<HTMLDivElement>(null);

  // Keep keyboard focus on the focused day.
  useEffect(() => {
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
  }, [focus, month]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function moveTo(day: string) {
    const next = day > max ? max : day;
    setFocus(next);
    setMonth(monthOf(next));
  }

  function onGridKey(e: React.KeyboardEvent) {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, -1),
      PageDown: () => addMonths(focus, 1),
      Home: () => addDays(focus, -toDate(focus).getUTCDay()),
      End: () => addDays(focus, 6 - toDate(focus).getUTCDay()),
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      moveTo(move());
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setChosen(focus);
    }
  }

  // The visible month, padded to whole weeks (Sunday first).
  const first = `${month}-01`;
  const start = addDays(first, -toDate(first).getUTCDay());
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weeks = Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7)).filter((wk) =>
    wk.some((d) => monthOf(d) === month),
  );
  const canNext = month < monthOf(max);

  const quick = [
    { label: "Today", day: max },
    { label: "Yesterday", day: addDays(max, -1) },
    { label: "2 days ago", day: addDays(max, -2) },
    { label: "1 week ago", day: addDays(max, -7) },
  ];

  return (
    <div className="dialog-backdrop dp-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog dp"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dp-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dp-head">
          <div>
            <h2 id="dp-title" className="disp">
              {title}
            </h2>
            <p>{hint}</p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="dp-quick" role="group" aria-label="Quick picks">
          {quick.map((q) => (
            <button
              key={q.label}
              type="button"
              aria-pressed={chosen === q.day}
              onClick={() => {
                setChosen(q.day);
                moveTo(q.day);
              }}
            >
              {q.label}
            </button>
          ))}
        </div>

        <div className="dp-cal">
          <div className="dp-month">
            <button
              type="button"
              className="icon-btn"
              aria-label="Previous month"
              onClick={() => setMonth(monthOf(addMonths(first, -1)))}
            >
              <Icon name="back" size={18} />
            </button>
            <strong aria-live="polite">{monthFmt.format(toDate(first))}</strong>
            <button
              type="button"
              className="icon-btn"
              aria-label="Next month"
              disabled={!canNext}
              onClick={() => setMonth(monthOf(addMonths(first, 1)))}
            >
              <Icon name="chevron" size={18} />
            </button>
          </div>

          <div
            ref={grid}
            role="grid"
            aria-labelledby="dp-title"
            className="dp-grid"
            onKeyDown={onGridKey}
          >
            <div role="row" className="dp-row dp-weekdays">
              {WEEKDAYS.map((w) => (
                <span key={w} role="columnheader" aria-label={w}>
                  {w.slice(0, 2)}
                </span>
              ))}
            </div>
            {weeks.map((wk) => (
              <div key={wk[0]} role="row" className="dp-row">
                {wk.map((d) => {
                  const inMonth = monthOf(d) === month;
                  const future = d > max;
                  return (
                    <span key={d} role="gridcell" aria-selected={d === chosen}>
                      {inMonth && (
                        <button
                          type="button"
                          data-day={d}
                          className={[
                            "dp-day",
                            d === max && "is-today",
                            d === chosen && "is-chosen",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          tabIndex={d === focus ? 0 : -1}
                          disabled={future}
                          aria-label={`${fullFmt.format(toDate(d))}${d === max ? ", today" : ""}`}
                          onClick={() => {
                            setChosen(d);
                            setFocus(d);
                          }}
                        >
                          {Number(d.slice(8))}
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <footer className="dp-foot">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onPick(chosen)}>
            <Icon name="check" size={16} />
            {chosen === max ? "Use today" : `Use ${formatPickedDay(chosen)}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
