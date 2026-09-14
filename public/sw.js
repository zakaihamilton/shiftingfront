// Shifting Front Service Worker — Offline PWA Cache
const CACHE_NAME = "shiftingfront-v1";

const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icon.png",
  "/apple-icon.png",
  "/icons/pwa-192.png",
  "/icons/pwa-512.png",
  "/icons/pwa-maskable-512.png",
  "/art/menu-command-vista.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => {
        // Continue even if an optional asset fails precache
        return self.skipWaiting();
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests and http/https schemes
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!url.protocol.startsWith("http")) return;

  // 1. Navigation requests (HTML pages): Network-first with cache fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match("/");
          return fallback || new Response("Offline — Launch from installed app or reconnect to network.", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        }),
    );
    return;
  }

  // 2. Static assets (JS/CSS chunks, art, fonts, icons): Cache-first with network fallback
  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/art/") ||
    url.pathname.startsWith("/icons/") ||
    url.hostname.includes("fonts.gstatic.com") ||
    url.hostname.includes("fonts.googleapis.com");

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      }),
    );
    return;
  }

  // 3. Other requests (runtime data/API): Stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    }),
  );
});
