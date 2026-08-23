import Link from 'next/link';
import { BoxWeek, type BoxRecipe } from '@/components/BoxWeek';
import { EmptyState } from '@/components/EmptyState';
import { MacroLine } from '@/components/Macros';
import { MealWeek, type DayCard, type MealCard } from '@/components/MealWeek';
import { OfflineBanner } from '@/components/Queue';
import { ScreenTitle } from '@/components/ScreenTitle';
import { SourceChip } from '@/components/SourceChip';
import { TakeawaySlots } from '@/components/TakeawaySlots';
import { InfoIcon, WarnIcon } from '@/components/icons';
import { readBoxItems, readProposals } from '@/db/box';
import { readDayEntries } from '@/db/meals';
import {
  DEFAULT_MAX_COOK_MINUTES,
  nextWeekStart,
  readPlan,
  readPlanMeals,
  readRules,
  readTarget,
} from '@/db/nutrition';
import { readCurrentSnapshots, readOpenQuestions, readRecipes } from '@/db/recipes';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import type { RuleSet } from '@/lib/dietary-rules';
import { aliasById } from '@/lib/food-aliases';
import { daysBetween, longDate, shortDate, time24 } from '@/lib/format';
import { energyText, type MacroSet } from '@/lib/macros';
import { dishName } from '@/lib/takeaway';
import type { SecondPortionAnswer } from '@/lib/recipe-box';
import { DAYS_IN_WEEK } from '@/lib/menu-week';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';
export const metadata = { title: strings.tabs.eat };

/** How old a generated week has to be before the screen says so. */
const STALE_AFTER_DAYS = 2;

/**
 * The nutrition week, screen 08.
 *
 * FIVE STATES, ONE PATTERN, ALL OF THEM HERE. The skeleton in loading.tsx at
 * this screen's own geometry, the dashed empty card when no week has been
 * generated, the error card in error.tsx, the offline line under the title with
 * the queue count on it, and the stale notice when the plan was generated days
 * ago and the weight it was computed against has moved.
 *
 * THE TARGET CARD SHOWS ITS WORKING, AND THAT IS A DELIBERATE DEPARTURE FROM
 * THE SHEET. `08-nutrition-week.html` writes "Computed from your 28-day weight
 * trend and what you actually ate, not from a formula", and F80 says the
 * opposite in as many words: daily targets compute from the Mifflin-St Jeor
 * equation with an activity level from the published 1.40 to 1.90 bands. Where a
 * sheet and a rubric line disagree the line wins, so the card names the
 * equation, the level and the band, and links to the screen that sets them.
 */

/**
 * The energy eaten today, or unknown.
 *
 * A null does not sum to zero here any more than it does on a meal row: a day
 * holding one entry whose energy the food table cannot give is a day whose
 * total is unknown, and printing the rest of it as if it were the whole would
 * be the smoothing this product refuses. `addMacros` applies the same rule one
 * level up.
 */
function eatenKcal(entries: { kcal: number | null }[]): number | null {
  let total = 0;
  for (const entry of entries) {
    if (entry.kcal === null) return null;
    total += entry.kcal;
  }
  return total;
}

/** The four rules, summarised over the week that was actually generated. */
function ruleSentences(rules: RuleSet, lactoseFreeDays: number, preferredDays: number): string[] {
  const parts: string[] = [];
  const names = strings.nutrition.ruleSubjects;
  for (const subject of rules.allergy) parts.push(strings.nutrition.ruleAllergy(names[subject]));
  for (const subject of rules.exclusion) parts.push(strings.nutrition.ruleExcluded(names[subject]));
  for (const subject of rules.intolerance) {
    parts.push(strings.nutrition.ruleIntolerance(names[subject], lactoseFreeDays));
  }
  for (const subject of rules.preference) {
    parts.push(strings.nutrition.rulePreference(names[subject], preferredDays));
  }
  return parts;
}

