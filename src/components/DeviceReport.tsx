'use client';

import { useEffect } from 'react';
import { CSRF_HEADER } from '@/lib/cookie-names';

/**
 * Reports how this launch was opened, once per launch.
 *
 * C2 asks whether the app opens from the iPhone Home Screen icon with no
 * browser chrome. Only the browser can answer that, and a screenshot of the
 * answer is testimony. This posts the answer to the machine, where a command
 * can read it back later.
 *
 * Two values, both booleans, both about this device and nothing about the
 * person holding it. Offline the post fails and is dropped: the next launch
 * that reaches the Mac mini reports again.
 *
 * The post writes, so it carries the anti-forgery token the root layout read
 * off this request. Nothing but a document this server rendered can produce
 * one, which is what makes the stored row worth reading back as evidence.
 */
const REPORTED = 'vernier.launch-reported';

export function DeviceReport({ csrfToken }: { csrfToken: string }) {
  useEffect(() => {
    let alreadyReported = false;
    try {
      alreadyReported = sessionStorage.getItem(REPORTED) === '1';
    } catch {
      // Private mode with storage refused. Reporting twice is harmless.
    }
    if (alreadyReported) return;

    // The standard signal, plus Apple's own, which is what an iPhone opened
    // from the Home Screen still answers to.
    const legacyStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const standalone = window.matchMedia('(display-mode: standalone)').matches || legacyStandalone;
    const wakeLock = 'wakeLock' in navigator;

    fetch('/api/diagnostics/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: csrfToken },
      body: JSON.stringify({ standalone, wakeLock }),
      keepalive: true,
    })
      .then((response) => {
        // A refused post wrote nothing, so this launch has not been reported
        // and the next one must try again.
        if (!response.ok) return;
        try {
          sessionStorage.setItem(REPORTED, '1');
        } catch {
          // See above.
        }
      })
      .catch(() => {
        // The Mac mini is unreachable. Nothing to tell the owner: this is
        // bookkeeping, and the offline screen already says what is happening.
      });
  }, [csrfToken]);

  return null;
}
