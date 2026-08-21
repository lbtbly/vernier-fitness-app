'use client';

import { useEffect } from 'react';

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
 */
const REPORTED = 'vernier.launch-reported';

export function DeviceReport() {
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ standalone, wakeLock }),
      keepalive: true,
    })
      .then(() => {
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
  }, []);

  return null;
}
