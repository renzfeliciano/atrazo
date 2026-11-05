import type { Metadata } from "next";
import { TERMS } from "@/content/legal";
import { LegalDocumentScreen } from "@/ui/legal-document";

export const metadata: Metadata = { title: "Terms of Use" };

export default function Page() {
  return <LegalDocumentScreen doc={TERMS} />;
}