export default async function EatPage() {
  const { timeZone } = getConfig();
  const csrfToken = await readCsrfToken();
  const now = new Date();
  const weekStart = nextWeekStart(now, timeZone);
  const weekEnd = new Date(weekStart.getTime() + (DAYS_IN_WEEK - 1) * 86_400_000);

  const [plan, target, rules, questions, eaten, boxItems, proposals, recipes] = await Promise.all([
    readPlan(weekStart),
    readTarget(),
    readRules(),
    readOpenQuestions(),
    // What was actually eaten today, which is what screen 09 frame 3 draws at
    // the top of this tab: the day, then the week under it.
    readDayEntries(now, timeZone),
    readBoxItems(weekStart),
    readProposals(weekStart),
    readRecipes(),
  ]);
  const recipeById = new Map(recipes.map((view) => [view.id, view]));

  const rangeLabel = strings.nutrition.weekRange(
    shortDate(weekStart, timeZone),
    shortDate(weekEnd, timeZone),
  );

  const targetMacros: MacroSet | null = target
    ? {
        kcal: target.kcalTarget,
        proteinG: target.proteinG,
        carbG: target.carbG,
        fatG: target.fatG,
        fibreG: target.fibreG,
      }
    : null;

  const header = (
    <>
      <ScreenTitle label={rangeLabel} title={strings.nutrition.weekTitle} />
      <OfflineBanner />
      {target && targetMacros ? (
        <section className="card tight" data-card="target">
          <div className="between">
            <div className="stack">
              <span className="big num">
                {new Intl.NumberFormat('en-GB').format(target.kcalTarget)}{' '}
                <span className="sub">{strings.units.kcal}</span>
              </span>
              <span className="note">{strings.nutrition.dailyTarget}</span>
            </div>
            <div className="stack" style={{ alignItems: 'flex-end' }}>
              <span className="big num">
                {target.rateKgPerWeek > 0
                  ? strings.nutrition.rateLoss(target.rateKgPerWeek.toFixed(2))
                  : strings.nutrition.rateHold}
              </span>
              <span className="note">{strings.nutrition.plannedRate}</span>
            </div>
          </div>
          <div style={{ marginTop: 'var(--s2)' }}>
            <MacroLine macros={targetMacros} />
          </div>
          <p className="note" style={{ marginTop: 'var(--s2)' }} data-target-basis="true">
            {strings.nutrition.targetBasis(
              String(Math.round(target.rmrKcal)),
              target.pal.toFixed(2),
              String(Math.round(target.tdeeKcal)),
            )}
          </p>
          {target.belowResting ? (
            <p className="note warn" style={{ marginTop: 'var(--s2)' }} data-caution="below-resting">
              {strings.nutrition.cautionBelowResting(
                String(target.kcalTarget),
                String(Math.round(target.rmrKcal)),
              )}
            </p>
          ) : null}
          <div className="actions">
            <Link className="btn quiet" href="/eat/targets">
              {strings.nutrition.targetsTitle}
            </Link>
          </div>
        </section>
      ) : (
        <EmptyState
          label={strings.nutrition.targetsTitle}
          title={strings.nutrition.targetEmptyTitle}
          body={strings.nutrition.targetEmptyBody}
          actionLabel={strings.nutrition.targetsTitle}
          actionHref="/eat/targets"
        />
      )}
      <section className="card" data-card="today">
        <div className="between" style={{ marginBottom: 'var(--s2)' }}>
          <span className="lbl">{strings.meals.todayLabel}</span>
          <span className="num sub" data-day-eaten="true">
            {target
              ? strings.meals.dayTotal(
                  energyText(eatenKcal(eaten), 'estimated'),
                  new Intl.NumberFormat('en-GB').format(target.kcalTarget),
                )
              : strings.meals.dayTotalNoTarget(energyText(eatenKcal(eaten), 'estimated'))}
          </span>
        </div>
        {eaten.length === 0 ? (
          <p className="sub" data-state="empty">
            {strings.meals.dayEmptyBody}
          </p>
        ) : (
          eaten.map((entry) => (
            <Link
              className="row value-link"
              key={entry.id}
              href={`/eat/entry/${entry.id}`}
              data-entry={entry.id}
              aria-label={strings.meals.openEntry(
                strings.nutrition.slots[entry.slot as 'breakfast' | 'lunch' | 'dinner' | 'snack'],
              )}
            >
              <span className="stack grow">
                <span className="head">
                  {strings.nutrition.slots[entry.slot as 'breakfast' | 'lunch' | 'dinner' | 'snack']}
                </span>
                <span className="note num">
                  {strings.meals.entryLine(
                    [
                      entry.eatenAt ? time24(entry.eatenAt, timeZone) : '',
                      `${energyText(entry.kcal, entry.confidence === 'estimated' ? 'estimated' : 'computed')} ${strings.units.kcal}`,
                      entry.kcalLow !== null && entry.kcalHigh !== null
                        ? strings.meals.entryRange(String(entry.kcalLow), String(entry.kcalHigh))
                        : '',
                    ].filter((part) => part !== ''),
                  )}
                </span>
              </span>
              <SourceChip source={entry.source} confidence={entry.confidence} />
            </Link>
          ))
        )}
        <div className="actions">
          <Link className="btn primary block" href="/eat/estimate">
            {strings.meals.photographMeal}
          </Link>
        </div>
      </section>

      {questions.length > 0 ? (
        <div className="banner w" data-state="question">
          <WarnIcon />
          <p className="grow">
            {strings.nutrition.questionOpen(questions.length)}{' '}
            <Link href={`/eat/recipe/${encodeURIComponent(questions[0].recipeId)}`}>
              {strings.nutrition.sourceChanged}
            </Link>
          </p>
        </div>
      ) : null}
    </>
  );

  const footer = (
    <p className="note centre" style={{ paddingBottom: 'var(--s5)' }}>
      <Link href="/eat/data-sources">{strings.nutrition.dataSourcesFooter}</Link>
    </p>
  );

  const boxRecipes: BoxRecipe[] = boxItems.map((item) => ({
    recipeId: item.recipeId,
    name: recipeById.get(item.recipeId)?.name ?? item.recipeId,
    portions: item.portions,
    answer: (item.secondPortionAnswer as SecondPortionAnswer | null) ?? null,
  }));

  const boxCard =
    boxRecipes.length === 0 ? (
      <EmptyState
        label={strings.meals.boxTitle}
        title={strings.meals.boxEmptyTitle}
        body={strings.meals.boxEmptyBody}
        actionLabel={strings.meals.boxImport}
        actionHref="/eat/import"
      />
    ) : (
      <BoxWeek recipes={boxRecipes} placedMeals={boxRecipes.length * 2} csrfToken={csrfToken} />
    );

  if (!plan) {
    return (
      <>
        {header}
        {boxCard}
        <EmptyState
          label={strings.tabs.eat}
          title={strings.nutrition.weekEmptyTitle}
          body={strings.nutrition.weekEmptyBody}
          actionLabel={strings.nutrition.generateWeek}
          actionHref="/eat/targets"
        />
        {footer}
      </>
    );
  }

  /*
   * The stale state, which on this screen is a week that is still on the page
   * and no longer about the owner.
   *
   * A plan is generated against a target, and a target is computed against a
   * weight. Two days later the weight has moved, so the figures under every day
   * total are about a body that is not quite this one any more. That is not an
   * error and nothing is broken, which is exactly why it needs saying: the
   * warn chip carries the age, the line under it names the cause, and the fix
   * is the Regenerate control already in the sticky bar.
   */
  const planAgeDays = daysBetween(plan.generatedAt, now, timeZone);
  const stale = planAgeDays >= STALE_AFTER_DAYS;

  const [meals, snapshots] = await Promise.all([readPlanMeals(plan.id), readCurrentSnapshots()]);
  const snapshotById = new Map([...snapshots.values()].map((row) => [row.id, row]));

  const cards: MealCard[] = meals.map((meal) => {
    const view = recipeById.get(meal.recipeId);
    const snapshot = meal.snapshotId ? snapshotById.get(meal.snapshotId) : undefined;
    return {
      id: meal.id,
      dayIndex: meal.dayIndex,
      slot: meal.slot as MealCard['slot'],
      recipeId: meal.recipeId,
      recipeName: view?.name ?? meal.recipeId,
      state: meal.state as MealCard['state'],
      cookMinutes: view?.cookMinutes ?? 0,
      lactoseFree: meal.lactoseFree,
      // Straight off the stored snapshot, nulls and all. A nutrient the food
      // table does not carry stays null all the way to the screen.
      macros: {
        kcal: snapshot?.perServingKcal ?? null,
        proteinG: snapshot?.perServingProteinG ?? null,
        carbG: snapshot?.perServingCarbG ?? null,
        fatG: snapshot?.perServingFatG ?? null,
        fibreG: snapshot?.perServingFibreG ?? null,
      },
      coveragePct: snapshot?.coveragePct ?? 0,
      wideRange: (snapshot?.coveragePct ?? 100) < 85,
    };
  });

  const days: DayCard[] = [];
  for (let index = 0; index < DAYS_IN_WEEK; index += 1) {
    const dayMeals = cards.filter((meal) => meal.dayIndex === index);
    if (dayMeals.length === 0) continue;
    days.push({
      dayIndex: index,
      label: longDate(new Date(weekStart.getTime() + index * 86_400_000), timeZone),
      meals: dayMeals,
    });
  }

  const lactoseFreeDays = new Set(
    cards.filter((meal) => meal.lactoseFree).map((meal) => meal.dayIndex),
  ).size;
  // Days carrying a preferred ingredient, counted off the alias tags rather
  // than off a name, so the sentence is a fact about the week and not a guess.
  const preferredDays = new Set(
    cards
      .filter((meal) => {
        const view = recipeById.get(meal.recipeId);
        return (
          view?.ingredients.some(
            (line) =>
              line.aliasId !== null &&
              rules.preference.some((subject) =>
                aliasById(line.aliasId as string)?.allergens.includes(subject),
              ),
          ) ?? false
        );
      })
      .map((meal) => meal.dayIndex),
  ).size;
  const sentences = ruleSentences(rules, lactoseFreeDays, preferredDays);

  return (
    <>
      {header}
      {stale ? (
        <div className="banner w" data-state="stale">
          <WarnIcon />
          <div className="grow">
            <p>
              <b>{strings.nutrition.weekStaleTitle(planAgeDays)}</b>
            </p>
            <p className="note warn">{strings.nutrition.weekStaleBody}</p>
          </div>
        </div>
      ) : null}
      <div className="banner" data-card="rules">
        <InfoIcon />
        <div className="stack grow">
          {sentences.length > 0 ? (
            sentences.map((sentence) => (
              <p key={sentence} className="rule-line">
                {sentence}
              </p>
            ))
          ) : (
            <p>{strings.nutrition.ruleNone}</p>
          )}
        </div>
      </div>
      <MealWeek
        days={days}
        csrfToken={csrfToken}
        maxCookMinutes={plan.maxCookMinutes ?? DEFAULT_MAX_COOK_MINUTES}
        confirmed={plan.state === 'confirmed'}
      />
      {boxCard}
      <TakeawaySlots
        slots={proposals.map((row) => ({
          position: row.position,
          dishId: row.dishId,
          dishName: dishName(row.dishId),
          searchUrl: row.searchUrl,
          energy: row.kcalLow !== null && row.kcalHigh !== null ? { low: row.kcalLow, high: row.kcalHigh } : null,
          budgetKcal: row.budgetKcal,
        }))}
        csrfToken={csrfToken}
        canPropose={target !== null}
      />
      {footer}
    </>
  );
}
