/* Receipt Vault service worker.
   Goal: the app opens (shell + already-visited pages/assets) even with no
   network. Firestore's own IndexedDB cache handles the receipt DATA offline;
   this worker handles the HTML/JS/CSS so the page can boot at all.

   Strategy:
   - navigations (HTML): network-first, fall back to cached page, then to the
     cached app root "/" — so any route opens offline once the app has loaded.
   - static assets (script/style/font/image, same-origin): stale-while-
     revalidate — instant from cache, refreshed in the background.
   We never cache Firestore / Cloudinary / Google API traffic here. */

const CACHE = "rv-cache-v1";
const APP_SHELL = ["/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Only handle our own origin. Let Firebase/Cloudinary/Google go to network
  // (Firestore manages its own offline cache; others need live network).
  if (url.origin !== self.location.origin) return;

  // HTML navigations: network-first, cache fallback, then app root.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(request).then((hit) => hit || caches.match("/"))
        )
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
