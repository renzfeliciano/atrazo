import type { Metadata } from "next";
import { Suspense } from "react";
import { StatementScreen } from "@/screens/statement";
import { FreshOnEachVisit } from "@/ui/fresh-on-each-visit";

export const metadata: Metadata = { title: "Statement" };

export default function Page() {
  return (
    <Suspense>
      <FreshOnEachVisit>
        <StatementScreen />
      </FreshOnEachVisit>
    </Suspense>
  );
}
