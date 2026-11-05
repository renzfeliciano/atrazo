/**
 * Page-shaped placeholders for the full-screen task pages (new entry, client form). Every screen
 * that reads local data shows one of these, or its own, for at least MIN_SKELETON_MS when it opens.
 */
const block = (height: number | string, width: number | string = "100%") => (
  <span className="skeleton" style={{ display: "block", height, width }} />
);

function SoloBar({ titleWidth }: { titleWidth: number }) {
  return (
    <header className="bar" style={{ paddingLeft: 12 }}>
      <span className="skeleton skel-ink" style={{ height: 22, width: 22, borderRadius: 6 }} />
      <div className="bar-title" style={{ gap: 6 }}>
        <span className="skeleton skel-ink" style={{ height: 16, width: titleWidth }} />
        <span className="skeleton skel-ink" style={{ height: 11, width: titleWidth + 50 }} />
      </div>
    </header>
  );
}

export function EntrySkeleton() {
  return (
    <div className="app solo" aria-busy="true" aria-label="Loading">
      <SoloBar titleWidth={90} />
      <main
        className="vscroll"
        style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12 }}
      >
        {block(46)}
        <section
          className="card"
          style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}
        >
          {block(12, 90)}
          {block(40, 190)}
          {block(12, "55%")}
        </section>
        {block(44)}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {Array.from({ length: 16 }, (_, i) => (
            <span
              key={i}
              className="skeleton"
              style={{ display: "block", height: 52, borderRadius: 10 }}
            />
          ))}
        </div>
      </main>
      <footer className="action-bar">{block(52)}</footer>
    </div>
  );
}

export function ClientFormSkeleton() {
  const field = (w: number) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {block(12, w)}
      {block(44)}
    </div>
  );
  return (
    <div className="app solo" aria-busy="true" aria-label="Loading">
      <SoloBar titleWidth={100} />
      <main
        className="vscroll"
        style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14 }}
      >
        <section
          className="card"
          style={{ padding: 14, display: "flex", flexDirection: "column", gap: 16 }}
        >
          {field(60)}
          {field(120)}
        </section>
        <section
          className="card"
          style={{ padding: 14, display: "flex", flexDirection: "column", gap: 16 }}
        >
          {field(100)}
          {field(130)}
          {field(70)}
        </section>
      </main>
      <footer className="action-bar" style={{ flexDirection: "row", gap: 10 }}>
        <span className="skeleton" style={{ display: "block", height: 52, flex: 1 }} />
        <span className="skeleton" style={{ display: "block", height: 52, flex: 2 }} />
      </footer>
    </div>
  );
}

/** Settings body: section labels with rows, under the real header. */
export function SettingsBodySkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading settings"
      style={{ display: "flex", flexDirection: "column", gap: 22 }}
    >
      {[1, 1, 2, 1].map((rows, s) => (
        <div key={s} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {block(11, 110)}
          <div
            className="card"
            style={{ padding: 14, display: "flex", flexDirection: "column", gap: 16 }}
          >
            {Array.from({ length: rows }, (_, r) => (
              <div key={r} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  className="skeleton"
                  style={{ display: "block", height: 34, width: 34, borderRadius: 9 }}
                />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  {block(14, "55%")}
                  {block(11, "80%")}
                </div>
                <span
                  className="skeleton"
                  style={{ display: "block", height: 32, width: 76, borderRadius: 8 }}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
