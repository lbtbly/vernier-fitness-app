'use client';

import { useEffect } from 'react';
import { WarnIcon } from '@/components/icons';
import { strings } from '@/lib/strings';

/**
 * Screen 00's error card, on the reminders list. Reminders that are already
 * scheduled are unaffected by a page that did not render, and the card says so
 * rather than implying the whole thing is down.
 */
export default function RemindersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[vernier] reminders screen error', error);
  }, [error]);

  return (
    <div className="card error" role="alert" data-state="error">
      <div className="between">
        <span className="lbl">{strings.reminders.title}</span>
        <span className="chip a">
          <WarnIcon />
          {strings.error.failedChip}
        </span>
      </div>
      <div className="head">{strings.reminders.errorTitle}</div>
      <p className="sub">{error.message}</p>
      <p className="sub" style={{ marginTop: 'var(--s2)' }}>
        {strings.reminders.errorBody}
      </p>
      <div className="actions">
        <button type="button" className="btn primary block" onClick={reset}>
          {strings.error.action}
        </button>
      </div>
    </div>
  );
}
