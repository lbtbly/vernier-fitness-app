'use client';

import { useEffect } from 'react';
import { WarnIcon } from '@/components/icons';
import { strings } from '@/lib/strings';

/**
 * The error card from .forge/wireframes/00-patterns.html, frame 1, state 4:
 * solid card with an --alert border, the actual failure in words, one button,
 * and a line saying what still works. An error never implies the app is down.
 */
export default function ShellError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[vernier] screen error', error);
  }, [error]);

  return (
    <div className="card error" role="alert">
      <div className="between">
        <span className="lbl">Vernier</span>
        <span className="chip a">
          <WarnIcon />
          Failed
        </span>
      </div>
      <div className="head">{strings.error.title}</div>
      <p className="sub">{error.message}</p>
      <p className="sub" style={{ marginTop: 'var(--s2)' }}>
        {strings.error.lead}
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
