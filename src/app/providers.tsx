"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPhone, type Phone } from "@/client/phone";
import { syncCoordinator, type SyncState } from "@/modules/sync/application/sync-coordinator";
import { SyncHttpError } from "@/modules/sync/infrastructure/http-sync-api";
import { VisitTracker } from "@/ui/in-app-history";
import { ServiceWorker } from "@/ui/service-worker";
import { ToastViewport, type ToastInput, type ToastItem } from "@/ui/toast";
import { PageLoader } from "@/ui/page-loader";

/**
 * Client-side providers: the phone (local database + use cases), the open store, toasts and sync.
 * Everything here runs only in the browser; on the server the phone is null and screens show skeletons.
 */
interface SessionInfo {
  readonly storeId: string;
  readonly deviceId: string;
}

interface AppContextValue {
  readonly phone: Phone | null;
  /** undefined while loading, null when no store is open on this phone. */
  readonly session: SessionInfo | null | undefined;
  readonly sync: {
    state: SyncState;
    pending: number;
    notifyWrite(): void;
    syncNow(): Promise<void>;
  };
  toast(t: ToastInput): void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <Providers>");
  return ctx;
}

const SESSION_KEY = "vault.session";

/** One phone (local database + use cases) per browser tab, created on first use. */
let browserPhone: Phone | null = null;
const getBrowserPhone = () => (browserPhone ??= createPhone());
const getServerPhone = () => null;
const noSubscription = () => () => {};
const TOAST_MS = 3000;

const SPLASH_MS = 800;
let splashShown = false;

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // The Lapis splash shows on the first open of the app in this tab (any page), for at least
  // SPLASH_MS so it reads as intentional; later navigation never shows it again.
  const [splashDone, setSplashDone] = useState(splashShown);
  useEffect(() => {
    if (splashShown) return;
    const t = setTimeout(() => {
      splashShown = true;
      setSplashDone(true);
    }, SPLASH_MS);
    return () => clearTimeout(t);
  }, []);
  // Browser-only: hydration sees the server snapshot (null), then React re-renders with the real
  // phone. A mismatch here would leave stale server attributes (such as `disabled`) in place.
  const phone = useSyncExternalStore(noSubscription, getBrowserPhone, getServerPhone);
  const session = useLiveQuery(
    async () =>
      ((await phone?.db.device.get(SESSION_KEY))?.value as SessionInfo | undefined) ?? null,
    [phone],
    undefined,
  );
  const pending = useLiveQuery(async () => (phone ? phone.db.outbox.count() : 0), [phone], 0);

  // ── Toasts: one at a time, auto-dismiss after 3 s, closable, with an optional action (Undo).
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);
  const toast = useCallback(
    (t: ToastInput) => {
      const id = crypto.randomUUID();
      setToasts((ts) => [...ts.slice(-1), { ...t, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TOAST_MS),
      );
    },
    [dismiss],
  );

  // ── Sync: batched backups while a store is open.
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const coordinator = useMemo(() => {
    if (!phone || !session) return null;
    return syncCoordinator({
      async run({ pushOnly, keepalive }) {
        const engine = await phone.engine();
        if (pushOnly) await engine.pushPending({ keepalive });
        else await engine.syncNow();
      },
      classify: (e) =>
        e instanceof SyncHttpError
          ? { status: e.status, code: e.code, retryAfterSeconds: e.retryAfterSeconds }
          : { status: 0, code: "INTERNAL", retryAfterSeconds: null },
      onState: setSyncState,
    });
  }, [phone, session]);

  useEffect(() => {
    if (!coordinator) return;
    void coordinator.notifyForeground();
    const onVisibility = () =>
      document.visibilityState === "hidden"
        ? void coordinator.notifyBackground()
        : void coordinator.notifyForeground();
    const onOnline = () => void coordinator.notifyOnline();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      coordinator.stop();
    };
  }, [coordinator]);

  // A phone signed out from another phone erases its copy and returns to the welcome screen.
  useEffect(() => {
    if (syncState === "revoked" && phone) {
      void phone.db.wipe().then(() => router.replace("/welcome"));
    }
  }, [syncState, phone, router]);

  const value = useMemo<AppContextValue>(
    () => ({
      phone,
      session,
      toast,
      sync: {
        state: syncState,
        pending,
        notifyWrite: () => coordinator?.notifyWrite(),
        syncNow: async () => void (await coordinator?.syncNow()),
      },
    }),
    [phone, session, toast, syncState, pending, coordinator],
  );

  return (
    <AppContext.Provider value={value}>
      <VisitTracker />
      <ServiceWorker />
      {/* The page always renders (so prerendering and instant navigation see it); the splash is
          a layer over it until it finishes. */}
      {children}
      {!(splashDone && phone) && <PageLoader overlay />}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </AppContext.Provider>
  );
}
