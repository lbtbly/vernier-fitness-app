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
 */
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
  const [failure, setFailure] = useState<string | null>(null);

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
        setFailure(body.detail ?? body.error ?? `HTTP ${response.status}`);
        return;
      }
      setReason('');
      router.refresh();
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
        <p className="sub alert" style={{ marginTop: 'var(--s2)' }}>
          {failure}
        </p>
      ) : null}
      <p className="note" style={{ marginTop: 'var(--s2)' }}>
        {strings.provenance.neverOverwritten}
      </p>
    </div>
  );
}
