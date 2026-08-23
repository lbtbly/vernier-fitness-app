import {
  applyDietaryRules,
  type Refusal,
  type RuleCandidate,
  type RuleSet,
  type Substitution,
} from '@/lib/dietary-rules';
import type { Slot } from '@/lib/recipe-catalogue';

/**
 * A week of breakfasts, weekday lunches, at-home dinners and a snack, generated
 * against the target and the four dietary rules.
 *
 * F86 fixes two things this has to get right. Every meal is decided one at a
 * time, which is the caller's job and the state column's; and the generator
 * honours the configured maximum cooking time, which is this file's job and is
 * enforced twice: once by filtering the pool, and once by
 * `overLimit()` walking the finished week, so a bug in the filter shows up as a
 * failed assertion rather than as a 40-minute dinner on a 20-minute Tuesday.
 *
 * DETERMINISTIC, AND THAT IS NOT A CONVENIENCE. Two generations at 20 and 60
 * minutes have to produce different menus, and the honest way to show that is
 * two runs whose only difference is the limit. A generator seeded off the clock
 * would produce two different menus whatever the limit was, which proves
 * nothing at all. The seed is the week, the limit and the generation number, so
 * the same three inputs give the same week every time and a different limit
 * gives a different one.
 */

export type PoolRecipe = RuleCandidate & {
  slot: Slot;
  /** Per-serving energy from the stored snapshot, null when nothing resolved. */
  kcal: number | null;
};

export type PlannedPick = {
  dayIndex: number;
  slot: Slot;
  recipeId: string;
  position: number;
};

export type WeekPlan = {
  picks: PlannedPick[];
  refused: Refusal[];
  omitted: Refusal[];
  substitutions: Substitution[];
  /** What the generator actually had to choose from, after every rule. */
  poolSizes: Record<Slot, number>;
  /** What it had before the rules, so a zero is readable beside its population. */
  catalogueSizes: Record<Slot, number>;
};

export const DAYS_IN_WEEK = 7;

/** Monday to Friday. The goal names weekday lunches and this is the weekday. */
export const LUNCH_DAYS = [0, 1, 2, 3, 4];

/** The order a day is laid out in, which is also the order it is read in. */
export const SLOT_ORDER: Slot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * A small deterministic sequence. Not cryptography and not trying to be: it is
 * a way to walk a short list in an order that changes with the inputs and
 * repeats exactly when they do.
 */
function sequence(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** A stable number from a string, so a week start can seed the sequence. */
export function seedFrom(text: string, maxCookMinutes: number, generation: number): number {
  let hash = 2166136261;
  for (const character of `${text}|${maxCookMinutes}|${generation}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export type WeekInput = {
  pool: PoolRecipe[];
  rules: RuleSet;
  targetKcal: number;
  maxCookMinutes: number;
  weekStartKey: string;
  generation: number;
};

function bySlot(recipes: PoolRecipe[]): Record<Slot, PoolRecipe[]> {
  const buckets: Record<Slot, PoolRecipe[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  for (const recipe of recipes) buckets[recipe.slot].push(recipe);
  return buckets;
}

function sizes(buckets: Record<Slot, PoolRecipe[]>): Record<Slot, number> {
  return {
    breakfast: buckets.breakfast.length,
    lunch: buckets.lunch.length,
    dinner: buckets.dinner.length,
    snack: buckets.snack.length,
  };
}

/**
 * Generates the week.
 *
 * The cooking-time filter runs first, before the rules, because a recipe over
 * the limit is not a recipe a rule has an opinion about. Then the four rules
 * run in their fixed order. Then each day is filled by walking the surviving
 * pool from a per-day offset, which spreads the menu across the catalogue
 * rather than repeating the first row seven times, and the snack is chosen last
 * as the one that lands the day closest to its target.
 */
export function generateWeek(input: WeekInput): WeekPlan {
  const catalogue = bySlot(input.pool);
  const withinTime = input.pool.filter((recipe) => recipe.cookMinutes <= input.maxCookMinutes);
  const ruled = applyDietaryRules(withinTime, input.rules);
  const allowed = ruled.candidates as PoolRecipe[];
  const buckets = bySlot(allowed);

  /*
   * A week is breakfasts, weekday lunches and at-home dinners. If any of those
   * three has nothing left in it after the limit and the rules, there is no
   * week to generate and the honest answer is none at all.
   *
   * Returning the snacks alone would be worse than returning nothing: seven
   * snack rows read as a generated week on the screen, and the owner would have
   * to count them to notice that his dinners are missing. The route turns an
   * empty pick list into a refusal that names the limit and the rules.
   */
  const empty = (['breakfast', 'lunch', 'dinner'] as Slot[]).some(
    (slot) => buckets[slot].length === 0,
  );
  if (empty) {
    return {
      picks: [],
      refused: ruled.refused,
      omitted: ruled.omitted,
      substitutions: ruled.substitutions,
      poolSizes: sizes(buckets),
      catalogueSizes: sizes(catalogue),
    };
  }

  const next = sequence(seedFrom(input.weekStartKey, input.maxCookMinutes, input.generation));
  const offsets: Record<Slot, number> = {
    breakfast: Math.floor(next() * 997),
    lunch: Math.floor(next() * 997),
    dinner: Math.floor(next() * 997),
    snack: Math.floor(next() * 997),
  };

  const picks: PlannedPick[] = [];
  for (let day = 0; day < DAYS_IN_WEEK; day += 1) {
    let position = 0;
    let dayKcal = 0;

    for (const slot of ['breakfast', 'lunch', 'dinner'] as Slot[]) {
      if (slot === 'lunch' && !LUNCH_DAYS.includes(day)) continue;
      const bucket = buckets[slot];
      if (bucket.length === 0) continue;
      const recipe = bucket[(offsets[slot] + day) % bucket.length];
      picks.push({ dayIndex: day, slot, recipeId: recipe.id, position });
      position += 1;
      dayKcal += recipe.kcal ?? 0;
    }

    const snacks = buckets.snack;
    if (snacks.length > 0) {
      const room = input.targetKcal - dayKcal;
      // The snack that lands the day nearest its target, and the earliest one
      // when two are equally near, so the choice does not depend on sort order.
      let best = snacks[0];
      let bestGap = Math.abs(room - (snacks[0].kcal ?? 0));
      for (const snack of snacks.slice(1)) {
        const gap = Math.abs(room - (snack.kcal ?? 0));
        if (gap < bestGap) {
          best = snack;
          bestGap = gap;
        }
      }
      picks.push({ dayIndex: day, slot: 'snack', recipeId: best.id, position });
    }
  }

  return {
    picks,
    refused: ruled.refused,
    omitted: ruled.omitted,
    substitutions: ruled.substitutions,
    poolSizes: sizes(buckets),
    catalogueSizes: sizes(catalogue),
  };
}

/**
 * Every pick whose recipe cooks for longer than the week allows.
 *
 * The second enforcement of F86's limit, run over the finished week rather than
 * over the pool. It is what a test asserts against and what the route checks
 * before it writes, so a filter that stopped filtering is a refused write and
 * not a Tuesday nobody has time for.
 */
export function overLimit(
  picks: PlannedPick[],
  cookMinutesOf: (recipeId: string) => number,
  maxCookMinutes: number,
): PlannedPick[] {
  return picks.filter((pick) => cookMinutesOf(pick.recipeId) > maxCookMinutes);
}
