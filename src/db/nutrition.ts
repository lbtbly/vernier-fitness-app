import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from './client';
import { readLatestOfMetric } from './measurements';
import {
  hasLactoseFreeVariant,
  readCurrentSnapshots,
  readRecipes,
  type RecipeView,
  type SnapshotRow,
  type Variant,
} from './recipes';
import { dietaryRule, mealPlan, nutritionTarget, plannedMeal } from './schema';
import {
  toRuleSet,
  type DietaryRule,
  type RuleKind,
  type RuleSet,
  type RuleSubject,
} from '@/lib/dietary-rules';
import { aliasById } from '@/lib/food-aliases';
import {
  generateWeek,
  overLimit,
  type PlannedPick,
  type PoolRecipe,
  type WeekPlan,
} from '@/lib/menu-week';
import {
  macroTargets,
  planTarget,
  type PalLevel,
  type Sex,
  type TargetVerdict,
} from '@/lib/nutrition';
import type { Slot } from '@/lib/recipe-catalogue';
import { dayKey } from '@/lib/trend';

/**
 * The owner's rules, his target, and the week generated from both.
 *
 * Reading the rules gives back FOUR NAMED LISTS and never a flat array keyed by
 * subject. A caller cannot ask "what covers shellfish"; it asks
 * `rules.exclusion` or `rules.allergy`, and those are different properties
 * reached by different names. That is F83's "no query path resolves one as the
 * other", enforced at the only place the rules leave the database.
 */

export const TARGET_ID = 'daily';

/**
 * The three rules the goal states as facts about this owner: lactose
 * intolerance, a strict shellfish exclusion, and nuts allowed.
 *
 * Seeded once and never re-asserted, the same way the weight goal is, so a rule
 * the owner removes stays removed across a restart. They are the specification's
 * own words rather than data this app invented: GOAL.md section 11 names all
 * three and names the reason they must be modelled separately, which is that
 * fruits a coque and fruits de mer must never be confused.
 */
const DEFAULT_RULES: DietaryRule[] = [
  { kind: 'intolerance', subject: 'lactose' },
  { kind: 'exclusion', subject: 'shellfish' },
  { kind: 'preference', subject: 'nuts' },
];

export async function seedDietaryRules(): Promise<number> {
  const db = getDb();
  const written = await db
    .insert(dietaryRule)
    .values(
      DEFAULT_RULES.map((rule) => ({
        id: `${rule.kind}:${rule.subject}`,
        kind: rule.kind,
        subject: rule.subject,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: dietaryRule.id });
  return written.length;
}

export type RuleRow = { id: string; kind: RuleKind; subject: RuleSubject; createdAt: Date };

export async function readRuleRows(): Promise<RuleRow[]> {
  const db = getDb();
  const rows = await db.select().from(dietaryRule).orderBy(asc(dietaryRule.kind));
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as RuleKind,
    subject: row.subject as RuleSubject,
    createdAt: row.createdAt,
  }));
}

export async function readRules(): Promise<RuleSet> {
  return toRuleSet(await readRuleRows());
}

export async function addRule(kind: RuleKind, subject: RuleSubject): Promise<boolean> {
  const db = getDb();
  const written = await db
    .insert(dietaryRule)
    .values({ id: `${kind}:${subject}`, kind, subject })
    .onConflictDoNothing()
    .returning({ id: dietaryRule.id });
  return written.length > 0;
}

export async function removeRule(id: string): Promise<boolean> {
  const db = getDb();
  const removed = await db
    .delete(dietaryRule)
    .where(eq(dietaryRule.id, id))
    .returning({ id: dietaryRule.id });
  return removed.length > 0;
}

// ---------------------------------------------------------------------------
// The target.

export type TargetRow = typeof nutritionTarget.$inferSelect;

export async function readTarget(): Promise<TargetRow | null> {
  const db = getDb();
  const [row] = await db.select().from(nutritionTarget).where(eq(nutritionTarget.id, TARGET_ID));
  return row ?? null;
}

/** The latest stored weight, which is what a target is computed against. */
export async function readLatestWeight(): Promise<{ kg: number; source: string; at: Date } | null> {
  const row = await readLatestOfMetric('weight');
  if (!row || row.value === null) return null;
  return { kg: row.value, source: row.source, at: row.measuredAt };
}

