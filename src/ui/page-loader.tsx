import { AtrazoMark, Lapis } from "@/ui/brand";

/**
 * Full-screen loader while the phone's encrypted ledger opens: Lapis flying over the brand tile,
 * animated in CSS (crisp at any size, ~nothing to download, still for reduced-motion users).
 */
export function PageLoader({
  label = "Opening your listahan…",
  overlay = false,
}: {
  label?: string;
  /** Cover the whole window above the page (the app-start splash). */
  overlay?: boolean;
}) {
  return (
    <div
      className={`app loader ${overlay ? "loader-overlay" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="loader-stage" aria-hidden="true">
        <div className="loader-lapis">
          <Lapis pose="fly" size={132} onDark />
        </div>
        <div className="loader-shadow" />
        <div className="loader-brand">
          <span className="logo" style={{ width: 40, height: 40 }}>
            <AtrazoMark size={31} />
          </span>
          <span className="disp">Atrazo</span>
        </div>
      </div>
      <p className="loader-label">{label}</p>
      <div className="loader-bar" aria-hidden="true" />
    </div>
  );
}
