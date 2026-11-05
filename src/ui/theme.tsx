"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "@/ui/icons";

/**
 * Light / dark theme. The choice is a per-device convenience kept in localStorage (never sent
 * anywhere); with no choice saved, the phone's own setting decides. The resolved theme lives on
 * <html data-theme>, which the stylesheets read.
 */
export type Theme = "light" | "dark";

const STORAGE_KEY = "atrazo.theme";
const CHANGE_EVENT = "atrazo:theme";

/**
 * Runs in <head> before the first paint, so a dark-theme phone never flashes white.
 * Kept tiny and dependency-free; storage can throw (private mode, blocked storage), so it is guarded.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");}catch(e){}if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;})();`;

function savedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  const media = matchMedia("(prefers-color-scheme: dark)");
  // Follow the phone's setting live, unless the person picked a theme here.
  const onSystem = () => {
    if (!savedTheme()) apply(systemTheme());
  };
  media.addEventListener("change", onSystem);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    media.removeEventListener("change", onSystem);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

const current = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function useTheme(): [Theme | null, (t: Theme) => void] {
  // Null on the server and during hydration: the server can't know the device's theme.
  const theme = useSyncExternalStore(subscribe, current, () => null);
  const set = (t: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // Storage unavailable: the theme still changes for this visit.
    }
    apply(t);
  };
  return [theme, set];
}

/** Sun/moon button for dark headers. Shows what a tap switches to. */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useTheme();
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className={`icon-btn theme-toggle ${className ?? ""}`}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => setTheme(next)}
      disabled={theme === null}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} size={19} />
    </button>
  );
}

export type ThemePreference = Theme | "system";

const preference = (): ThemePreference => savedTheme() ?? "system";

/** For Settings: Light, Dark, or follow the phone ("System"). Null until the device is known. */
export function useThemePreference(): [ThemePreference | null, (p: ThemePreference) => void] {
  const pref = useSyncExternalStore(subscribe, preference, () => null);
  const set = (p: ThemePreference) => {
    try {
      if (p === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // Storage unavailable: the theme still changes for this visit.
    }
    apply(p === "system" ? systemTheme() : p);
  };
  return [pref, set];
}
