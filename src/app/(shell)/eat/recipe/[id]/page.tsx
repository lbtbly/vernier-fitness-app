import Link from 'next/link';
import { EnergyValue, MacroBlock, MacroLine } from '@/components/Macros';
import { LactoseFreeSwap, SourceChangeQuestion } from '@/components/RecipeActions';
import { ScreenTitle } from '@/components/ScreenTitle';
import { InfoIcon, SparkIcon } from '@/components/icons';
import { readPlanMeals, readLatestPlan } from '@/db/nutrition';
import { readCurrentSnapshot, readOpenQuestions, readRecipe } from '@/db/recipes';
import { readFoods } from '@/db/foods';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { aliasById, aliasFoodId, aliasName } from '@/lib/food-aliases';
import { shortDateTime } from '@/lib/format';
import { coverageBand, type MacroSet } from '@/lib/macros';
import { NUTRITION } from '@/lib/nutrition';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';
export const metadata = { title: strings.nutrition.mealTitle };

/**
 * One recipe, with everything F87 asks a stored snapshot to carry on screen at
 * once: the per-serving figures, the version they are, when they were computed,
 * their provenance, their mass coverage and a SEPARATE fibre coverage.
 *
 * BELOW 85 PERCENT COVERAGE THE ENERGY IS A RANGE AND THE SHORTFALL IS STATED.
 * A point estimate over a recipe whose numbers cover two thirds of its mass is
 * a claim about precision the data has not earned, and the band widens with the
 * share that is missing rather than by a fixed percentage.
 *
 * F79'S MARKER IS ONE TAP FROM THE NUMBER, and one tap is what it is: the
 * disclosure sits directly under the energy figure, its summary is the chip,
 * and opening it names the regulation the value was computed by and counts how
 * many of this recipe's ingredients carry one.
 *
 * F85's before and after are both on the screen at the same time, so the swap
 * is one capture rather than two: the base figures and the free-from figures,
 * side by side, computed from two different sets of Anses rows.
 */

function macrosOf(snapshot: {
  perServingKcal: number | null;
  perServingProteinG: number | null;
  perServingCarbG: number | null;
  perServingFatG: number | null;
  perServingFibreG: number | null;
}): MacroSet {
  return {
    kcal: snapshot.perServingKcal,
    proteinG: snapshot.perServingProteinG,
    carbG: snapshot.perServingCarbG,
    fatG: snapshot.perServingFatG,
    fibreG: snapshot.perServingFibreG,
  };
}

const PERCENT = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

