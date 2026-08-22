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
 * off this request. That token was not enough on its own, because the
 * middleware mints one for any caller who asks: the verifier wrote the row
 * with four lines of curl, no browser and no session, using a pair minted by
 * one unauthenticated GET of /sign-in.
 *
 * SO THE POST CARRIES A TICKET AS WELL, AND THIS COMPONENT ONLY EXISTS WHEN
 * THERE IS ONE. The layout mints it for the session the document was rendered
 * for and renders nothing here without one, so the sign-in screen raises no
 * report at all. A caller that never held a page of this app cannot produce the
 * value, and the route refuses the report without it.
 *
 * The third boolean stays: whether something is driving this browser. The
 * platform answers that itself in `navigator.webdriver`, the server stores
 * nothing for a report that says yes, and the field is required, so a caller
 * that is not this component is refused as malformed rather than believed.
 */
const REPORTED = 'vernier.launch-reported';

export function DeviceReport({
  csrfToken,
  launchTicket,
}: {
  csrfToken: string;
  launchTicket: string;
}) {
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
    // The platform's own answer to "is something driving this browser". True
    // under WebDriver and under the DevTools protocol, false for a person
    // tapping an icon, and reported honestly here rather than filtered: the
    // server decides what to do with it.
    const webdriver = navigator.webdriver === true;

    fetch('/api/diagnostics/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: csrfToken },
      body: JSON.stringify({ standalone, wakeLock, webdriver, ticket: launchTicket }),
      keepalive: true,
    })
      .then(async (response) => {
        // A refused post wrote nothing, so this launch has not been reported
        // and the next one must try again. So did a 200 carrying
        // `recorded: false`, which is what a driven browser is answered with:
        // the request succeeded and the row did not move. A believed report
        // says `recorded: true` and names the signals as the rows now read.
        if (!response.ok) return;
        const outcome = (await response.json().catch(() => null)) as { recorded?: boolean } | null;
        if (outcome?.recorded !== true) return;
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
  }, [csrfToken, launchTicket]);

  return null;
}
