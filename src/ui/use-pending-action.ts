"use client";

import { useState } from "react";

/**
 * The standard for every save and action button. Local writes finish in a few milliseconds, which
 * reads as "did anything happen?". So the busy state is held for at least `MIN_PENDING_MS`:
 * long enough to see the spinner, short enough not to slow anyone down. Slower work (network)
 * simply takes as long as it takes. Errors are not delayed.
 */
export const MIN_PENDING_MS = 600;

export function usePendingAction() {
  const [pending, setPending] = useState(false);

  async function run<T>(action: () => Promise<T>, minMs = MIN_PENDING_MS): Promise<T> {
    setPending(true);
    const started = Date.now();
    try {
      const result = await action();
      const left = minMs - (Date.now() - started);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      return result;
    } finally {
      setPending(false);
    }
  }

  return { pending, run };
}
