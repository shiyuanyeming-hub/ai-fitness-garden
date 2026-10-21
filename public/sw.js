/* AI Fitness Garden service worker — offline app shell.
 * Data lives in IndexedDB (not here); this only caches the app code so it opens without network.
 *  - navigations: network first (3.5s), fall back to cached page, then cached "/"
 *  - /_next/static and icons: cache first (immutable hashed files)
 *  - /api/*: never cached
 */
const VERSION = "afg-v1";
const SHELL = ["/", "/workout", "/scan", "/equipment", "/exercise", "/farm", "/history", "/me", "/about", "/manifest.webmanifest", "/icon-192.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then(async (cache) => {
      await Promise.all(SHELL.map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => undefined)));
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

function timeout(ms) {
  return new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VERSION);
        try {
          const res = await Promise.race([fetch(req), timeout(3500)]);
          if (res && res.ok) cache.put(url.pathname, res.clone());
          return res;
        } catch {
          return (await cache.match(url.pathname)) || (await cache.match("/")) || Response.error();
        }
      })(),
    );
    return;
  }

  const immutable = url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|webmanifest)$/.test(url.pathname);
  if (immutable) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VERSION);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })(),
    );
    return;
  }

  // RSC payloads & other same-origin GETs: stale-while-revalidate
  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      const net = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit || Response.error());
      return hit || net;
    })(),
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
});
