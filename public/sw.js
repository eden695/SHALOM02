// Service Worker for SHALOM - Offline Christian Companion (APK/Web/PWA compatible)
const CACHE_NAME = 'shalom-cache-v14';
const CORE_ASSETS = [
  './',
  './index.html',
  './shalom_logo.jpg',
  './shalom_logo_512x512.png',
  './shalom_logo_512x512.jpg',
  './pwa-192x192.png',
  './pwa-512x512.png',
  './pwa-maskable-512x512.png',
  './apple-touch-icon.png',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        await cache.addAll(CORE_ASSETS);
      } catch (err) {
        console.warn('Pre-cache core warning:', err);
      }
      // Also inspect ./index.html and pre-cache built JS/CSS/font chunks for full offline reload
      try {
        const res = await fetch('./index.html', { cache: 'no-store' });
        if (res.ok) {
          const html = await res.text();
          const assetMatches = Array.from(
            html.matchAll(/(?:src|href)=["'](\.?\/assets\/[^"']+)["']/g)
          ).map((m) => m[1]);
          const uniqueAssets = Array.from(new Set(assetMatches));
          if (uniqueAssets.length > 0) {
            await Promise.allSettled(
              uniqueAssets.map((assetUrl) => cache.add(assetUrl))
            );
          }
        }
      } catch {
        // offline install fallback
      }
    })
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
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
          return Promise.resolve(false);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
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

  // Navigation / HTML: network-first AND save successful copy in cache for offline fallback
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, copy.clone());
              cache.put('./index.html', copy);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const fallback = await caches.match('./index.html');
          return fallback || Response.error();
        })
    );
    return;
  }

  const fetchOptions = url.pathname.endsWith('manifest.json')
    ? { cache: 'no-store' }
    : {};

  // Static assets: cache-first for /assets/ hashed chunks, network-first for others
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request, fetchOptions)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        return cached || Response.error();
      })
  );
});