export type TargetInputs = {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  level: PalLevel;
  rateKgPerWeek: number;
  hardFloorConfirmed: boolean;
};

/**
 * Computes and stores the target, or refuses.
 *
 * The verdict comes straight out of `planTarget`, which owns all three floors,
 * and only an `allowed` verdict reaches the database. A refused rate and a
 * blocked floor both return the verdict and write nothing at all, so the screen
 * that shows the refusal is showing the same object the route decided on.
 */
export async function writeTarget(
  inputs: TargetInputs,
): Promise<{ verdict: TargetVerdict; row: TargetRow | null }> {
  const body = {
    sex: inputs.sex,
    ageYears: inputs.ageYears,
    heightCm: inputs.heightCm,
    weightKg: inputs.weightKg,
  };
  const verdict = planTarget({
    body,
    level: inputs.level,
    rateKgPerWeek: inputs.rateKgPerWeek,
    hardFloorConfirmed: inputs.hardFloorConfirmed,
  });
  if (verdict.outcome !== 'allowed') return { verdict, row: null };

  const macros = macroTargets(verdict.kcal, inputs.weightKg);
  const { NUTRITION } = await import('@/lib/nutrition');
  const db = getDb();
  const values = {
    id: TARGET_ID,
    singleton: true,
    sex: inputs.sex,
    ageYears: inputs.ageYears,
    heightCm: inputs.heightCm,
    weightKg: inputs.weightKg,
    equation: NUTRITION.bmrEquation,
    activityLevel: inputs.level,
    pal: NUTRITION.pal[inputs.level],
    rmrKcal: verdict.rmr,
    tdeeKcal: verdict.tdee,
    rateKgPerWeek: inputs.rateKgPerWeek,
    kcalTarget: verdict.kcal,
    proteinG: macros.proteinG,
    carbG: macros.carbG,
    fatG: macros.fatG,
    fibreG: macros.fibreG,
    belowResting: verdict.cautions.includes('below_resting'),
    hardFloorConfirmedAt: inputs.hardFloorConfirmed ? new Date() : null,
    updatedAt: new Date(),
  };
  // The set is built from the same object the insert uses, minus the id it
  // conflicts on. Spreading `undefined` into a set is not the same as leaving a
  // column alone, and `created_at` is a fact about when this row first existed.
  const { id: _id, ...changed } = values;
  const [row] = await db
    .insert(nutritionTarget)
    .values(values)
    .onConflictDoUpdate({ target: nutritionTarget.id, set: changed })
    .returning();
  return { verdict, row };
}

// ---------------------------------------------------------------------------
// The week.

export const DEFAULT_MAX_COOK_MINUTES = 45;

/** Monday of the week that starts after today, read in the app's own zone. */
export function nextWeekStart(now: Date, timeZone: string): Date {
  const key = dayKey(now, timeZone);
  const midday = new Date(`${key}T12:00:00Z`);
  // getUTCDay on a midday-UTC instant built from the app's own calendar day is
  // that day's weekday, with no zone left to shift it.
  const weekday = midday.getUTCDay();
  const daysToMonday = ((8 - weekday) % 7) || 7;
  return new Date(midday.getTime() + daysToMonday * 86_400_000);
}

export function weekStartKey(weekStart: Date): string {
  return weekStart.toISOString().slice(0, 10);
}

export type MealPlanRow = typeof mealPlan.$inferSelect;
export type PlannedMealRow = typeof plannedMeal.$inferSelect;

/** The pool the generator chooses from, with each recipe's stored snapshot. */
export async function readPool(): Promise<{
  recipes: RecipeView[];
  snapshots: Map<string, SnapshotRow>;
  pool: PoolRecipe[];
}> {
  const recipes = await readRecipes();
  const snapshots = await readCurrentSnapshots();
  const pool: PoolRecipe[] = recipes.map((view) => ({
    id: view.id,
    cookMinutes: view.cookMinutes,
    slot: view.slot,
    ingredients: view.ingredients.map((line) => ({ aliasId: line.aliasId, grams: line.grams })),
    kcal: snapshots.get(`${view.id}|base`)?.perServingKcal ?? null,
  }));
  return { recipes, snapshots, pool };
}

