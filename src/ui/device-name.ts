/** A readable default name for this device, shown in Settings → Phones. The owner can rename it. */
export function guessDeviceName(): string {
  if (typeof navigator === "undefined") return "This phone";
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const device = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? /Mobile/.test(ua)
          ? "Android phone"
          : "Android tablet"
        : /Windows/.test(ua)
          ? "Windows computer"
          : /Mac OS X/.test(ua)
            ? "Mac"
            : "Computer";
  return `${device} · ${browser}`;
}
