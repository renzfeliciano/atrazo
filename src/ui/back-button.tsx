"use client";

import { useRouter } from "next/navigation";
import { cameFromElsewhereInApp } from "@/ui/in-app-history";
import { Icon } from "@/ui/icons";

/** The parts of the Navigation API used here (Chromium, Safari 26+). */
interface NavigationLike {
  readonly currentEntry: { readonly index: number } | null;
  entries(): readonly { readonly url: string | null }[];
}

/**
 * How many steps back the nearest Atrazo page outside `group` is, using the tab's real history.
 * Skips the group's own entries (Terms ⇄ Privacy, #section jumps), which would otherwise make Back
 * look like it does nothing. Null when the browser can't tell, 0 when there is no such page.
 */
function stepsBackOutOf(group: readonly string[]): number | null {
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  const current = nav?.currentEntry;
  if (!nav || !current) return null;
  const entries = nav.entries();
  for (let i = current.index - 1; i >= 0; i--) {
    const url = entries[i]?.url;
    if (!url) continue;
    const u = new URL(url);
    if (u.origin === location.origin && !group.includes(u.pathname)) return current.index - i;
  }
  return 0;
}

/**
 * Goes back to the Atrazo screen the person came from (Welcome, Settings, …). If they opened this
 * page directly, going back would leave the app, so it goes to `fallback` instead.
 *
 * `group` lists this page and its siblings (Terms ⇄ Privacy); they are never a Back destination.
 */
export function BackButton({
  fallback = "/",
  group = [],
  label = "Back",
}: {
  fallback?: string;
  group?: readonly string[];
  label?: string;
}) {
  const router = useRouter();

  function goBack() {
    const steps = stepsBackOutOf(group);
    if (steps === null) {
      // No Navigation API: fall back to what this tab has shown.
      if (cameFromElsewhereInApp(group)) router.back();
      else router.push(fallback);
    } else if (steps > 0) {
      history.go(-steps);
    } else {
      router.push(fallback);
    }
  }

  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={label}
      style={{ color: "#fff" }}
      onClick={goBack}
    >
      <Icon name="back" size={22} />
    </button>
  );
}
