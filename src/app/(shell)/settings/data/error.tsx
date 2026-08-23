'use client';

import { useEffect } from 'react';
import { WarnIcon } from '@/components/icons';
import { strings } from '@/lib/strings';

/**
 * Screen 00's error card, on the operator's own screen.
 *
 * The sentence that matters here is the second one: this screen failing to
 * render says nothing about the archive, and an error that implied last night's
 * backup was gone would send the owner looking for a problem he does not have.
 * Nothing on this screen writes until he presses something on it, so a failed
 * read has changed nothing at all.
 */
export default function DataError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[vernier] data screen error', error);
  }, [error]);

  return (
    <div className="card error" role="alert" data-state="error">
      <div className="between">
        <span className="lbl">{strings.data.title}</span>
        <span className="chip a">
          <WarnIcon />
          {strings.error.failedChip}
        </span>
      </div>
      <div className="head">{strings.data.errorTitle}</div>
      <p className="sub">{error.message}</p>
      <p className="sub" style={{ marginTop: 'var(--s2)' }}>
        {strings.data.errorBody}
      </p>
      <div className="actions">
        <button type="button" className="btn primary block" onClick={reset}>
          {strings.error.action}
        </button>
      </div>
    </div>
  );
}
