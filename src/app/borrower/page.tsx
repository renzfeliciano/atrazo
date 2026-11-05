import type { Metadata } from "next";
import { Suspense } from "react";
import { BorrowerLedgerScreen } from "@/screens/borrower-ledger";

export const metadata: Metadata = { title: "Borrower" };

export default function Page() {
  return (
    <Suspense>
      <BorrowerLedgerScreen />
    </Suspense>
  );
}
