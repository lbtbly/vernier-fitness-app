'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EnergyValue, MacroLine } from '@/components/Macros';
import { CloseIcon, EditIcon, OkIcon, WarnIcon } from '@/components/icons';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { addMacros, type MacroSet } from '@/lib/macros';
import { carryTheCaughtObject, messageOf } from '@/lib/platform-cause';
import { strings } from '@/lib/strings';

/**
 * The week, one meal at a time.
 *
 * F86'S "ONE AT A TIME" IS THE WHOLE INTERACTION AND IT IS NOT A DETAIL. Each
 * row carries its own accept, edit and reject, each control posts one meal id,
 * and there is no accept-all anywhere in this component or in the route behind
 * it. One wrong line costs one line.
 *
 * Every row carries energy and all four macronutrients including fibre, which
 * is C12, and a nutrient the food table does not have renders as the word
 * "unknown" rather than as a zero, which is F78. The day total under each card
 * carries the same five, summed the same way: a null does not sum to zero, so a
 * day holding one unknown fibre says unknown rather than a total that quietly
 * counted it as none.
 */

export type MealCard = {
  id: string;
  dayIndex: number;
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  recipeId: string;
  recipeName: string;
  state: 'proposed' | 'accepted' | 'edited' | 'rejected';
  cookMinutes: number;
  lactoseFree: boolean;
  macros: MacroSet;
  coveragePct: number;
  wideRange: boolean;
};

export type DayCard = { dayIndex: number; label: string; meals: MealCard[] };

type Failure =
  | { title: string; detail: string; authored: 'vernier' }
  | { title: string; caught: unknown; authored: 'platform' };

const MEAL_ENDPOINT = '/api/nutrition/meal';
const PLAN_ENDPOINT = '/api/nutrition/plan';

const STATE_OF_CONTROL = {
  accept: 'accepted',
  edit: 'edited',
  reject: 'rejected',
} as const;

