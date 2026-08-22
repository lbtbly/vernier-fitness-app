// Vernier's service worker. Hand written, no next-pwa, which last shipped in
// 2022. Serve it with Cache-Control: no-cache; next.config.ts does that.
const VERSION = 'v4';
const SHELL = `vernier-shell-${VERSION}`;
const OFFLINE = '/offline';

// --- generated from src/lib/strings.ts by scripts/build-sw.mjs. Do not edit by hand.
// Run `npm run sw` after changing strings.offline in the catalogue.
const COPY = {
  title: 'Offline',
  cardTitle: 'This phone cannot reach the Mac mini',
  causePrefix: 'The app shell is stored on this device, so it opened. Everything else waits for',
  causeSuffix: 'Either this device has left the tailnet, or the Mac mini is asleep or stopped.',
};
// --- end generated ---

/**
 * The last resort, and it says what /offline says.
 *
 * This answers only when the navigation failed, the document is not in the
 * cache and the precached /offline is not either, which happens when the
 * browser evicts Cache Storage under storage pressure. It used to answer the
 * bare word "Offline" as text/plain: a sentence on a screen with no catalogue
 * key, duplicating strings.offline.title with no reference to it. A worker
 * cannot import the catalogue, so the copy is written in above at build time
 * and scripts/build-sw.mjs keeps it equal to the catalogue.
 *
 * The host is not copy. It is read from the origin this worker was installed
 * on, which is the same value the served /offline document prints.
 */
function offlineDocument() {
  const escape = (value) =>
    String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0A0A0B">
<meta name="robots" content="noindex">
<title>${escape(COPY.title)}</title>
<style>html{background:#0A0A0B;color:#F4F4F5;font:16px/1.5 -apple-system,system-ui,sans-serif}body{margin:0;padding:24px}h1{font-size:22px;margin:0 0 12px}p{margin:0;color:#A1A1AA}</style>
</head>
<body>
<h1>${escape(COPY.cardTitle)}</h1>
<p>${escape(COPY.causePrefix)} <b>${escape(self.location.host)}</b>. ${escape(COPY.causeSuffix)}</p>
</body>
</html>
`;
}

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
          || new Response(offlineDocument(), {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
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

// ---------------------------------------------------------------------------
// Trigger 6 of the outbox's six: a push wakes this worker while the app is
// closed, and that is the only background execution iOS offers. Draining the
// queue here is legitimate as long as the notification the push was for is
// still shown, so both happen and the notification happens either way.
//
// The store, the key and the Idempotency-Key header are the same ones
// src/lib/outbox.ts uses. Written out longhand because a worker cannot import
// the module, and kept to the minimum that a background wake can be trusted
// with: send, drop on success, leave everything else exactly where it is for
// the foreground flusher to deal with.
const OUTBOX_DB = 'vernier';
const OUTBOX_STORE = 'outbox';
const OUTBOX_META = 'meta';

function openOutbox() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OUTBOX_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(OUTBOX_META)) db.createObjectStore(OUTBOX_META);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function outboxRequest(db, mode, run, storeName) {
  return new Promise((resolve, reject) => {
    const name = storeName || OUTBOX_STORE;
    const tx = db.transaction(name, mode);
    const request = run(tx.objectStore(name));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function drainOutbox() {
  let db;
  try {
    db = await openOutbox();
  } catch {
    return 0;
  }
  let sent = 0;
  try {
    const csrf = (await outboxRequest(db, 'readonly', (store) => store.get('csrf'), OUTBOX_META)) || '';
    const entries = (await outboxRequest(db, 'readonly', (store) => store.getAll()) || [])
      .filter((entry) => !entry.parked)
      .sort((left, right) => left.createdAt - right.createdAt);
    for (const entry of entries) {
      try {
        const response = await fetch(entry.url, {
          method: entry.method,
          headers: { ...entry.headers, 'Idempotency-Key': entry.id, 'x-vernier-csrf': csrf },
          body: entry.body,
        });
        if (response.ok || response.status === 409) {
          await outboxRequest(db, 'readwrite', (store) => store.delete(entry.id));
          sent += 1;
          continue;
        }
      } catch {
        // Still unreachable. Stop the run: order is meaning on this queue.
      }
      break;
    }
  } finally {
    db.close();
  }
  return sent;
}

self.addEventListener('push', (event) => {
  const payload = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return {};
    }
  })();

  event.waitUntil((async () => {
    await drainOutbox();
    if (payload.title) {
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        tag: payload.tag,
        data: payload.data,
      });
    }
  })());
});
