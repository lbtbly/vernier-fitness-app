'use client';

import { useEffect } from 'react';

/**
 * Registers the hand-written worker at the root scope with updateViaCache off,
 * so the browser never serves the worker script from its own HTTP cache. C3
 * reads both the scope and the response headers.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch((error: unknown) => {
          console.error('[vernier] service worker registration failed', error);
        });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
