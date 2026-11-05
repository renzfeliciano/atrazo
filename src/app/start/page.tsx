import type { Metadata } from "next";
import { StoreSetupScreen } from "@/screens/store-setup";
import { FreshOnEachVisit } from "@/ui/fresh-on-each-visit";

export const metadata: Metadata = { title: "Start your store" };

export default function Page() {
  return (
    <FreshOnEachVisit>
      <StoreSetupScreen />
    </FreshOnEachVisit>
  );
}