export type GenerateResult =
  | { outcome: 'generated'; plan: MealPlanRow; week: WeekPlan; meals: number }
  | { outcome: 'empty_catalogue'; week: WeekPlan }
  | { outcome: 'over_limit'; week: WeekPlan; offenders: PlannedPick[] };

/**
 * Generates a week and writes it, replacing any draft for the same week.
 *
 * THE COOKING LIMIT IS CHECKED TWICE. The pool is filtered by it, and the
 * finished week is walked against it before anything is written. A filter that
 * stopped filtering would otherwise show up as a 40-minute dinner on a
 * 20-minute Tuesday, months later, with no test that could have caught it.
 */
export async function generateAndStoreWeek(input: {
  now: Date;
  timeZone: string;
  maxCookMinutes: number;
  targetKcal: number;
}): Promise<GenerateResult> {
  const db = getDb();
  const { recipes, snapshots, pool } = await readPool();
  const rules = await readRules();
  const weekStart = nextWeekStart(input.now, input.timeZone);
  const key = weekStartKey(weekStart);

  const [existing] = await db.select().from(mealPlan).where(eq(mealPlan.weekStart, weekStart));
  const generation = (existing?.generation ?? 0) + 1;

  const week = generateWeek({
    pool,
    rules,
    targetKcal: input.targetKcal,
    maxCookMinutes: input.maxCookMinutes,
    weekStartKey: key,
    generation,
  });

  if (week.picks.length === 0) return { outcome: 'empty_catalogue', week };

  const cookMinutesOf = new Map(recipes.map((view) => [view.id, view.cookMinutes]));
  const offenders = overLimit(
    week.picks,
    (id) => cookMinutesOf.get(id) ?? Number.POSITIVE_INFINITY,
    input.maxCookMinutes,
  );
  if (offenders.length > 0) return { outcome: 'over_limit', week, offenders };

  const planId = `plan|${key}`;
  const values = {
    id: planId,
    weekStart,
    generatedAt: new Date(),
    maxCookMinutes: input.maxCookMinutes,
    kcalTarget: input.targetKcal,
    state: 'draft',
    confirmedAt: null,
    generation,
  };
  const [plan] = await db
    .insert(mealPlan)
    .values(values)
    .onConflictDoUpdate({ target: mealPlan.weekStart, set: values })
    .returning();

  // A regeneration replaces the week wholesale. Nothing here is a measurement:
  // a proposed meal is an offer and re-offering is not an overwrite of a fact.
  await db.delete(plannedMeal).where(eq(plannedMeal.planId, plan.id));

  const lactoseIntolerant = rules.intolerance.includes('lactose');
  const rows = week.picks.map((pick) => {
    const view = recipes.find((entry) => entry.id === pick.recipeId);
    const wantsFreeFrom = lactoseIntolerant && view !== undefined && hasLactoseFreeVariant(view.ingredients);
    const variant: Variant = wantsFreeFrom ? 'lactose_free' : 'base';
    return {
      id: `${plan.id}|${pick.dayIndex}|${pick.slot}`,
      planId: plan.id,
      dayIndex: pick.dayIndex,
      slot: pick.slot,
      recipeId: pick.recipeId,
      snapshotId: snapshots.get(`${pick.recipeId}|${variant}`)?.id ?? null,
      state: 'proposed',
      lactoseFree: wantsFreeFrom,
      position: pick.position,
    };
  });
  await db.insert(plannedMeal).values(rows);

  return { outcome: 'generated', plan, week, meals: rows.length };
}

export async function readPlan(weekStart: Date): Promise<MealPlanRow | null> {
  const db = getDb();
  const [row] = await db.select().from(mealPlan).where(eq(mealPlan.weekStart, weekStart));
  return row ?? null;
}

export async function readLatestPlan(): Promise<MealPlanRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(mealPlan)
    .orderBy(sql`${mealPlan.weekStart} desc`)
    .limit(1);
  return row ?? null;
}

export async function readPlanMeals(planId: string): Promise<PlannedMealRow[]> {
  const db = getDb();
  return db
    .select()
    .from(plannedMeal)
    .where(eq(plannedMeal.planId, planId))
    .orderBy(asc(plannedMeal.dayIndex), asc(plannedMeal.position));
}

