'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { CloudOffIcon } from '@/components/icons';
import { readJustLogged, subscribeJustLogged } from '@/lib/just-logged';
import { depth, subscribe } from '@/lib/outbox';
import { strings } from '@/lib/strings';

/**
 * The two things on Today that only this phone knows: how many of the owner's
 * writes are still on it, and what he wrote a moment ago.
 *
 * THE OFFLINE LINE IS NOT A NOTICE, AND THAT IS A RULING. It shipped inside the
 * warn notice region for one round, which bounded its height and cost it all
 * three of the things DESIGN.md section 4 asks of it. `.forge/RULING-SLICE-4.md`
 * question 2 refused the merge on the colour, on the hidden number and on the
 * copy: a queue that uploads itself needs no attention, F24 wants the count
 * visible rather than one tap under a disclosure, and "2 things are waiting on
 * you" is false, because they are waiting on the network. So it is back under
 * the title, neutral, one line, with the count on it, in screen 02 frame 3's own
 * words.
 *
 * ITS HEIGHT IS STILL FIXED BY CONSTRUCTION, WHICH IS THE AMENDED F27. The line
 * is `.queue-line`, clamped in the stylesheet to two lines of body copy: one
 * queued entry and 999,999 queued entries draw the same box, and no copy anybody
 * writes later can grow it. Bounded is not the same as collapsed, and the
 * distinction is the whole of the ruling.
 */

/** How many of the owner's writes are still on this phone. */
function useQueueDepth(): number {
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    const refresh = () => {
      void depth().then(setQueued);
    };
    const unsubscribe = subscribe(refresh);
    refresh();
    return unsubscribe;
  }, []);

  return queued;
}

/**
 * What was just written, from the store two components share.
 *
 * The server snapshot is null, deliberately: nothing was just logged on the
 * server, so the first client render agrees with the markup it hydrates and
 * "What happens next" never flashes onto a screen that did not ask for it.
 */
export function useJustLogged() {
  const subscribeToStore = useCallback((listener: () => void) => subscribeJustLogged(listener), []);
  return useSyncExternalStore(subscribeToStore, readJustLogged, () => null);
}

/**
 * DESIGN.md section 4's offline line, under the title, with the count on it.
 *
 * It follows the queue rather than `navigator.onLine`, because the fact worth
 * saying is not that a radio is off: it is that something of the owner's is
 * unsent. A phone on a captive-portal wifi is online by that flag and cannot
 * reach the Mac mini, and a phone in a lift with an empty queue has nothing to
 * report.
 */
export function OfflineBanner() {
  const queued = useQueueDepth();
  if (queued === 0) return null;

  return (
    <div className="banner queue" data-state="offline" data-queued={queued} aria-live="polite">
      <CloudOffIcon />
      <p className="grow queue-line">
        <b>{strings.todayLog.queueTitle}</b> {strings.todayLog.queueBody(queued)}
      </p>
    </div>
  );
}

/**
 * Screen 03 frame 2's dashed card, and A6 puts it below the weight card rather
 * than above it: it explains a queue the owner has already been told about on
 * the line under the title, so it is a thing you read after the trend and never
 * before it.
 *
 * It is drawn while the entry is still queued and not for as long as anything is
 * queued, because that is the moment screen 03 frame 2 draws.
 */
export function WhatHappensNext() {
  const justLogged = useJustLogged();
  if (!justLogged || justLogged.state !== 'queued') return null;

  return (
    <section className="card empty" data-card="what-happens-next">
      <span className="lbl">{strings.todayLog.whatHappensNextLabel}</span>
      <p className="sub" style={{ marginTop: 'var(--s2)' }}>
        {strings.todayLog.whatHappensNext}
      </p>
    </section>
  );
}
