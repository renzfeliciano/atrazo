import type { Metadata } from "next";
import { PRIVACY } from "@/content/legal";
import { LegalDocumentScreen } from "@/ui/legal-document";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function Page() {
  return <LegalDocumentScreen doc={PRIVACY} />;
}
