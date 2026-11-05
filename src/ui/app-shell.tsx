"use client";

import Link from "next/link";
import { useApp } from "@/app/providers";
import { LogoTile } from "./brand";
import { Icon, type IconName } from "./icons";

export type NavKey = "home" | "activity" | "settings" | "none";

const ITEMS: { key: Exclude<NavKey, "none">; href: string; label: string; icon: IconName }[] = [
  { key: "home", href: "/", label: "Home", icon: "home" },
  { key: "activity", href: "/activity", label: "Activity", icon: "activity" },
  { key: "settings", href: "/settings", label: "Settings", icon: "settings" },
];

export function syncLabel(state: string, pending: number): string {
  if (state === "offline") return `Offline · ${pending} saved on this device`;
  if (state === "syncing") return "Backing up…";
  if (state === "error") return "Backup will retry";
  if (pending > 0) return `${pending} waiting to back up`;
  return "All entries backed up";
}

/**
 * Wraps signed-in screens. Phones get the bottom tab bar from the design; tablets a graphite rail;
 * desktops a full sidebar. Screens supply their own app bar and content.
 */
export function AppShell({ active, children }: { active: NavKey; children: React.ReactNode }) {
  const { sync } = useApp();
  return (
    <div className="app shell">
      <aside className="side" aria-label="Main navigation">
        <Link href="/" className="side-brand">
          <LogoTile size={38} />
          <span className="side-brand-text">
            <strong style={{ fontSize: 17, fontWeight: 800, fontStretch: "115%" }}>Atrazo</strong>
            <span style={{ fontSize: 12, color: "var(--on-ink-3)" }}>utang ledger</span>
          </span>
        </Link>
        <Link href="/entry" className="side-cta" aria-label="New entry">
          <Icon name="plus" size={20} strokeWidth={2.6} />
          <span className="side-cta-label">New entry</span>
        </Link>
        {ITEMS.map((i) => (
          <Link
            key={i.key}
            href={i.href}
            className="side-item"
            aria-current={active === i.key ? "page" : undefined}
          >
            <Icon name={i.icon} size={22} />
            {i.label}
          </Link>
        ))}
        <div className="side-foot" role="status">
          <span
            className="live"
            aria-hidden="true"
            style={
              sync.state === "offline" || sync.state === "error"
                ? { background: "#FFC72C", boxShadow: "none" }
                : undefined
            }
          />
          <span className="side-foot-text">{syncLabel(sync.state, sync.pending)}</span>
        </div>
      </aside>

      <div className="shell-main">
        {children}
        <nav className="nav" aria-label="Primary">
          {ITEMS.slice(0, 2).map((i) => (
            <Link
              key={i.key}
              href={i.href}
              className="nav-item"
              aria-current={active === i.key ? "page" : undefined}
            >
              <span className="ind" aria-hidden="true" />
              <Icon name={i.icon} size={22} strokeWidth={1.9} />
              {i.label}
            </Link>
          ))}
          <Link href="/entry" className="nav-cta">
            <Icon name="plus" size={18} strokeWidth={2.6} />
            Entry
          </Link>
          <Link
            href="/settings"
            className="nav-item"
            aria-current={active === "settings" ? "page" : undefined}
          >
            <span className="ind" aria-hidden="true" />
            <Icon name="settings" size={22} strokeWidth={1.9} />
            Settings
          </Link>
        </nav>
      </div>
    </div>
  );
}
