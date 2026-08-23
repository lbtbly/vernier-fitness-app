'use client';

import { useEffect } from 'react';
import { CSRF_HEADER } from '@/lib/cookie-names';
import {
  LAST_POSTED_KEY,
  mustRepost,
  repostDecision,
  toBase64Url,
} from '@/lib/push/subscription';

/**
 * What stands in for the event iOS never fires.
 *
 * `ServiceWorkerGlobalScope.pushsubscriptionchange` is `false` for `safari_ios`
 * in browser-compat-data, checked 2026-08-21. The subscription rotates, the
 * endpoint changes, and NOTHING TELLS ANYBODY. Not the page, not the worker,
 * not the push service. Every send after it lands on an endpoint the service no
 * longer recognises, the owner sees notifications stop, and no error appears
 * anywhere on the phone or on the Mac mini.
 *
 * So this reads `pushManager.getSubscription()` on EVERY LAUNCH and re-posts
 * when the endpoint differs from the last one this device sent. The decision is
 * `repostDecision`, which is pure and graded in the unit suite over its three
 * cases; this component is the eyes and the wire.
 *
 * The common case is `unchanged` and it costs one localStorage read. That is
 * the point: cheap enough to run every single time, and running it every single
 * time is the only thing that can stand in for an event that does not exist.
 *
 * It renders nothing and it is mounted from the shell layout, so every screen
 * behind the gate raises it, which is where a Home Screen launch lands.
 */
export function PushLaunchCheck({ csrfToken }: { csrfToken: string }) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let cancelled = false;

    void (async () => {
      let subscription: PushSubscription | null = null;
      try {
        const registration = await navigator.serviceWorker.ready;
        subscription = await registration.pushManager.getSubscription();
      } catch {
        // No worker, no registration, or a browser that has none of this. There
        // is nothing to re-post and nothing to say about it.
        return;
      }
      if (cancelled) return;

      let lastPosted: string | null = null;
      try {
        lastPosted = localStorage.getItem(LAST_POSTED_KEY);
      } catch {
        // Storage refused. Treated as never posted, which costs one request.
      }

      const decision = repostDecision(subscription?.endpoint ?? null, lastPosted);
      if (!mustRepost(decision) || !subscription) return;

      const raw = subscription.toJSON();
      const posted = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: csrfToken },
        body: JSON.stringify({
          subscription: {
            endpoint: subscription.endpoint,
            keys: { p256dh: raw.keys?.p256dh ?? '', auth: raw.keys?.auth ?? '' },
            applicationServerKey: subscription.options.applicationServerKey
              ? toBase64Url(subscription.options.applicationServerKey as ArrayBuffer)
              : '',
          },
        }),
      }).catch(() => null);

      // Only a stored subscription updates the marker. A post that never
      // reached the Mac mini leaves the marker where it was, so the next launch
      // tries again rather than believing a rotation was reported.
      if (posted?.ok) {
        try {
          localStorage.setItem(LAST_POSTED_KEY, subscription.endpoint);
        } catch {
          // See above.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [csrfToken]);

  return null;
}
