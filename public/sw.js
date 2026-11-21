// Service Worker for SHALOM - Full Offline PWA & Website 2 APK Builder Compatible
const CACHE_NAME = '__SHALOM_CACHE_VERSION__';

const PRECACHE_ASSETS = /* __SHALOM_PRECACHE_ASSETS__ */ [
  './',
  './index.html',
  './404.html',
  './manifest.json',
  './shalom_logo.jpg',
  './shalom_logo_512x512.png',
  './shalom_logo_512x512.jpg',
  './pwa-192x192.png',
  './pwa-512x512.png',
  './pwa-maskable-512x512.png',
  './apple-touch-icon.png',
  './icon.png',
];

function getUniquePrecacheList() {
  const base = Array.isArray(PRECACHE_ASSETS) ? PRECACHE_ASSETS : [];
  return Array.from(new Set(['./', './index.html', ...base]));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const targets = getUniquePrecacheList();

      // Cache core & build-injected assets (HTML, JS, CSS, local fonts, icons, logos, manifest)
      await Promise.allSettled(
        targets.map(async (assetUrl) => {
          try {
            const response = await fetch(assetUrl, { cache: 'reload' });
            if (response && response.ok) {
              await cache.put(assetUrl, response.clone());
              if (assetUrl === './index.html') {
                await cache.put('./', response);
              }
            }
          } catch {
            // Best-effort per entry so a single failure never aborts SW install
          }
        })
      );

      // Runtime safety net: parse index.html if build injection wasn't run
      if (targets.length <= 15) {
        try {
          const res = await fetch('./index.html', { cache: 'no-store' });
          if (res.ok) {
            const html = await res.text();
            const matches = Array.from(
              html.matchAll(/(?:src|href)=["'](\.?\/assets\/[^"']+)["']/g)
            ).map((m) => m[1]);
            await Promise.allSettled(
              Array.from(new Set(matches)).map((u) => cache.add(u))
            );
          }
        } catch {
          // Ignore if offline during install
        }
      }
    })()
  );
  self.skipWaiting();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((name) => {
          // Only purge old SHALOM HTTP caches — never touch IndexedDB or localStorage user data
          if (name !== CACHE_NAME && name.startsWith('shalom-cache-')) {
            return caches.delete(name);
          }
          return Promise.resolve(false);
        })
      )
    )
  );
  self.clients.claim();
});

async function fetchWithQuickTimeout(request, timeoutMs) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timerId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(
      request,
      controller ? { signal: controller.signal, cache: 'no-store' } : { cache: 'no-store' }
    );
    return response;
  } finally {
    if (timerId !== null) clearTimeout(timerId);
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }

  // Only handle same-origin HTTP/HTTPS app resources; external APIs (Wikimedia, OpenLibrary, etc.) pass straight through
  if (!url.protocol.startsWith('http') || url.origin !== self.location.origin) return;

  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('/@vite') ||
    url.pathname.includes('/@react-refresh') ||
    url.pathname.includes('/src/') ||
    url.pathname.includes('/node_modules/')
  ) {
    return;
  }

  // 1. HTML / SPA navigation: fast network attempt with instant offline cache fallback (prevents infinite loading)
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetchWithQuickTimeout(event.request, 4000);
          if (networkResponse && networkResponse.ok) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, copy.clone());
              cache.put('./index.html', copy);
            });
            return networkResponse;
          }
        } catch {
          // Offline or network timeout -> serve cached app shell immediately
        }

        const cachedExact = await caches.match(event.request, { ignoreSearch: true });
        if (cachedExact) return cachedExact;

        const cachedIndex =
          (await caches.match('./index.html')) || (await caches.match('./'));
        if (cachedIndex) return cachedIndex;

        return new Response(
          '<!doctype html><html lang="fr"><meta charset="utf-8"><title>SHALOM Hors Ligne</title><body style="font-family:sans-serif;padding:24px;text-align:center;"><h2>SHALOM</h2><p>Ouvrez une première fois avec Internet pour enregistrer l’application hors ligne.</p></body></html>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      })()
    );
    return;
  }

  // 2. Hashed static build assets (JS, CSS, local WOFF/WOFF2 fonts): Cache-First for instant offline startup
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(event.request).then(async (cached) => {
        if (cached) return cached;
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.ok) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        } catch {
          return Response.error();
        }
      })
    );
    return;
  }

  // 3. Icons, logos, manifest.json & other local files: Network-with-cache-fallback (never fails silently if cached)
  const fetchInit = url.pathname.endsWith('manifest.json') ? { cache: 'no-store' } : undefined;
  event.respondWith(
    fetchWithQuickTimeout(event.request, 4000)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(event.request, { ignoreSearch: true });
        if (cached) return cached;
        if (fetchInit) {
          const fallbackManifest = await caches.match('./manifest.json');
          if (fallbackManifest) return fallbackManifest;
        }
        return Response.error();
      })
  );
});
