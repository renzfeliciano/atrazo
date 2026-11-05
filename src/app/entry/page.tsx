import type { Metadata } from "next";
import { Suspense } from "react";
import { EntryScreen } from "@/screens/entry/entry-screen";
import { FreshOnEachVisit } from "@/ui/fresh-on-each-visit";
import { EntrySkeleton } from "@/ui/skeletons";

export const metadata: Metadata = { title: "New entry" };

export default function Page() {
  return (
    <Suspense fallback={<EntrySkeleton />}>
      <FreshOnEachVisit>
        <EntryScreen />
      </FreshOnEachVisit>
    </Suspense>
  );
}
