"use client";

import { useRouter } from "next/navigation";
import { Fragment, type ReactNode } from "react";

/**
 * With Cache Components, Next keeps visited pages mounted (hidden in React <Activity>), so their
 * state survives navigation. That is right for lists, but wrong for "new transaction" screens: a
 * second visit to the entry screen would reopen with the last amount, type and note still in it.
 *
 * Keying on bfcacheId remounts the subtree on every link or router.push/replace visit, while
 * browser back/forward still restores what was there.
 * See node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md.
 */
export function FreshOnEachVisit({ children }: { children: ReactNode }) {
  const { bfcacheId } = useRouter();
  return <Fragment key={bfcacheId}>{children}</Fragment>;
}
