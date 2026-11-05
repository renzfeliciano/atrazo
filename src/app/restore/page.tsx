import type { Metadata } from "next";
import { RestoreScreen } from "@/screens/restore";
import { FreshOnEachVisit } from "@/ui/fresh-on-each-visit";

export const metadata: Metadata = { title: "Open your store" };

export default function Page() {
  return (
    <FreshOnEachVisit>
      <RestoreScreen />
    </FreshOnEachVisit>
  );
}
