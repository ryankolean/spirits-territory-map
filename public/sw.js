// Offline fallback for reps in dead zones: hashed build assets come from the
// cache first; everything else (page, data) goes to the network first and
// falls back to the last cached copy. Map tiles are cross-origin and skipped.
const CACHE = "stm-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (url.pathname.includes("/assets/")) {
        const hit = await cache.match(req);
        if (hit) return hit;
      }
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match(req);
        if (hit) return hit;
        throw err;
      }
    })(),
  );
});
