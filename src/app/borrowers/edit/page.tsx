import type { Metadata } from "next";
import { Suspense } from "react";
import { BorrowerFormScreen } from "@/screens/borrower-form";
import { FreshOnEachVisit } from "@/ui/fresh-on-each-visit";
import { BorrowerFormSkeleton } from "@/ui/skeletons";

export const metadata: Metadata = { title: "Edit borrower" };

export default function Page() {
  return (
    <Suspense fallback={<BorrowerFormSkeleton />}>
      <FreshOnEachVisit>
        <BorrowerFormScreen mode="edit" />
      </FreshOnEachVisit>
    </Suspense>
  );
}
