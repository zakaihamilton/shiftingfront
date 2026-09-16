// Shifting Front Service Worker — Offline PWA Cache (Complete Runtime Precache)
const CACHE_NAME = "shiftingfront-v4";

const PRECACHE_URLS = [
  // Core routes
  "/",
  "/manifest.webmanifest",
  "/tutorial",
  "/briefing",
  "/campaign",
  "/play",
  "/campaign-complete",
  "/load",
  "/privacy",
  "/terms",

  // App & PWA icons
  "/favicon.ico",
  "/icon.png",
  "/apple-icon.png",
  "/icons/pwa-192.png",
  "/icons/pwa-512.png",
  "/icons/pwa-maskable-512.png",

  // Biome backdrops
  "/art/biomes/ash-plains.webp",
  "/art/biomes/crystal-flats.webp",
  "/art/biomes/glass-desert.webp",
  "/art/biomes/jungle-wreckage.webp",
  "/art/biomes/rust-canyons.webp",
  "/art/biomes/salt-marshes.webp",
  "/art/biomes/tundra-grid.webp",
  "/art/biomes/volcanic-shelf.webp",

  // Main menu scene vista
  "/art/menu-command-vista.webp",

  // 3D Unit and building models
  "/art/models/anti-armor.obj",
  "/art/models/harvester.obj",
  "/art/models/infantry.obj",
  "/art/models/tank.obj",
  "/art/models/turret-head.obj",
  "/art/models/turret.obj",

  // Character portraits (Advisors)
  "/art/portraits/advisor-01.webp",
  "/art/portraits/advisor-02.webp",
  "/art/portraits/advisor-03.webp",
  "/art/portraits/advisor-04.webp",
  "/art/portraits/advisor-05.webp",
  "/art/portraits/advisor-06.webp",
  "/art/portraits/advisor-07.webp",
  "/art/portraits/advisor-08.webp",
  "/art/portraits/advisor-09.webp",
  "/art/portraits/advisor-10.webp",
  "/art/portraits/advisor-11.webp",
  "/art/portraits/advisor-12.webp",

  // Character portraits (Commanders)
  "/art/portraits/commander-01.webp",
  "/art/portraits/commander-02.webp",
  "/art/portraits/commander-03.webp",
  "/art/portraits/commander-04.webp",
  "/art/portraits/commander-05.webp",
  "/art/portraits/commander-06.webp",
  "/art/portraits/commander-07.webp",
  "/art/portraits/commander-08.webp",
  "/art/portraits/commander-09.webp",
  "/art/portraits/commander-10.webp",
  "/art/portraits/commander-11.webp",
  "/art/portraits/commander-12.webp",

  // Character portraits (Enemy Leaders)
  "/art/portraits/enemy-leader-01.webp",
  "/art/portraits/enemy-leader-02.webp",
  "/art/portraits/enemy-leader-03.webp",
  "/art/portraits/enemy-leader-04.webp",
  "/art/portraits/enemy-leader-05.webp",
  "/art/portraits/enemy-leader-06.webp",
  "/art/portraits/enemy-leader-07.webp",
  "/art/portraits/enemy-leader-08.webp",
  "/art/portraits/enemy-leader-09.webp",
  "/art/portraits/enemy-leader-10.webp",
  "/art/portraits/enemy-leader-11.webp",
  "/art/portraits/enemy-leader-12.webp",

  // Results screens
  "/art/results/defeat.webp",
  "/art/results/victory.webp",

  // Sprites (Units & Buildings)
  "/art/sprites/sleek-modular/anti-armor-back-left-v1.webp",
  "/art/sprites/sleek-modular/anti-armor-back-right-v1.webp",
  "/art/sprites/sleek-modular/anti-armor-back.webp",
  "/art/sprites/sleek-modular/anti-armor-front-left-v1.webp",
  "/art/sprites/sleek-modular/anti-armor-front-right-v1.webp",
  "/art/sprites/sleek-modular/anti-armor-front.webp",
  "/art/sprites/sleek-modular/anti-armor-left.webp",
  "/art/sprites/sleek-modular/anti-armor-right.webp",
  "/art/sprites/sleek-modular/barracks-v2.webp",
  "/art/sprites/sleek-modular/construction-yard-v2.webp",
  "/art/sprites/sleek-modular/convoy-truck-back-left-v1.webp",
  "/art/sprites/sleek-modular/convoy-truck-back-right-v1.webp",
  "/art/sprites/sleek-modular/convoy-truck-back-v1.webp",
  "/art/sprites/sleek-modular/convoy-truck-front-left-v1.webp",
  "/art/sprites/sleek-modular/convoy-truck-front-right-v1.webp",
  "/art/sprites/sleek-modular/convoy-truck-front-v1.webp",
  "/art/sprites/sleek-modular/convoy-truck-left-v1.webp",
  "/art/sprites/sleek-modular/convoy-truck-right-v1.webp",
  "/art/sprites/sleek-modular/factory-v2.webp",
  "/art/sprites/sleek-modular/harvester-back-left-v1.webp",
  "/art/sprites/sleek-modular/harvester-back-right-v1.webp",
  "/art/sprites/sleek-modular/harvester-back.webp",
  "/art/sprites/sleek-modular/harvester-front-left-v1.webp",
  "/art/sprites/sleek-modular/harvester-front-right-v1.webp",
  "/art/sprites/sleek-modular/harvester-front.webp",
  "/art/sprites/sleek-modular/harvester-left-v2.webp",
  "/art/sprites/sleek-modular/harvester-right-v2.webp",
  "/art/sprites/sleek-modular/infantry-back-left-v1.webp",
  "/art/sprites/sleek-modular/infantry-back-right-v1.webp",
  "/art/sprites/sleek-modular/infantry-back-v1.webp",
  "/art/sprites/sleek-modular/infantry-front-left-v1.webp",
  "/art/sprites/sleek-modular/infantry-front-right-v1.webp",
  "/art/sprites/sleek-modular/infantry-front-v1.webp",
  "/art/sprites/sleek-modular/infantry-left-v1.webp",
  "/art/sprites/sleek-modular/infantry-right-v1.webp",
  "/art/sprites/sleek-modular/medic-back-left-v1.webp",
  "/art/sprites/sleek-modular/medic-back-right-v1.webp",
  "/art/sprites/sleek-modular/medic-back-v1.webp",
  "/art/sprites/sleek-modular/medic-front-left-v1.webp",
  "/art/sprites/sleek-modular/medic-front-right-v1.webp",
  "/art/sprites/sleek-modular/medic-front-v1.webp",
  "/art/sprites/sleek-modular/medic-left-v1.webp",
  "/art/sprites/sleek-modular/medic-right-v1.webp",
  "/art/sprites/sleek-modular/objective-v2.webp",
  "/art/sprites/sleek-modular/power-v2.webp",
  "/art/sprites/sleek-modular/refinery-v2.webp",
  "/art/sprites/sleek-modular/repair-truck-back-left-v1.webp",
  "/art/sprites/sleek-modular/repair-truck-back-right-v1.webp",
  "/art/sprites/sleek-modular/repair-truck-back-v1.webp",
  "/art/sprites/sleek-modular/repair-truck-front-left-v1.webp",
  "/art/sprites/sleek-modular/repair-truck-front-right-v1.webp",
  "/art/sprites/sleek-modular/repair-truck-front-v1.webp",
  "/art/sprites/sleek-modular/repair-truck-left-v1.webp",
  "/art/sprites/sleek-modular/repair-truck-right-v1.webp",
  "/art/sprites/sleek-modular/tank-back-left-v1.webp",
  "/art/sprites/sleek-modular/tank-back-right-v1.webp",
  "/art/sprites/sleek-modular/tank-back.webp",
  "/art/sprites/sleek-modular/tank-front-left-v1.webp",
  "/art/sprites/sleek-modular/tank-front-right-v1.webp",
  "/art/sprites/sleek-modular/tank-front.webp",
  "/art/sprites/sleek-modular/tank-left.webp",
  "/art/sprites/sleek-modular/tank-right.webp",
  "/art/sprites/sleek-modular/turret-v2.webp",

  // Walk cycle sprites
  "/art/sprites/sleek-modular/walk-cycle/anti-armor-back-left-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/anti-armor-back-right-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/anti-armor-back-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/anti-armor-front-left-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/anti-armor-front-right-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/anti-armor-front-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/anti-armor-left-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/anti-armor-right-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/infantry-back-left-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/infantry-back-right-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/infantry-back-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/infantry-front-left-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/infantry-front-right-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/infantry-front-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/infantry-left-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/infantry-right-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/medic-back-left-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/medic-back-right-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/medic-back-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/medic-front-left-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/medic-front-right-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/medic-front-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/medic-left-walk-v1.webp",
  "/art/sprites/sleek-modular/walk-cycle/medic-right-walk-v1.webp",

  // Terrain materials & plates
  "/art/terrain/armored-v1.webp",
  "/art/terrain/expeditionary-v1.webp",
  "/art/terrain/modular-v1.webp",

  // UI textures
  "/art/textures/brushed-gunmetal.webp",
  "/art/textures/crt-glass.webp",
  "/art/textures/worn-panel.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        // 1. Precache static assets and HTML routes resiliently in parallel
        await Promise.allSettled(
          PRECACHE_URLS.map(async (url) => {
            try {
              const response = await fetch(url);
              if (response.ok) {
                await cache.put(url, response.clone());

                // 2. Discover and precache linked Next.js static bundles (JS, CSS, fonts) from HTML pages
                const contentType = response.headers.get("content-type") || "";
                if (contentType.includes("text/html")) {
                  const html = await response.text();
                  const subResourceMatches = [
                    ...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g),
                  ];
                  const subResources = [...new Set(subResourceMatches.map((m) => m[1]))];
                  await Promise.allSettled(
                    subResources.map(async (subUrl) => {
                      try {
                        const subRes = await fetch(subUrl);
                        if (subRes.ok) {
                          await cache.put(subUrl, subRes);
                        }
                      } catch {
                        // Ignore individual subresource fetch failure
                      }
                    }),
                  );
                }
              }
            } catch {
              // Ignore individual asset failure so installation always succeeds
            }
          }),
        );
      })
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
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

  // Local development must always see the current Next.js bundles. The page
  // unregisters this worker on localhost, and this guard covers one final
  // navigation while an older worker is being replaced.
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    event.respondWith(fetch(request));
    return;
  }

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
          // Check exact request first, then fallback ignoring search query parameters (e.g. ?seed=0421&mission=0)
          const cached = await caches.match(request, { ignoreSearch: true });
          if (cached) return cached;
          const cachedPath = await caches.match(url.pathname);
          if (cachedPath) return cachedPath;
          const fallback = await caches.match("/");
          return (
            fallback ||
            new Response(
              "Offline — Launch from installed app or reconnect to network.",
              {
                status: 503,
                headers: { "Content-Type": "text/plain" },
              },
            )
          );
        }),
    );
    return;
  }

  // 2. Static assets (JS/CSS chunks, art, fonts, icons): Cache-first with network fallback
  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/art/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".obj") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".webmanifest") ||
    url.hostname.includes("fonts.gstatic.com") ||
    url.hostname.includes("fonts.googleapis.com");

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) return cached;
        const cachedPath = await caches.match(url.pathname);
        if (cachedPath) return cachedPath;
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
