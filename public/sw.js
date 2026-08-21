// Vernier's service worker. Hand written, no next-pwa, which last shipped in
// 2022. Serve it with Cache-Control: no-cache; next.config.ts does that.
const VERSION = 'v1';
const SHELL = `vernier-shell-${VERSION}`;
const OFFLINE = '/offline';
const SHELL_ASSETS = [
  '/', '/health', '/train', '/eat', '/settings', '/sign-in', OFFLINE,
  '/manifest.webmanifest',
  '/icons/vernier-mark.svg',
  '/icons/apple-touch-icon-180.png',
  '/icons/icon-192.png',
  '/favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(SHELL_ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== SHELL).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Swapping the bundle out from under a running session is never the worker's
// call. The app asks when it is safe.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Liveness must reach the origin or it is not liveness, and the worker
  // script is never served from a cache.
  if (url.pathname === '/healthz' || url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        (await caches.open(SHELL)).put(request, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(request, { ignoreSearch: true }))
          || (await caches.match(OFFLINE))
          || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const hit = await caches.match(request);
    if (hit) return hit;
    const fresh = await fetch(request);
    if (fresh.ok && fresh.type === 'basic') (await caches.open(SHELL)).put(request, fresh.clone());
    return fresh;
  })());
});
