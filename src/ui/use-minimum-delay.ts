"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * The standard for screen skeletons. Local data arrives in ~20 ms, so a skeleton would only flash
 * for a frame. A screen shows its skeleton until both its data is ready and this delay has passed
 * since it was opened.
 *
 * "Opened" means every link or tab tap (Next's bfcacheId changes on push/replace navigations), and
 * a new `key` (e.g. a different client). Browser back/forward keeps the same bfcacheId, so going
 * back stays instant.
 */
export const MIN_SKELETON_MS = 450;

const NOT_YET = Symbol("not-yet");

export function useMinimumDelay(key: unknown = null, ms = MIN_SKELETON_MS): boolean {
  const { bfcacheId } = useRouter();
  const visit = `${bfcacheId}|${String(key)}`;
  const [doneFor, setDoneFor] = useState<string | typeof NOT_YET>(NOT_YET);
  useEffect(() => {
    const t = setTimeout(() => setDoneFor(visit), ms);
    return () => clearTimeout(t);
  }, [visit, ms]);
  return doneFor === visit;
}
