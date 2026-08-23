'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { sourceLabel, unitName } from '@/lib/display';
import { strings } from '@/lib/strings';

/**
 * The control that ANSWERS an import question, which is the half
 * `.forge/AMENDMENTS.md` A2 found missing.
 *
 * F26 was met: a re-import that disagrees with a correction raises a question
 * holding both values and writes nothing. What it had no route out of was the
 * warning itself. `import_question.state` permitted 'answered', no code path
 * set it, and a conflict raised a line on Today that could never be cleared.
 *
 * BOTH VALUES WITH THEIR PROVENANCE, because that is the whole decision. What
 * the owner corrected it to, where that came from and when; what the import
 * sent, from which source and when. He picks one, or types a third number, and
 * the choice writes a correction naming the question. Nothing is preselected:
 * this is not a confirm diff with a safe default, it is two numbers that
 * disagree, and defaulting to either would be the app choosing for him.
 */

type Question = {
  id: string;
  metric: string;
  storedRawValue: string;
  storedUnit: string;
  storedSource: string;
  storedMeasuredAt: string;
  incomingRawValue: string;
  incomingUnit: string;
  incomingSource: string;
  incomingMeasuredAt: string;
};

type Choice = 'stored' | 'incoming' | 'other';

export function QuestionAnswer({
  question,
  unit,
  storedWhen,
  incomingWhen,
  csrfToken,
}: {
  question: Question;
  /** The stored unit, `kg` or `point`, not the suffix a value prints beside it. */
  unit: string;
  storedWhen: string;
  incomingWhen: string;
  csrfToken: string;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ error: string; detail: string } | null>(null);

  const value =
    choice === 'stored'
      ? question.storedRawValue
      : choice === 'incoming'
        ? question.incomingRawValue
        : typed;

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
        body: JSON.stringify({
          action: 'answer',
          questionId: question.id,
          rawValue: value,
          reason,
        }),
      });
      if (response.status !== 201) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
        };
        setFailure({
          error: body.error ?? strings.question.answerFailedTitle,
          detail: body.detail ?? strings.question.answerFailedLead,
        });
        return;
      }
      router.refresh();
    } catch (error) {
      setFailure({
        error: strings.question.answerFailedTitle,
        detail: (error as Error).message,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card tight" data-answer={question.id}>
      <span className="lbl">{strings.question.answerTitle}</span>
      <p className="sub" style={{ margin: 'var(--s2) 0 var(--s3)' }}>
        {strings.question.answerBody}
      </p>

      <fieldset className="field-block" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="lbl" style={{ marginBottom: 'var(--s2)' }}>
          {strings.question.choiceLabel}
        </legend>

        <button
          type="button"
          className="btn block"
          aria-pressed={choice === 'stored'}
          data-choice="stored"
          onClick={() => setChoice('stored')}
          style={choice === 'stored' ? { borderColor: 'var(--accent)' } : undefined}
        >
          <span className="stack grow" style={{ alignItems: 'flex-start' }}>
            <span>
              {strings.question.keepStored}: {question.storedRawValue} {question.storedUnit}
            </span>
            <span className="note">
              {strings.question.provenanceLine(sourceLabel(question.storedSource), storedWhen)}
            </span>
          </span>
        </button>

        <button
          type="button"
          className="btn block"
          aria-pressed={choice === 'incoming'}
          data-choice="incoming"
          onClick={() => setChoice('incoming')}
          style={
            choice === 'incoming'
              ? { borderColor: 'var(--accent)', marginTop: 'var(--s2)' }
              : { marginTop: 'var(--s2)' }
          }
        >
          <span className="stack grow" style={{ alignItems: 'flex-start' }}>
            <span>
              {strings.question.takeIncoming}: {question.incomingRawValue} {question.incomingUnit}
            </span>
            <span className="note">
              {strings.question.provenanceLine(sourceLabel(question.incomingSource), incomingWhen)}
            </span>
          </span>
        </button>

        <button
          type="button"
          className="btn block"
          aria-pressed={choice === 'other'}
          data-choice="other"
          onClick={() => setChoice('other')}
          style={
            choice === 'other'
              ? { borderColor: 'var(--accent)', marginTop: 'var(--s2)' }
              : { marginTop: 'var(--s2)' }
          }
        >
          {strings.question.typeAnother}
        </button>
      </fieldset>

      {choice === 'other' ? (
        <label className="formfield" htmlFor="answer-value">
          <span className="lbl">{strings.question.answerValueLabel(unitName(unit))}</span>
          <input
            id="answer-value"
            className="input num"
            inputMode="decimal"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </label>
      ) : null}

      <label className="formfield" htmlFor="answer-reason">
        <span className="lbl">{strings.question.answerReasonLabel}</span>
        <input
          id="answer-reason"
          className="input"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>

      <button
        type="button"
        className="btn primary block"
        onClick={() => void submit()}
        disabled={busy || choice === null || value.trim() === ''}
      >
        {busy ? strings.question.saving : strings.question.save}
      </button>

      {failure ? (
        <div className="card error" data-state="error" style={{ marginTop: 'var(--s3)' }}>
          <div className="between">
            <span className="lbl">{strings.question.answerTitle}</span>
            <span className="chip a">{strings.api.correction.chip}</span>
          </div>
          <div className="head">{failure.error}</div>
          <p className="sub">{failure.detail}</p>
          <p className="note">{strings.question.answerFailedLead}</p>
          <div className="actions">
            <button type="button" className="btn grow" onClick={() => setFailure(null)}>
              {strings.question.answerRetry}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
