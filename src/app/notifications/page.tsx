import type { Metadata } from "next";
import { NotificationsScreen } from "@/screens/notifications/notifications-screen";

export const metadata: Metadata = { title: "Notifications" };

export default function Page() {
  return <NotificationsScreen />;
}
