'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { unitName } from '@/lib/display';
import { carryTheCaughtObject, messageOf } from '@/lib/platform-cause';
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

/**
 * A refusal drawn on the card, and who wrote its cause.
 *
 * `vernier` is the route's own words, a catalogue key travelling as JSON.
 * `platform` is the browser's, from a write that never reached the machine.
 * The marker is set at the branch that knows, the same way the quick log sets
 * it, because the check that reads this screen has to tell them apart by
 * provenance and cannot tell them apart by looking. And the platform branch
 * carries the caught OBJECT rather than its message: a claim about a string is
 * answered by manufacturing a string, and this run has watched that happen
 * twice. src/lib/platform-cause.ts holds the reasoning.
 */
type Failure =
  | { error: string; detail: string; authored: 'vernier' }
  | { error: string; caught: unknown; authored: 'platform' };

/** The one request this form writes through, named once so the marker cannot drift from it. */
const LOG_ENDPOINT = '/api/log';

export function CorrectionForm({
  measurementId,
  currentValue,
  unit,
  csrfToken,
}: {
  measurementId: string;
  currentValue: string;
  /** The stored unit, `kg` or `point`, not the suffix the value prints beside it. */
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
      const response = await fetch(LOG_ENDPOINT, {
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
          authored: 'vernier',
        });
        return;
      }
      setFailure(null);
      setReason('');
      router.refresh();
    } catch (error) {
      // The origin went away mid-write. Same card, same shape, and the cause is
      // the object the browser rejected with, kept whole so the words on the
      // screen are read off it at render.
      setFailure({ error: strings.api.correction.title, caught: error, authored: 'platform' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card tight">
      <span className="lbl">{strings.provenance.correctThisValue}</span>
      <label className="formfield" htmlFor="correction-value" style={{ marginTop: 'var(--s2)' }}>
        <span className="lbl">{strings.provenance.correctionValueLabel(unitName(unit))}</span>
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
            {failure.authored === 'platform' ? (
              <span data-authored="platform" ref={carryTheCaughtObject(failure.caught)}>
                {messageOf(failure.caught)}
              </span>
            ) : (
              <span data-authored="vernier">{failure.detail}</span>
            )}{' '}
            {strings.api.correction.lead}
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
