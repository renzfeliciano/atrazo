"use client";

import { Icon } from "./icons";

export interface ToastInput {
  readonly title: string;
  readonly detail?: string;
  readonly tone?: "utang" | "bayad" | "error";
  readonly action?: { readonly label: string; readonly onPress: () => void };
}

export interface ToastItem extends ToastInput {
  readonly id: string;
}

/** Notifications that close by themselves after 3 seconds (timer bar), or at once with ×. */
export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: readonly ToastItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span
            className={`toast-icon ${t.tone === "bayad" ? "bayad" : ""}`}
            style={t.tone === "error" ? { background: "#B93815" } : undefined}
            aria-hidden="true"
          >
            {t.tone === "error" ? (
              <Icon name="alert" size={15} />
            ) : (
              <Icon name="check" size={15} strokeWidth={3} />
            )}
          </span>
          <span className="toast-body">
            <span className="toast-title">{t.title}</span>
            {t.detail && <span className="toast-sub mono">{t.detail}</span>}
          </span>
          {t.action && (
            <button
              type="button"
              className="toast-act"
              onClick={() => {
                t.action!.onPress();
                onDismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss"
            onClick={() => onDismiss(t.id)}
          >
            <Icon name="close" size={18} />
          </button>
          {t.tone !== "error" && <span className="toast-timer" aria-hidden="true" />}
        </div>
      ))}
    </div>
  );
}
