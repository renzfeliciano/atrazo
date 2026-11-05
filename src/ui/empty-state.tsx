import { type ReactNode } from "react";

/**
 * The one way Atrazo says "nothing here yet": art (usually Lapis), a short title, one line of help,
 * and the action that fixes it. Every empty list uses this, so they all look and read the same.
 */
export function EmptyState({
  art,
  title,
  body,
  action,
  secondary,
  compact = false,
  bare = false,
}: {
  art: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  secondary?: ReactNode;
  compact?: boolean;
  /** Inside another card: no border or background of its own. */
  bare?: boolean;
}) {
  return (
    <section
      className={["empty", bare ? "" : "card", compact ? "empty-compact" : ""]
        .filter(Boolean)
        .join(" ")}
      role="status"
    >
      <div className="empty-art" aria-hidden="true">
        {art}
      </div>
      <h2 className="disp empty-title">{title}</h2>
      <p className="empty-body">{body}</p>
      {(action || secondary) && (
        <div className="empty-actions">
          {action}
          {secondary}
        </div>
      )}
    </section>
  );
}
