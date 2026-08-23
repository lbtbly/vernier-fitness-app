'use client';

import { useEffect } from 'react';
import { WarnIcon } from '@/components/icons';
import { strings } from '@/lib/strings';

/**
 * Screen 00's error card, on Eat. The actual failure in words, one button, and
 * a line saying what still works. An error here never implies the rest of the
 * app is down, because it is not.
 */
export default function EatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[vernier] eat screen error', error);
  }, [error]);

  return (
    <div className="card error" role="alert" data-state="error">
      <div className="between">
        <span className="lbl">{strings.tabs.eat}</span>
        <span className="chip a">
          <WarnIcon />
          {strings.error.failedChip}
        </span>
      </div>
      <div className="head">{strings.nutrition.weekErrorTitle}</div>
      <p className="sub">{error.message}</p>
      <p className="sub" style={{ marginTop: 'var(--s2)' }}>
        {strings.nutrition.weekErrorBody}
      </p>
      {error.digest ? (
        <p className="note" style={{ marginTop: 'var(--s2)' }}>
          {strings.error.digestLabel}: <span className="num">{error.digest}</span>
        </p>
      ) : null}
      <div className="actions">
        <button type="button" className="btn primary block" onClick={reset}>
          {strings.error.action}
        </button>
      </div>
    </div>
  );
}
