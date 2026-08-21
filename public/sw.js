// Vernier's service worker. Hand written, no next-pwa, which last shipped in
// 2022. Serve it with Cache-Control: no-cache; next.config.ts does that.
const VERSION = 'v2';
const SHELL = `vernier-shell-${VERSION}`;
const OFFLINE = '/offline';

// Only what renders with nothing else in the cache.
//
// The five tab documents used to be on this list, and that was the bug. A page
// document fetched by the install event brings a reference to a build-hash
// chunk that the install event never fetches, so offline it painted "Failed to
// load chunk" over whatever the owner asked for. Precaching those chunks by
// name would only move the rot to the next build.
//
// So the rule is: precache nothing that needs a second request. /offline is a
// self-contained document with its CSS inline and no script bundle, and the
// icons and the manifest are their own bytes. Every route document enters this
// cache the first time it is really loaded, together with the chunks that load
// pulled through the worker, which is the only moment both are known to match.
const SHELL_ASSETS = [
  OFFLINE,
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
        // The document the owner asked for, if he has really loaded it before
        // and its chunks came through this worker with it. Otherwise the
        // offline document, which needs nothing at all.
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
