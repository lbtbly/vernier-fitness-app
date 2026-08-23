'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { WarnIcon } from '@/components/icons';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { carryTheCaughtObject, messageOf } from '@/lib/platform-cause';
import { strings } from '@/lib/strings';

/**
 * The two decisions a recipe screen offers, and neither of them writes over a
 * stored figure.
 *
 * THE SWAP moves the meal onto the snapshot computed from the free-from
 * ingredient rows. It does not adjust a number: the plant dessert that replaces
 * fromage blanc is a different Anses row with a different energy, a different
 * protein and no published fibre at all, so the macronutrients that come back
 * are recomputed and the fibre coverage moves with them. F85.
 *
 * THE ANSWER settles a question raised because an ingredient's source hash
 * changed. Recompute writes the next version beside the old one and supersedes
 * it; keep records that the owner looked and decided. The trigger in 0009
 * refuses anything else, so there is no third path even for a future handler.
 */

type Failure =
  | { title: string; detail: string; authored: 'vernier' }
  | { title: string; caught: unknown; authored: 'platform' };

const MEAL_ENDPOINT = '/api/nutrition/meal';
const QUESTION_ENDPOINT = '/api/nutrition/question';

function useWriter(csrfToken: string) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function post(url: string, body: unknown, marker: string, fallbackTitle: string) {
    setBusy(marker);
    setFailure(null);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [CSRF_HEADER]: csrfToken },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const answer = (await response.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
        };
        setFailure({
          title: answer.error ?? fallbackTitle,
          detail: answer.detail ?? strings.api.nutrition.bodyDetail,
          authored: 'vernier',
        });
        return;
      }
      router.refresh();
    } catch (error) {
      setFailure({ title: fallbackTitle, caught: error, authored: 'platform' });
    } finally {
      setBusy(null);
    }
  }

  return { busy, failure, post };
}

function FailureCard({ failure }: { failure: Failure }) {
  return (
    <div className="card error" role="alert" data-state="error">
      <div className="between">
        <span className="lbl">{strings.tabs.eat}</span>
        <span className="chip a">
          <WarnIcon />
          {strings.error.failedChip}
        </span>
      </div>
      <div className="head">{failure.title}</div>
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
  );
}

export function LactoseFreeSwap({
  mealId,
  lactoseFree,
  dairyName,
  freeFromName,
  csrfToken,
}: {
  mealId: string;
  lactoseFree: boolean;
  dairyName: string;
  freeFromName: string;
  csrfToken: string;
}) {
  const { busy, failure, post } = useWriter(csrfToken);
  return (
    <div data-swap={lactoseFree ? 'applied' : 'available'}>
      <button
        type="button"
        className="btn block"
        disabled={busy === 'swap'}
        data-control="lactose-free"
        onClick={() =>
          void post(
            MEAL_ENDPOINT,
            { id: mealId, lactoseFree: !lactoseFree },
            'swap',
            strings.nutrition.weekErrorTitle,
          )
        }
      >
        {lactoseFree
          ? strings.nutrition.lactoseFreeUndo(dairyName, freeFromName)
          : strings.nutrition.lactoseFreeSwap(dairyName, freeFromName)}
      </button>
      {lactoseFree ? (
        <p className="note" style={{ marginTop: 'var(--s2)' }} data-swap-state="chosen">
          {strings.nutrition.lactoseFreeChosen(freeFromName)}
        </p>
      ) : null}
      {failure ? <FailureCard failure={failure} /> : null}
    </div>
  );
}

export function SourceChangeQuestion({
  questionId,
  storedHash,
  incomingHash,
  csrfToken,
}: {
  questionId: string;
  storedHash: string;
  incomingHash: string;
  csrfToken: string;
}) {
  const { busy, failure, post } = useWriter(csrfToken);
  return (
    <section className="card" data-question={questionId} data-state="question">
      <div className="between">
        <span className="lbl">{strings.nutrition.sourceChanged}</span>
        <span className="chip w">
          <WarnIcon />
          {strings.nutrition.questionChip}
        </span>
      </div>
      <p className="sub" style={{ marginTop: 'var(--s2)' }}>
        {strings.nutrition.sourceChangedBody}
      </p>
      <p className="note mono" style={{ marginTop: 'var(--s2)' }}>
        {strings.nutrition.sourceChangedHashes(storedHash, incomingHash)}
      </p>
      <div className="actions">
        <button
          type="button"
          className="btn primary"
          disabled={busy !== null}
          data-answer="recomputed"
          onClick={() =>
            void post(
              QUESTION_ENDPOINT,
              { id: questionId, answer: 'recomputed' },
              'recompute',
              strings.nutrition.weekErrorTitle,
            )
          }
        >
          {strings.nutrition.recompute}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy !== null}
          data-answer="kept"
          onClick={() =>
            void post(
              QUESTION_ENDPOINT,
              { id: questionId, answer: 'kept' },
              'keep',
              strings.nutrition.weekErrorTitle,
            )
          }
        >
          {strings.nutrition.keepSnapshot}
        </button>
      </div>
      {failure ? <FailureCard failure={failure} /> : null}
    </section>
  );
}
