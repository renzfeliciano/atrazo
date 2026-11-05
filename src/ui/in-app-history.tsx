"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Remembers which Atrazo pages this tab has shown, so an in-app Back arrow knows whether going back
 * stays inside Atrazo. (window.history.length can't tell: it counts other sites, and a page opened
 * in a new tab has nothing of ours behind it.)
 */
const visited = new Set<string>();

export function VisitTracker() {
  const pathname = usePathname();
  useEffect(() => {
    visited.add(pathname);
  }, [pathname]);
  return null;
}

/** True if this tab showed an Atrazo page other than `exclude` (e.g. the legal pages themselves). */
export function cameFromElsewhereInApp(exclude: readonly string[]): boolean {
  for (const path of visited) if (!exclude.includes(path)) return true;
  return false;
}
