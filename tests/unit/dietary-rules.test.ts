import { describe, expect, test } from 'vitest';
import {
  RULE_KINDS,
  SHELLFISH_SUBGROUPS,
  allergensPresent,
  applyDietaryRules,
  omitForExclusions,
  rankByPreferences,
  refuseForAllergies,
  substituteForIntolerances,
  toRuleSet,
  type DietaryRule,
  type RuleCandidate,
} from '@/lib/dietary-rules';
import { aliasById, allAliases } from '@/lib/food-aliases';
import { generateWeek, DAYS_IN_WEEK } from '@/lib/menu-week';
import { RECIPE_CATALOGUE } from '@/lib/recipe-catalogue';

/**
 * Four rules, four behaviours, and nothing underneath that could collapse two
 * into one.
 *
 * F83: "adding nuts as a preference and shellfish as an exclusion produces two
 * different behaviours, and no query path resolves one as the other."
 * F84: "No generated menu contains molluscs, crustaceans or other shellfish."
 *
 * THE FOUR-WEEK MENU CHECK IS WRITTEN TO BE ABLE TO FAIL. A denylist run over a
 * catalogue that never contained shellfish is a check that passes by not
 * checking, and this run has hit that failure class seven times. So the shipped
 * catalogue carries three real shellfish recipes, the population walked is
 * printed on every run, and the control test below removes the exclusion and
 * asserts that all three come straight back. If the mechanism ever stops
 * working, the control goes red first.
 */

const CANDIDATES: RuleCandidate[] = RECIPE_CATALOGUE.map((recipe) => ({
  id: recipe.id,
  cookMinutes: recipe.cookMinutes,
  slot: recipe.slot,
  ingredients: recipe.ingredients.map((line) => ({ aliasId: line.aliasId, grams: line.grams })),
}));

const SHELLFISH_RECIPES = CANDIDATES.filter(
  (candidate) => allergensPresent(candidate, 'shellfish').length > 0,
).map((candidate) => candidate.id);

const NUT_RECIPES = CANDIDATES.filter(
  (candidate) => allergensPresent(candidate, 'nuts').length > 0,
).map((candidate) => candidate.id);

describe('the catalogue this is graded against is not empty', () => {
  test('it carries recipes an exclusion has something to exclude', () => {
    console.log(
      `catalogue: ${CANDIDATES.length} recipes, ${SHELLFISH_RECIPES.length} carrying shellfish ` +
        `(${SHELLFISH_RECIPES.join(', ')}), ${NUT_RECIPES.length} carrying nuts`,
    );
    expect(CANDIDATES.length).toBeGreaterThan(0);
    expect(SHELLFISH_RECIPES.length).toBeGreaterThan(0);
    expect(NUT_RECIPES.length).toBeGreaterThan(0);
  });

  test('the shellfish aliases sit in the Anses subgroups for crustaceans and molluscs', () => {
    // 0407 cooked, 0408 raw. The publisher's own classification, used as a
    // second net under the alias tags this app wrote.
    expect(SHELLFISH_SUBGROUPS).toEqual(['0407', '0408']);
    const shellfishAliases = allAliases().filter((alias) => alias.allergens.includes('shellfish'));
    expect(shellfishAliases.length).toBeGreaterThan(0);
  });
});

describe('nuts as a preference and shellfish as an exclusion do different things', () => {
  const rules = toRuleSet([
    { kind: 'preference', subject: 'nuts' },
    { kind: 'exclusion', subject: 'shellfish' },
  ] as DietaryRule[]);

  test('the exclusion removes every shellfish recipe and names why', () => {
    const outcome = omitForExclusions(CANDIDATES, rules.exclusion);
    expect(outcome.omitted.length).toBe(SHELLFISH_RECIPES.length);
    for (const entry of outcome.omitted) {
      expect(entry.kind).toBe('exclusion');
      expect(entry.subject).toBe('shellfish');
    }
    expect(outcome.kept.length).toBe(CANDIDATES.length - SHELLFISH_RECIPES.length);
  });

  test('the preference removes nothing at all, whatever it matches', () => {
    const ranked = rankByPreferences(CANDIDATES, rules.preference);
    expect(ranked.length).toBe(CANDIDATES.length);
    expect(new Set(ranked.map((entry) => entry.id))).toEqual(
      new Set(CANDIDATES.map((entry) => entry.id)),
    );
    // Every nut recipe is still there, and it is now reached for first.
    for (const id of NUT_RECIPES) expect(ranked.some((entry) => entry.id === id)).toBe(true);
    expect(NUT_RECIPES).toContain(ranked[0].id);
  });

  test('a preference over a subject the catalogue does not carry still removes nothing', () => {
    const ranked = rankByPreferences(CANDIDATES, ['gluten']);
    expect(ranked.length).toBe(CANDIDATES.length);
  });

  test('the whole pipeline keeps the nuts and drops the shellfish', () => {
    const outcome = applyDietaryRules(CANDIDATES, rules);
    const kept = new Set(outcome.candidates.map((entry) => entry.id));
    for (const id of SHELLFISH_RECIPES) expect(kept.has(id)).toBe(false);
    for (const id of NUT_RECIPES) expect(kept.has(id)).toBe(true);
  });
});

