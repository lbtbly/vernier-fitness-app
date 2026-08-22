'use client';

import { useEffect, useState } from 'react';
import { CloudOffIcon } from '@/components/icons';
import { depth, subscribe } from '@/lib/outbox';
import { strings } from '@/lib/strings';

/**
 * The queue count, on Today, with the sheet closed.
 *
 * Screen 03 frame 2 puts it exactly here: at the top of Today, under the date,
 * before anything else, reading "Offline. 3 entries saved on this phone." The
 * count used to live only inside the quick-log sheet, and `save()` closes the
 * sheet, so the one moment the owner most needs to be told his three entries
 * are safe was the one moment nothing said so.
 *
 * It is a count and never a mode. Nothing here asks whether the phone is
 * online, nothing here changes what Save does, and when the queue is empty
 * this renders nothing at all rather than a green "connected" badge. The words
 * are the sheet's own words, from one key, so the banner and the sheet can
 * never disagree about how many entries are waiting.
 */
export function OutboxBanner() {
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    const refresh = () => {
      void depth().then(setQueued);
    };
    const unsubscribe = subscribe(refresh);
    refresh();
    return unsubscribe;
  }, []);

  if (queued === 0) return null;

  return (
    <div className="banner" data-state="offline" aria-live="polite">
      <CloudOffIcon />
      <div className="grow">
        <b>{strings.quickLog.offlineTitle}</b> {strings.quickLog.offlineBody(queued)}
      </div>
    </div>
  );
}
