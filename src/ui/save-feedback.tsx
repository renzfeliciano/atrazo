"use client";

import { useEffect, useState } from "react";

/**
 * Shared "something is being saved" feedback, the same everywhere a card saves:
 *   - <ProgressStrip> sweeps along the bottom of the card while the save runs;
 *   - useJustSaved() keeps a "Saved just now" confirmation up for a few seconds afterwards.
 * Pair with usePendingAction (use SAVE_FEEDBACK_MS so the strip completes a full sweep).
 */
export const SAVE_FEEDBACK_MS = 1000;
export const JUST_SAVED_MS = 3500;

/** `edge`: pinned to the bottom edge of a padded card (the card needs position: relative). */
export function ProgressStrip({ label, edge = false }: { label: string; edge?: boolean }) {
  return (
    <div
      className={`set-progress ${edge ? "set-progress-edge" : ""}`}
      role="progressbar"
      aria-label={label}
    />
  );
}

export function useJustSaved(ms = JUST_SAVED_MS): [Date | null, () => void] {
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), ms);
    return () => clearTimeout(t);
  }, [savedAt, ms]);
  return [savedAt, () => setSavedAt(new Date())];
}
