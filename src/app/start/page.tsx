import type { Metadata } from "next";
import { LedgerSetupScreen } from "@/screens/ledger-setup";
import { FreshOnEachVisit } from "@/ui/fresh-on-each-visit";

export const metadata: Metadata = { title: "Start your listahan" };

export default function Page() {
  return (
    <FreshOnEachVisit>
      <LedgerSetupScreen />
    </FreshOnEachVisit>
  );
}
