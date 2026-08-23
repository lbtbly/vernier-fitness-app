'use client';

import { useEffect } from 'react';

/**
 * Ask the worker to fill its media cache, from a screen only the owner sees.
 *
 * F66 wants the movement catalogue usable in a basement gym with no signal, and
 * the worker precaches all 44 demonstrations at install to do it. There is one
 * hole in "at install": /movements is behind the session gate, so a worker that
 * installed on the sign-in screen fetched 44 redirects to /sign-in, cached none
 * of them, and would not install again until its own script changed. The same
 * hole reopens whenever the browser evicts Cache Storage under storage
 * pressure, which is not hypothetical on a phone.
 *
 * So the app asks. This renders inside the shell layout, which redirects anyone
 * without a live session before it renders anything, so the request carries the
 * owner's cookie by construction. A fill with nothing missing is one Cache
 * Storage read and no network at all.
 *
 * It sends a message and reads no answer. The proof that the cache is full is
 * not a number this component could print: it is tests/e2e/catalogue-offline
 * taking the network away and rendering a movement it never scrolled to.
 */
const FILL_THE_MEDIA_CACHE = 'PRECACHE_MEDIA';

export function PrecacheDemonstrations() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let cancelled = false;
    void navigator.serviceWorker.ready
      .then((registration) => {
        if (cancelled) return;
        const worker = navigator.serviceWorker.controller ?? registration.active;
        worker?.postMessage(FILL_THE_MEDIA_CACHE);
      })
      .catch(() => {
        // No worker on this browser, or registration failed and said so from
        // ServiceWorker.tsx. The catalogue still renders online either way.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
