import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientLedgerScreen } from "@/screens/client-ledger";

export const metadata: Metadata = { title: "Borrower" };

export default function Page() {
  return (
    <Suspense>
      <ClientLedgerScreen />
    </Suspense>
  );
}
