'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { strings } from '@/lib/strings';

/**
 * An edit, which appends.
 *
 * It sends the same route the quick log sends, with the same anti-forgery
 * header and the same idempotency key, and what comes back is a chain one row
 * longer. The original is never touched and cannot be: the table refuses UPDATE
 * at the database, so this form has no way to overwrite anything even if it
 * were written to try.
 *
 * A refusal is drawn as screen 00's error card and never as a status code. It
 * used to render whatever the route sent, which for an unhandled failure was
 * nothing at all, so the screen read "HTTP 500" in body text: no cause, no
 * action, no card. The route now always answers with both halves, and this
 * draws both halves plus the one action, which is to try again with a number
 * the range allows.
 */

type Failure = { error: string; detail: string };

export function CorrectionForm({
  measurementId,
  currentValue,
  unit,
  csrfToken,
}: {
  measurementId: string;
  currentValue: string;
  unit: string;
  csrfToken: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentValue);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function submit() {
    setBusy(true);
    setFailure(null);
    try {
      const response = await fetch('/api/log', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [CSRF_HEADER]: csrfToken,
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ action: 'correct', correctsId: measurementId, rawValue: value, reason }),
      });
      if (response.status !== 201) {
        const body = (await response.json().catch(() => ({}))) as { detail?: string; error?: string };
        setFailure({
          error: body.error ?? strings.api.correction.title,
          detail: body.detail ?? strings.api.correction.lead,
        });
        return;
      }
      setFailure(null);
      setReason('');
      router.refresh();
    } catch (error) {
      // The origin went away mid-write. Same card, same shape, and the cause
      // is what the browser actually said rather than a number.
      setFailure({ error: strings.api.correction.title, detail: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card tight">
      <span className="lbl">{strings.provenance.correctThisValue}</span>
      <label className="formfield" htmlFor="correction-value" style={{ marginTop: 'var(--s2)' }}>
        <span className="lbl">{strings.provenance.correctionValueLabel(unit)}</span>
        <input
          id="correction-value"
          className="input num"
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <label className="formfield" htmlFor="correction-reason">
        <span className="lbl">{strings.provenance.correctionReasonLabel}</span>
        <input
          id="correction-reason"
          className="input"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <button type="button" className="btn block" onClick={() => void submit()} disabled={busy}>
        {busy ? strings.quickLog.saving : strings.provenance.saveCorrection}
      </button>
      {failure ? (
        <div className="card error" data-state="error" style={{ marginTop: 'var(--s3)' }}>
          <div className="between">
            <span className="lbl">{strings.provenance.correctThisValue}</span>
            <span className="chip a">{strings.api.correction.chip}</span>
          </div>
          <div className="head">{failure.error}</div>
          <p className="sub">
            {failure.detail} {strings.api.correction.lead}
          </p>
          <div className="actions">
            <button type="button" className="btn grow" onClick={() => setFailure(null)}>
              {strings.api.correction.retry}
            </button>
          </div>
        </div>
      ) : null}
      <p className="note" style={{ marginTop: 'var(--s2)' }}>
        {strings.provenance.neverOverwritten}
      </p>
    </div>
  );
}
