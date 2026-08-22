'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { carryTheCaughtObject, messageOf } from '@/lib/platform-cause';
import { strings } from '@/lib/strings';

/**
 * The goal, edited from Health.
 *
 * Two fields, one save, and the trajectory on every chart is redrawn on the
 * next render because there is no cached curve: the line is arithmetic over two
 * points and is computed where it is drawn. `router.refresh()` is what makes
 * that one page load rather than two.
 *
 * The refusal card is screen 00's error state, drawn the same way
 * `CorrectionForm` draws it, and the platform branch carries the caught object
 * rather than its message for the same reason: a claim about a string can be
 * answered by manufacturing a string, and this run has watched that happen.
 */

type Failure =
  | { error: string; detail: string; authored: 'vernier' }
  | { error: string; caught: unknown; authored: 'platform' };

const GOAL_ENDPOINT = '/api/goal';

export function GoalEditor({
  targetValue,
  targetDate,
  unit,
  csrfToken,
}: {
  targetValue: string;
  /** The calendar day the date field holds, "2027-03-29". */
  targetDate: string;
  unit: string;
  csrfToken: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(targetValue);
  const [date, setDate] = useState(targetDate);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function submit() {
    setBusy(true);
    setFailure(null);
    setSaved(false);
    try {
      const response = await fetch(GOAL_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [CSRF_HEADER]: csrfToken },
        body: JSON.stringify({ targetValue: value, targetDate: date }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { detail?: string; error?: string };
        setFailure({
          error: body.error ?? strings.goal.refusedTitle,
          detail: body.detail ?? strings.api.goal.bodyDetail,
          authored: 'vernier',
        });
        return;
      }
      setSaved(true);
      router.refresh();
    } catch (error) {
      setFailure({ error: strings.goal.refusedTitle, caught: error, authored: 'platform' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-goal-editor="open">
      <label className="formfield" htmlFor="goal-value">
        <span className="lbl">{strings.goal.targetValueLabel(unit)}</span>
        <input
          id="goal-value"
          className="input num"
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <label className="formfield" htmlFor="goal-date">
        <span className="lbl">{strings.goal.targetDateLabel}</span>
        <input
          id="goal-date"
          className="input num"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <button type="button" className="btn primary block" onClick={() => void submit()} disabled={busy}>
        {busy ? strings.goal.saving : strings.goal.save}
      </button>
      {saved && !failure ? (
        <p className="note" data-goal="saved" style={{ marginTop: 'var(--s2)' }}>
          {strings.goal.saved}
        </p>
      ) : null}
      {failure ? (
        <div className="card error" data-state="error" style={{ marginTop: 'var(--s3)' }}>
          <div className="head">{failure.error}</div>
          <p className="sub">
            {failure.authored === 'platform' ? (
              <span data-authored="platform" ref={carryTheCaughtObject(failure.caught)}>
                {messageOf(failure.caught)}
              </span>
            ) : (
              <span data-authored="vernier">{failure.detail}</span>
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}
