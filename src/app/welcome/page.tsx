import type { Metadata } from "next";
import { WelcomeScreen } from "@/screens/welcome";

export const metadata: Metadata = { title: "Welcome" };

export default function Page() {
  return <WelcomeScreen />;
}