export default async function RecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ meal?: string }>;
}) {
  const { id } = await params;
  const { meal: mealId } = await searchParams;
  const { timeZone } = getConfig();
  const csrfToken = await readCsrfToken();

  const view = await readRecipe(decodeURIComponent(id));
  if (!view) {
    return (
      <>
        <ScreenTitle title={strings.api.nutrition.noRecipe} />
        <div className="card empty">
          <span className="lbl">{strings.tabs.eat}</span>
          <div className="head">{strings.api.nutrition.noRecipe}</div>
          <p className="sub">{strings.api.nutrition.noRecipeDetail}</p>
          <div className="actions">
            <Link className="btn primary block" href="/eat">
              {strings.tabs.eat}
            </Link>
          </div>
        </div>
      </>
    );
  }

  const [base, freeFrom, questions] = await Promise.all([
    readCurrentSnapshot(view.id, 'base'),
    readCurrentSnapshot(view.id, 'lactose_free'),
    readOpenQuestions(),
  ]);
  const question = questions.find((entry) => entry.recipeId === view.id) ?? null;

  // The meal this screen was opened from, when it was opened from the week.
  const plan = await readLatestPlan();
  const meals = plan ? await readPlanMeals(plan.id) : [];
  const meal = mealId ? (meals.find((entry) => entry.id === mealId) ?? null) : null;

  const dairyLine = view.ingredients.find((line) => aliasById(line.aliasId)?.lactoseFree);
  const dairyAlias = dairyLine ? aliasById(dairyLine.aliasId) : null;
  const freeFromAlias = dairyAlias?.lactoseFree ? aliasById(dairyAlias.lactoseFree) : null;

  const active = meal?.lactoseFree && freeFrom ? freeFrom : base;
  const macros = active ? macrosOf(active) : { kcal: null, proteinG: null, carbG: null, fatG: null, fibreG: null };
  const coverage = active?.coveragePct ?? 0;
  const fibreCoverage = active?.fibreCoveragePct ?? 0;
  const wide = coverage < NUTRITION.coverageRangeThresholdPct;

  const foodIds = view.ingredients
    .map((line) => {
      const alias = aliasById(line.aliasId);
      return alias ? aliasFoodId(alias) : null;
    })
    .filter((value): value is string => value !== null);
  const foods = await readFoods(foodIds);

  return (
    <>
      <ScreenTitle
        label={strings.nutrition.slots[view.slot]}
        title={view.name}
        sub={strings.nutrition.mealLine([
          strings.nutrition.servings(view.servings),
          strings.nutrition.cookTime(view.cookMinutes),
        ])}
      />

      <section className="card" data-card="per-serving">
        <div className="between">
          <span className="lbl">{strings.nutrition.perServing}</span>
          <span className="src est">
            <SparkIcon />
            {strings.nutrition.provenance[active?.provenance as keyof typeof strings.nutrition.provenance] ??
              strings.nutrition.provenance.computed_partial}
          </span>
        </div>

        <div style={{ marginTop: 'var(--s3)' }}>
          {wide && macros.kcal !== null ? (
            <span className="metric" data-energy="range">
              {strings.nutrition.aroundRange(
                PERCENT.format(coverageBand(macros.kcal, coverage).low),
                PERCENT.format(coverageBand(macros.kcal, coverage).high),
                strings.units.kcal,
              )}
            </span>
          ) : (
            <span className="metric">
              <EnergyValue kcal={macros.kcal} />
            </span>
          )}
        </div>

        {/*
          F79, one tap from the number. The summary is the chip and the panel is
          the explanation, so the marker is reachable without leaving the screen
          the number is on.
        */}
        {/*
          * The chip says which of the two this recipe is, the way the food
          * screen does. It read "Computed energy" over a recipe whose own panel
          * then said "0 of 4 ingredients carry a computed energy", which is the
          * marker marking a thing it did not apply to.
          */}
        <details className="card flat" style={{ marginTop: 'var(--s2)', padding: 0 }}>
          <summary
            className={(active?.computedEnergyCount ?? 0) > 0 ? 'src est' : 'src'}
            style={{ cursor: 'pointer', minHeight: 'var(--touch)' }}
            data-flag={(active?.computedEnergyCount ?? 0) > 0 ? 'computed_atwater' : 'published'}
          >
            <InfoIcon />
            {(active?.computedEnergyCount ?? 0) > 0
              ? strings.nutrition.computedEnergyChip
              : strings.nutrition.publishedEnergyChip}
          </summary>
          <div style={{ paddingTop: 'var(--s2)' }}>
            <p className="sub">
              {(active?.computedEnergyCount ?? 0) > 0
                ? strings.nutrition.computedEnergyBody
                : strings.nutrition.publishedEnergyBody}
            </p>
            <p className="note" style={{ marginTop: 'var(--s2)' }} data-computed-count="true">
              {strings.nutrition.computedEnergyCount(
                active?.computedEnergyCount ?? 0,
                active?.ingredientCount ?? view.ingredients.length,
              )}
            </p>
          </div>
        </details>

        <div style={{ marginTop: 'var(--s3)' }}>
          <MacroLine macros={macros} />
        </div>

        <dl style={{ marginTop: 'var(--s3)' }}>
          <div className="field">
            <dt>{strings.nutrition.coverageLabel}</dt>
            <dd className="num">{strings.nutrition.coveragePct(PERCENT.format(coverage))}</dd>
          </div>
          <div className="field">
            <dt>{strings.nutrition.fibreCoverageLabel}</dt>
            <dd className="num" data-fibre-coverage="true">
              {strings.nutrition.coveragePct(PERCENT.format(fibreCoverage))}
            </dd>
          </div>
          <div className="field">
            <dt>{strings.nutrition.snapshotLabel}</dt>
            <dd className="num">
              {active
                ? strings.nutrition.snapshotVersion(
                    active.version,
                    shortDateTime(active.computedAt, timeZone),
                  )
                : strings.nutrition.unknown}
            </dd>
          </div>
        </dl>

        {wide ? (
          <p className="note warn" style={{ marginTop: 'var(--s2)' }} data-shortfall="coverage">
            {strings.nutrition.coverageShortfall(
              PERCENT.format(coverage),
              NUTRITION.coverageRangeThresholdPct,
            )}
          </p>
        ) : null}
        {fibreCoverage < 100 ? (
          <p className="note" style={{ marginTop: 'var(--s2)' }} data-shortfall="fibre">
            {strings.nutrition.fibreShortfall(PERCENT.format(fibreCoverage))}
          </p>
        ) : null}
        <p className="note" style={{ marginTop: 'var(--s2)' }}>
          {strings.nutrition.snapshotNote}
        </p>
      </section>

      {question ? (
        <SourceChangeQuestion
          questionId={question.id}
          storedHash={question.storedHash}
          incomingHash={question.incomingHash}
          csrfToken={csrfToken}
        />
      ) : null}

      {dairyAlias && freeFromAlias && base && freeFrom ? (
        <section className="card" data-card="lactose-free">
          <span className="lbl">{strings.nutrition.lactoseFreeTitle}</span>
          <p className="sub" style={{ marginTop: 'var(--s2)' }}>
            {strings.nutrition.lactoseFreeBody}
          </p>
          <div className="card flat" style={{ marginTop: 'var(--s3)' }} data-macros-set="before">
            <span className="lbl">{strings.nutrition.macrosBefore}</span>
            <MacroBlock macros={macrosOf(base)} />
          </div>
          <div className="card flat" data-macros-set="after">
            <span className="lbl">{strings.nutrition.macrosAfter}</span>
            <MacroBlock macros={macrosOf(freeFrom)} />
          </div>
          {meal ? (
            <div style={{ marginTop: 'var(--s3)' }}>
              <LactoseFreeSwap
                mealId={meal.id}
                lactoseFree={meal.lactoseFree}
                dairyName={aliasName(dairyAlias)}
                freeFromName={aliasName(freeFromAlias)}
                csrfToken={csrfToken}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="card" data-card="ingredients">
        <span className="lbl">{strings.nutrition.ingredients}</span>
        {view.ingredients.map((line) => {
          const alias = aliasById(line.aliasId);
          const foodId = alias ? aliasFoodId(alias) : null;
          const row = foodId ? foods.get(foodId) : undefined;
          return (
            <div className="row" key={line.id} data-ingredient={line.aliasId}>
              <div className="stack grow">
                <span>
                  {alias
                    ? strings.nutrition.ingredientLine(String(line.grams), aliasName(alias))
                    : line.aliasId}
                </span>
                {row ? (
                  <span className="note num">
                    {row.nameFr}
                    {row.energySource === 'computed_atwater'
                      ? ` ${strings.nutrition.mealLine([strings.nutrition.computedEnergyChip])}`
                      : ''}
                  </span>
                ) : (
                  <span className="note warn">{strings.nutrition.ingredientUnresolved}</span>
                )}
              </div>
              {foodId ? (
                <Link className="btn quiet" href={`/eat/food/${encodeURIComponent(foodId)}`}>
                  {strings.nutrition.openProvenance}
                </Link>
              ) : null}
            </div>
          );
        })}
        <p className="note" style={{ marginTop: 'var(--s3)' }}>
          {strings.nutrition.rawWeightNote}
        </p>
      </section>

      <p className="note centre" style={{ paddingBottom: 'var(--s5)' }}>
        <Link href="/eat/data-sources">{strings.nutrition.dataSourcesFooter}</Link>
      </p>
    </>
  );
}
