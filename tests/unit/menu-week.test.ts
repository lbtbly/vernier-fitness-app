import { describe, expect, test } from 'vitest';
import { toRuleSet, type DietaryRule } from '@/lib/dietary-rules';
import {
  DAYS_IN_WEEK,
  LUNCH_DAYS,
  generateWeek,
  overLimit,
  seedFrom,
  type PoolRecipe,
} from '@/lib/menu-week';
import { RECIPE_CATALOGUE } from '@/lib/recipe-catalogue';

/**
 * The generated week, graded against F86.
 *
 * "A week of breakfasts, weekday lunches and at-home dinners generates, each
 * meal is accepted, edited or rejected one at a time, and the generator honours
 * the configured maximum cooking time: two generations at 20 and 60 minutes
 * produce different menus and neither exceeds its limit."
 *
 * THE TWO-GENERATION TEST IS ONLY WORTH ANYTHING BECAUSE THE GENERATOR IS
 * DETERMINISTIC. Seeded off the clock, two runs would differ whatever the limit
 * was, and the test would pass while proving nothing. So the same three inputs
 * are asserted to give the same week, and only then is the different limit shown
 * to give a different one.
 */

const POOL: PoolRecipe[] = RECIPE_CATALOGUE.map((recipe) => ({
  id: recipe.id,
  cookMinutes: recipe.cookMinutes,
  slot: recipe.slot,
  ingredients: recipe.ingredients.map((line) => ({ aliasId: line.aliasId, grams: line.grams })),
  kcal: 520,
}));

const RULES = toRuleSet([
  { kind: 'intolerance', subject: 'lactose' },
  { kind: 'exclusion', subject: 'shellfish' },
  { kind: 'preference', subject: 'nuts' },
] as DietaryRule[]);

const COOK_MINUTES = new Map(RECIPE_CATALOGUE.map((recipe) => [recipe.id, recipe.cookMinutes]));

function week(maxCookMinutes: number, generation = 1) {
  return generateWeek({
    pool: POOL,
    rules: RULES,
    targetKcal: 2150,
    maxCookMinutes,
    weekStartKey: '2026-08-24',
    generation,
  });
}

describe('the shape of a week', () => {
  test('breakfasts every day, lunches on weekdays, dinners every day', () => {
    const plan = week(60);
    const breakfasts = plan.picks.filter((pick) => pick.slot === 'breakfast');
    const lunches = plan.picks.filter((pick) => pick.slot === 'lunch');
    const dinners = plan.picks.filter((pick) => pick.slot === 'dinner');
    console.log(
      `week at 60 min: ${plan.picks.length} meals, ` +
        `${breakfasts.length} breakfasts, ${lunches.length} lunches, ${dinners.length} dinners`,
    );
    expect(breakfasts.length).toBe(DAYS_IN_WEEK);
    expect(dinners.length).toBe(DAYS_IN_WEEK);
    expect(lunches.length).toBe(LUNCH_DAYS.length);
    expect(new Set(lunches.map((pick) => pick.dayIndex))).toEqual(new Set(LUNCH_DAYS));
  });

  test('the pool it chose from is reported beside the catalogue it started with', () => {
    const plan = week(60);
    console.log(
      `pool after rules: ${JSON.stringify(plan.poolSizes)}, catalogue: ${JSON.stringify(plan.catalogueSizes)}`,
    );
    for (const slot of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
      expect(plan.catalogueSizes[slot]).toBeGreaterThan(0);
      expect(plan.poolSizes[slot]).toBeGreaterThan(0);
      expect(plan.poolSizes[slot]).toBeLessThanOrEqual(plan.catalogueSizes[slot]);
    }
    // The rules really removed something, or this walk is over a set the rules
    // never touched and it proves nothing about them.
    expect(plan.omitted.length).toBeGreaterThan(0);
  });
});

describe('the cooking limit is honoured, and it is checked twice', () => {
  test('no recipe in a 20-minute week cooks for longer than 20 minutes', () => {
    const plan = week(20);
    const offenders = overLimit(plan.picks, (id) => COOK_MINUTES.get(id) ?? 999, 20);
    console.log(`week at 20 min: ${plan.picks.length} meals, ${offenders.length} over the limit`);
    expect(plan.picks.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
    for (const pick of plan.picks) {
      expect(COOK_MINUTES.get(pick.recipeId) ?? 999).toBeLessThanOrEqual(20);
    }
  });

  test('no recipe in a 60-minute week cooks for longer than 60 minutes', () => {
    const plan = week(60);
    expect(overLimit(plan.picks, (id) => COOK_MINUTES.get(id) ?? 999, 60)).toEqual([]);
  });

  test('the second check catches what a broken filter would let through', () => {
    // A hand-built week holding a 40-minute recipe against a 20-minute limit.
    const long = RECIPE_CATALOGUE.find((recipe) => recipe.cookMinutes >= 35);
    expect(long).toBeDefined();
    if (!long) return;
    const offenders = overLimit(
      [{ dayIndex: 0, slot: 'dinner', recipeId: long.id, position: 0 }],
      (id) => COOK_MINUTES.get(id) ?? 999,
      20,
    );
    expect(offenders.length).toBe(1);
  });
});

describe('two generations at 20 and 60 minutes produce different menus', () => {
  test('the generator is deterministic, so a difference means something', () => {
    expect(seedFrom('2026-08-24', 20, 1)).toBe(seedFrom('2026-08-24', 20, 1));
    expect(seedFrom('2026-08-24', 20, 1)).not.toBe(seedFrom('2026-08-24', 60, 1));
    const first = week(60).picks.map((pick) => pick.recipeId).join('|');
    const again = week(60).picks.map((pick) => pick.recipeId).join('|');
    expect(again).toBe(first);
  });

  test('and the two menus really differ', () => {
    const short = week(20).picks.map((pick) => `${pick.dayIndex}:${pick.slot}:${pick.recipeId}`);
    const long = week(60).picks.map((pick) => `${pick.dayIndex}:${pick.slot}:${pick.recipeId}`);
    const shared = short.filter((entry) => long.includes(entry));
    console.log(
      `20 min: ${short.length} meals, 60 min: ${long.length} meals, ${shared.length} identical placements`,
    );
    expect(short.length).toBeGreaterThan(0);
    expect(long.length).toBeGreaterThan(0);
    expect(short.join('|')).not.toBe(long.join('|'));
  });

  test('a regeneration at the same limit still produces a different week', () => {
    const first = week(60, 1).picks.map((pick) => pick.recipeId).join('|');
    const second = week(60, 2).picks.map((pick) => pick.recipeId).join('|');
    expect(second).not.toBe(first);
  });
});

describe('a pool with nothing in it produces nothing, and says so', () => {
  test('an impossible limit generates no meals rather than an invented one', () => {
    const plan = generateWeek({
      pool: POOL,
      rules: RULES,
      targetKcal: 2150,
      maxCookMinutes: 1,
      weekStartKey: '2026-08-24',
      generation: 1,
    });
    console.log(`week at 1 min: ${plan.picks.length} meals, pool ${JSON.stringify(plan.poolSizes)}`);
    expect(plan.picks.length).toBe(0);
    expect(plan.catalogueSizes.dinner).toBeGreaterThan(0);
  });
});