export function MealWeek({
  days,
  csrfToken,
  maxCookMinutes,
  confirmed,
}: {
  days: DayCard[];
  csrfToken: string;
  maxCookMinutes: number;
  confirmed: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [minutes, setMinutes] = useState(String(maxCookMinutes));

  const meals = days.flatMap((day) => day.meals);
  const tally = {
    accepted: meals.filter((meal) => meal.state === 'accepted').length,
    edited: meals.filter((meal) => meal.state === 'edited').length,
    waiting: meals.filter((meal) => meal.state === 'proposed').length,
    rejected: meals.filter((meal) => meal.state === 'rejected').length,
  };

  async function post(url: string, body: unknown, marker: string) {
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
          title: answer.error ?? strings.nutrition.weekErrorTitle,
          detail: answer.detail ?? strings.api.nutrition.bodyDetail,
          authored: 'vernier',
        });
        return;
      }
      router.refresh();
    } catch (error) {
      setFailure({ title: strings.nutrition.weekErrorTitle, caught: error, authored: 'platform' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div data-meal-week="open">
      {days.map((day) => {
        const total = day.meals
          .filter((meal) => meal.state !== 'rejected')
          .reduce<MacroSet>((sum, meal) => addMacros(sum, meal.macros), {
            kcal: 0,
            proteinG: 0,
            carbG: 0,
            fatG: 0,
            fibreG: 0,
          });
        return (
          <section key={day.dayIndex} data-day={day.dayIndex}>
            <span className="lbl daylabel">{day.label}</span>
            <div className="card">
              {day.meals.map((meal) => (
                <div className="row mealrow" key={meal.id} data-meal={meal.id} data-state={meal.state}>
                  <div className="stack grow">
                    <Link
                      className="head"
                      href={`/eat/recipe/${encodeURIComponent(meal.recipeId)}?meal=${encodeURIComponent(meal.id)}`}
                      aria-label={strings.nutrition.openMeal(meal.recipeName)}
                    >
                      {meal.recipeName}
                    </Link>
                    <span className="note num">
                      {strings.nutrition.mealLine(
                        [
                          strings.nutrition.slots[meal.slot],
                          strings.nutrition.cookTime(meal.cookMinutes),
                          meal.lactoseFree ? strings.nutrition.lactoseFreeChip : '',
                          strings.nutrition.states[meal.state],
                        ].filter((part) => part !== ''),
                      )}
                    </span>
                    <span className="note num">
                      <EnergyValue kcal={meal.macros.kcal} />
                    </span>
                    <MacroLine macros={meal.macros} />
                  </div>
                  <div className="seg">
                    {(['accept', 'edit', 'reject'] as const).map((control) => {
                      const next = STATE_OF_CONTROL[control];
                      const label =
                        control === 'accept'
                          ? strings.nutrition.acceptMeal(meal.recipeName)
                          : control === 'edit'
                            ? strings.nutrition.editMeal(meal.recipeName)
                            : strings.nutrition.rejectMeal(meal.recipeName);
                      const className =
                        control === 'accept' ? 'ok' : control === 'edit' ? 'ed' : 'no';
                      return (
                        <button
                          key={control}
                          type="button"
                          className={className}
                          aria-pressed={meal.state === next}
                          aria-label={label}
                          disabled={busy === meal.id}
                          data-control={control}
                          onClick={() => void post(MEAL_ENDPOINT, { id: meal.id, state: next }, meal.id)}
                        >
                          {control === 'accept' ? (
                            <OkIcon />
                          ) : control === 'edit' ? (
                            <EditIcon />
                          ) : (
                            <CloseIcon />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="between daytotal" data-day-total={day.dayIndex}>
                <span className="num strong">
                  <EnergyValue kcal={total.kcal} />
                </span>
                <MacroLine macros={total} short />
              </div>
            </div>
          </section>
        );
      })}

      {failure ? (
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
          <p className="sub" style={{ marginTop: 'var(--s2)' }}>
            {strings.nutrition.weekErrorBody}
          </p>
        </div>
      ) : null}

      <p className="note centre" style={{ padding: 'var(--s1) 0 var(--s4)' }}>
        {strings.nutrition.weekClosing}
      </p>

      <div className="stickybar">
        <div className="between">
          <span className="sub" data-tally="true">
            {strings.nutrition.tally(tally.accepted, tally.edited, tally.waiting, tally.rejected)}
          </span>
          <button
            type="button"
            className="btn quiet"
            /*
             * Padding only. The height is the base.
             *
             * This carried min-height 32, transcribed from
             * 08-nutrition-week.html line 185. DESIGN.md 2b resolves that
             * against the sheets: 48 px on every shell screen, and 44 is a floor
             * a control may not go under rather than a size to choose. 32 is
             * under the floor. `.stickybar .btn` already writes the base, so
             * only the padding is left here, which is what keeps the label flush
             * with the right edge of the row the sheet draws.
             */
            style={{ padding: 0 }}
            disabled={busy === 'regenerate'}
            onClick={() =>
              void post(PLAN_ENDPOINT, { action: 'generate', maxCookMinutes: Number(minutes) }, 'regenerate')
            }
          >
            {busy === 'regenerate' ? strings.nutrition.generating : strings.nutrition.regenerate}
          </button>
        </div>
        <label className="formfield" htmlFor="max-cook">
          <span className="lbl">{strings.nutrition.maxCookLabel}</span>
          <input
            id="max-cook"
            className="input num"
            inputMode="numeric"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          />
        </label>
        {confirmed ? (
          <Link className="btn primary block" href="/eat/shopping">
            {strings.nutrition.openShopping}
          </Link>
        ) : (
          <button
            type="button"
            className="btn primary block"
            disabled={busy === 'confirm'}
            onClick={() => void post(PLAN_ENDPOINT, { action: 'confirm' }, 'confirm')}
          >
            {strings.nutrition.confirmWeek}
          </button>
        )}
      </div>
    </div>
  );
}
