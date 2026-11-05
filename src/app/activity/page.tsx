import type { Metadata } from "next";
import { ActivityScreen } from "@/screens/activity";

export const metadata: Metadata = { title: "Activity" };

export default function Page() {
  return <ActivityScreen />;
}
