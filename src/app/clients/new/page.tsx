import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientFormScreen } from "@/screens/client-form";
import { FreshOnEachVisit } from "@/ui/fresh-on-each-visit";
import { ClientFormSkeleton } from "@/ui/skeletons";

export const metadata: Metadata = { title: "New borrower" };

export default function Page() {
  return (
    <Suspense fallback={<ClientFormSkeleton />}>
      <FreshOnEachVisit>
        <ClientFormScreen mode="new" />
      </FreshOnEachVisit>
    </Suspense>
  );
}