export type MealState = 'proposed' | 'accepted' | 'edited' | 'rejected';

export const MEAL_STATES: MealState[] = ['proposed', 'accepted', 'edited', 'rejected'];

/** One meal, decided on its own. There is no accept-all anywhere in this file. */
export async function setMealState(id: string, state: MealState): Promise<PlannedMealRow | null> {
  const db = getDb();
  const [row] = await db
    .update(plannedMeal)
    .set({ state, decidedAt: new Date() })
    .where(eq(plannedMeal.id, id))
    .returning();
  return row ?? null;
}

/**
 * Applies or undoes the free-from swap on one meal, and moves the meal onto the
 * snapshot computed from the alternative rows.
 *
 * The macros change because the SNAPSHOT changes, not because a number is
 * adjusted in a component: the plant dessert that replaces fromage blanc is a
 * different Anses row with a different energy, a different protein and no
 * published fibre at all, so the meal's fibre coverage moves with it.
 */
export async function setMealLactoseFree(
  id: string,
  lactoseFree: boolean,
): Promise<PlannedMealRow | null> {
  const db = getDb();
  const [meal] = await db.select().from(plannedMeal).where(eq(plannedMeal.id, id));
  if (!meal) return null;
  const snapshots = await readCurrentSnapshots();
  const variant: Variant = lactoseFree ? 'lactose_free' : 'base';
  const snapshot = snapshots.get(`${meal.recipeId}|${variant}`);
  if (!snapshot) return null;
  const [row] = await db
    .update(plannedMeal)
    .set({ lactoseFree, snapshotId: snapshot.id })
    .where(eq(plannedMeal.id, id))
    .returning();
  return row ?? null;
}

export async function confirmPlan(planId: string): Promise<MealPlanRow | null> {
  const db = getDb();
  const [row] = await db
    .update(mealPlan)
    .set({ state: 'confirmed', confirmedAt: new Date() })
    .where(eq(mealPlan.id, planId))
    .returning();
  return row ?? null;
}

/**
 * Every ingredient the accepted meals of a plan need, with the meal each gram
 * came from. What the shopping list is built out of.
 */
export async function readWantedIngredients(planId: string): Promise<
  { aliasId: string; grams: number; plannedMealId: string; boxSupplied: boolean; dayIndex: number }[]
> {
  const meals = await readPlanMeals(planId);
  const recipes = await readRecipes();
  const byId = new Map(recipes.map((view) => [view.id, view]));
  const wanted: {
    aliasId: string;
    grams: number;
    plannedMealId: string;
    boxSupplied: boolean;
    dayIndex: number;
  }[] = [];

  for (const meal of meals) {
    if (meal.state === 'rejected' || meal.state === 'proposed') continue;
    const view = byId.get(meal.recipeId);
    if (!view) continue;
    for (const line of view.ingredients) {
      const alias = aliasById(line.aliasId);
      const aliasId =
        meal.lactoseFree && alias?.lactoseFree ? alias.lactoseFree : line.aliasId;
      wanted.push({
        aliasId,
        // A two-portion recipe eaten by one person still buys two portions of
        // its ingredients, so the shopping grams are the recipe's own.
        grams: line.grams,
        plannedMealId: meal.id,
        boxSupplied: line.boxSupplied,
        dayIndex: meal.dayIndex,
      });
    }
  }
  return wanted;
}

export type SlotOrder = Slot;

/** How many meals sit in each state, which the sticky footer states as a tally. */
export function tallyMeals(meals: { state: string }[]): {
  accepted: number;
  edited: number;
  waiting: number;
  rejected: number;
} {
  return {
    accepted: meals.filter((meal) => meal.state === 'accepted').length,
    edited: meals.filter((meal) => meal.state === 'edited').length,
    waiting: meals.filter((meal) => meal.state === 'proposed').length,
    rejected: meals.filter((meal) => meal.state === 'rejected').length,
  };
}

export async function countRules(): Promise<number> {
  const db = getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(dietaryRule);
  return Number(n);
}

export async function planMealCount(planId: string): Promise<number> {
  const db = getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(plannedMeal)
    .where(and(eq(plannedMeal.planId, planId)));
  return Number(n);
}
