"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js so the app opens offline. Production only: in development the service
 * worker would cache hot-reloaded code and fight the dev server.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Not fatal: the app still works online, and the records are on the phone either way.
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
