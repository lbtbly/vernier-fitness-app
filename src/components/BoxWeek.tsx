'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { WarnIcon } from '@/components/icons';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { carryTheCaughtObject, messageOf } from '@/lib/platform-cause';
import { SECOND_PORTION_ANSWERS, type SecondPortionAnswer } from '@/lib/recipe-box';
import { strings } from '@/lib/strings';

/**
 * The second-portion question, asked once per recipe.
 *
 * F90 IS THE SEPARATENESS. Two recipes of two portions produce four meals and
 * TWO questions, and the answers are independent: tomorrow's lunch for one and
 * the freezer for the other is an ordinary week. So each card posts one recipe
 * id, there is no control that answers both, and an answered card keeps showing
 * its own answer rather than a shared state.
 *
 * The answer moves the second portion as a CORRECTION on that meal, so the week
 * changes and the history says where the portion went.
 */

export type BoxRecipe = {
  recipeId: string;
  name: string;
  portions: number;
  answer: SecondPortionAnswer | null;
};

export function BoxWeek({
  recipes,
  placedMeals,
  csrfToken,
}: {
  recipes: BoxRecipe[];
  placedMeals: number;
  csrfToken: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, SecondPortionAnswer | null>>(
    Object.fromEntries(recipes.map((recipe) => [recipe.recipeId, recipe.answer])),
  );
  const [failure, setFailure] = useState<
    | { title: string; detail: string; authored: 'vernier' }
    | { title: string; caught: unknown; authored: 'platform' }
    | null
  >(null);

  async function answer(recipeId: string, value: SecondPortionAnswer) {
    setBusy(recipeId);
    setFailure(null);
    try {
      const response = await fetch('/api/meals/box', {
        method: 'POST',
        headers: { 'content-type': 'application/json', [CSRF_HEADER]: csrfToken },
        body: JSON.stringify({ action: 'answer', recipeId, answer: value }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; detail?: string };
      if (!response.ok) {
        setFailure({
          title: body.error ?? strings.meals.errorTitle,
          detail: body.detail ?? strings.meals.errorBodyRest,
          authored: 'vernier',
        });
        return;
      }
      setAnswers((held) => ({ ...held, [recipeId]: value }));
      router.refresh();
    } catch (error) {
      setFailure({ title: strings.meals.errorTitle, caught: error, authored: 'platform' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div data-box-week="open">
      <p className="note" data-box-placed={placedMeals}>
        {strings.meals.boxPlaced(placedMeals, recipes.length)}
      </p>

      {recipes.map((recipe) => {
        const chosen = answers[recipe.recipeId] ?? null;
        return (
          <section
            className="card"
            key={recipe.recipeId}
            data-box-recipe={recipe.recipeId}
            data-answered={chosen ?? 'none'}
          >
            <div className="head">{strings.meals.secondPortionTitle(recipe.name)}</div>
            <p className="sub">{strings.meals.secondPortionBody}</p>
            <div className="pick" role="group" aria-label={strings.meals.secondPortionAsk(recipe.name)}>
              {SECOND_PORTION_ANSWERS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={chosen === option}
                  disabled={busy === recipe.recipeId}
                  data-answer={option}
                  onClick={() => void answer(recipe.recipeId, option)}
                >
                  <span>{strings.meals.secondPortionAnswers[option]}</span>
                  <span className="note">{strings.meals.secondPortionAnswerNotes[option]}</span>
                </button>
              ))}
            </div>
            <p className="note" style={{ marginTop: 'var(--s2)' }}>
              {chosen === null
                ? strings.meals.secondPortionWaiting(recipe.name)
                : strings.meals.secondPortionStored(
                    recipe.name,
                    strings.meals.secondPortionAnswers[chosen],
                  )}
            </p>
          </section>
        );
      })}

      {failure ? (
        <div className="card error" role="alert" data-state="error">
          <div className="between">
            <span className="lbl">{strings.meals.boxTitle}</span>
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
      ) : null}
    </div>
  );
}
