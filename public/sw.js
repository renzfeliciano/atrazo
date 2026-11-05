/*
 * Atrazo service worker: makes the app itself open with no signal.
 * (Your records already live on the phone; this caches the app's pages and code.)
 *
 *   /_next/static, /fonts, /icons   cache first (file names are content-hashed or versioned)
 *   pages (navigations)             network first, cached copy when offline
 *   Next.js page data (RSC)         network first, cached copy when offline
 *   /api/*                          never cached (the sync engine handles being offline)
 *
 * Every page is pre-cached on install, with the scripts and styles it references, so screens you
 * haven't opened yet also work offline. Bump VERSION to drop old caches after a breaking change.
 */
const VERSION = "v1";
const STATIC = `atrazo-static-${VERSION}`;
const PAGES = `atrazo-pages-${VERSION}`;
const ROUTES = [
  "/",
  "/welcome",
  "/start",
  "/restore",
  "/client",
  "/clients/new",
  "/clients/edit",
  "/entry",
  "/activity",
  "/settings",
  "/statement",
  "/notifications",
  "/terms",
  "/privacy",
];
const ASSET_IN_HTML = /(?:src|href)="(\/(?:_next\/static|fonts|icons)\/[^"]+)"/g;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const pages = await caches.open(PAGES);
      const statics = await caches.open(STATIC);
      const assets = new Set(["/icons/icon-192.png", "/icons/icon-512.png"]);
      await Promise.all(
        ROUTES.map(async (route) => {
          try {
            const res = await fetch(route, { cache: "no-cache" });
            if (!res.ok) return;
            const html = await res.clone().text();
            for (const m of html.matchAll(ASSET_IN_HTML)) assets.add(m[1].replace(/&amp;/g, "&"));
            await pages.put(route, res);
          } catch {
            // Offline during install: that page gets cached the first time it is opened.
          }
        }),
      );
      await Promise.all(
        [...assets].map((url) =>
          statics.match(url).then((hit) => hit || statics.add(url).catch(() => undefined)),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC, PAGES]);
      for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

const isStatic = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/fonts/") ||
  url.pathname.startsWith("/icons/");

const isPageData = (req, url) => req.headers.get("RSC") === "1" || url.searchParams.has("_rsc");

async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, key, fallbackToHome) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === "basic") await cache.put(key, res.clone());
    return res;
  } catch (err) {
    // Pages share one HTML shell per path (/client?id=… reads the id on the phone), so match by path.
    const hit = (await cache.match(key)) || (await cache.match(key, { ignoreSearch: true }));
    if (hit) return hit;
    if (fallbackToHome) {
      const home = await cache.match("/");
      if (home) return home;
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;

  if (isStatic(url)) {
    event.respondWith(cacheFirst(req));
  } else if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, url.pathname, true));
  } else if (isPageData(req, url)) {
    // Keyed by the full URL: page data differs per route and per prefetch segment.
    event.respondWith(networkFirst(req, req.url, false));
  }
});
