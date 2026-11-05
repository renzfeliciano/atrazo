"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "@/ui/icons";

const subscribe = () => () => {};
const isInsecure = () => !window.isSecureContext || !globalThis.crypto?.subtle;

/**
 * Atrazo encrypts on the device with Web Crypto, which browsers only allow on HTTPS (or
 * localhost). That only bites when testing the dev server from a phone over Wi-Fi
 * (http://192.168.x.x); this explains the fix instead of failing with a cryptic error.
 */
export function SecureContextNotice() {
  const insecure = useSyncExternalStore(subscribe, isInsecure, () => false);
  if (!insecure) return null;
  return (
    <div className="banner banner-warn" role="alert">
      <Icon name="lock" size={16} />
      <span>
        <strong>This address isn’t secure, so the phone can’t encrypt.</strong> Open Atrazo over
        HTTPS. For testing on a phone over Wi-Fi in Chrome, add this address in{" "}
        <code>chrome://flags/#unsafely-treat-insecure-origin-as-secure</code>, then relaunch Chrome.
      </span>
    </div>
  );
}
