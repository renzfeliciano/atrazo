"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "@/app/providers";
import { DashboardScreen, DashboardSkeleton } from "./dashboard";
import { UNCONFIRMED_CODE_KEY } from "./ledger-setup";

/** "/": the dashboard when a ledger is open on this device, otherwise the welcome screen. */
export function HomeScreen() {
  const router = useRouter();
  const { phone, session } = useApp();
  const unfinished = useLiveQuery(
    async () => (phone ? !!(await phone.db.device.get(UNCONFIRMED_CODE_KEY)) : false),
    [phone],
    undefined,
  );

  useEffect(() => {
    if (session === null) router.replace("/welcome");
    else if (session && unfinished) router.replace("/start");
  }, [session, unfinished, router]);

  if (!phone || !session || unfinished !== false) return <DashboardSkeleton />;
  return <DashboardScreen />;
}