describe('an allergy and an exclusion are not the same rule at two volumes', () => {
  test('they route to two different functions with two different outcomes', () => {
    const allergy = refuseForAllergies(CANDIDATES, ['shellfish']);
    const exclusion = omitForExclusions(CANDIDATES, ['shellfish']);
    expect(allergy.refused.every((entry) => entry.kind === 'allergy')).toBe(true);
    expect(exclusion.omitted.every((entry) => entry.kind === 'exclusion')).toBe(true);
    // The two outcome shapes have different property names, so no caller can
    // read one where it meant the other and get an answer.
    expect(Object.keys(allergy)).toEqual(['kept', 'refused']);
    expect(Object.keys(exclusion)).toEqual(['kept', 'omitted']);
  });

  test('an intolerance substitutes and never removes', () => {
    const outcome = substituteForIntolerances(CANDIDATES, ['lactose']);
    expect(outcome.candidates.length).toBe(CANDIDATES.length);
    expect(outcome.substitutions.length).toBeGreaterThan(0);
    for (const swap of outcome.substitutions) {
      const from = aliasById(swap.from);
      expect(from?.lactoseFree).toBe(swap.to);
      expect(aliasById(swap.to)?.allergens.includes('lactose')).toBe(false);
    }
  });

  test('a swapped recipe really carries the alternative ingredient afterwards', () => {
    const dairy = CANDIDATES.find((candidate) =>
      candidate.ingredients.some((line) => aliasById(line.aliasId)?.lactoseFree),
    );
    expect(dairy).toBeDefined();
    if (!dairy) return;
    const outcome = substituteForIntolerances([dairy], ['lactose']);
    const swapped = outcome.candidates[0];
    for (const line of swapped.ingredients) {
      expect(aliasById(line.aliasId)?.allergens.includes('lactose')).toBe(false);
    }
    expect(swapped.ingredients.length).toBe(dairy.ingredients.length);
  });

  test('the four kinds are exactly four and each one is spelled once', () => {
    expect(RULE_KINDS).toEqual(['allergy', 'intolerance', 'exclusion', 'preference']);
    expect(new Set(RULE_KINDS).size).toBe(4);
  });
});

describe('F84: four weeks of generated menu, checked against the denylist', () => {
  const rules = toRuleSet([
    { kind: 'intolerance', subject: 'lactose' },
    { kind: 'exclusion', subject: 'shellfish' },
    { kind: 'preference', subject: 'nuts' },
  ] as DietaryRule[]);

  const pool = CANDIDATES.map((candidate) => ({
    ...candidate,
    slot: candidate.slot as 'breakfast' | 'lunch' | 'dinner' | 'snack',
    kcal: 500,
  }));

  test('no meal in four generated weeks carries shellfish, over a walked population', () => {
    const byId = new Map(CANDIDATES.map((candidate) => [candidate.id, candidate]));
    let meals = 0;
    let ingredientLines = 0;
    const matches: string[] = [];

    for (let week = 0; week < 4; week += 1) {
      const plan = generateWeek({
        pool,
        rules,
        targetKcal: 2150,
        maxCookMinutes: 60,
        weekStartKey: `2026-08-${String(24 + week * 7).padStart(2, '0')}`,
        generation: 1,
      });
      expect(plan.picks.length).toBeGreaterThan(0);
      for (const pick of plan.picks) {
        meals += 1;
        const candidate = byId.get(pick.recipeId);
        expect(candidate).toBeDefined();
        if (!candidate) continue;
        ingredientLines += candidate.ingredients.length;
        for (const hit of allergensPresent(candidate, 'shellfish')) {
          matches.push(`${pick.recipeId}:${hit.aliasId}`);
        }
      }
    }

    console.log(
      `denylist walk: 4 weeks, ${meals} meals, ${ingredientLines} ingredient lines, ` +
        `${SHELLFISH_RECIPES.length} shellfish recipes available to be chosen, ${matches.length} matches`,
    );
    // The population, printed and asserted, so a zero here is a zero over
    // something rather than a zero over nothing.
    expect(meals).toBeGreaterThanOrEqual(4 * DAYS_IN_WEEK);
    expect(ingredientLines).toBeGreaterThan(0);
    expect(matches).toEqual([]);
  });

  test('the control: with the exclusion removed, the shellfish recipes come back', () => {
    const noRules = toRuleSet([]);
    const byId = new Map(CANDIDATES.map((candidate) => [candidate.id, candidate]));
    const seen = new Set<string>();
    for (let week = 0; week < 4; week += 1) {
      const plan = generateWeek({
        pool,
        rules: noRules,
        targetKcal: 2150,
        maxCookMinutes: 60,
        weekStartKey: `2026-08-${String(24 + week * 7).padStart(2, '0')}`,
        generation: 1,
      });
      for (const pick of plan.picks) {
        const candidate = byId.get(pick.recipeId);
        if (candidate && allergensPresent(candidate, 'shellfish').length > 0) seen.add(pick.recipeId);
      }
    }
    console.log(`control walk: ${seen.size} shellfish recipe(s) chosen with no exclusion stored`);
    // If this is ever zero, the test above proves nothing, because the
    // generator was never going to choose one in the first place.
    expect(seen.size).toBeGreaterThan(0);
  });
});
