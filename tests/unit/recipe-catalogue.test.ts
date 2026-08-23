import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseFoodCsv } from '@/db/foods';
import { aliasById, aliasFoodId, aliasName } from '@/lib/food-aliases';
import { energyText, macroText, roundMacro } from '@/lib/macros';
import { computeRecipeNutrition, type IngredientLine } from '@/lib/recipe-nutrition';
import { RECIPE_CATALOGUE, type CatalogueRecipe } from '@/lib/recipe-catalogue';
import { strings } from '@/lib/strings';

/**
 * The shipped catalogue, computed against the shipped food table.
 *
 * This is the closest a unit test gets to the product path: it resolves every
 * recipe's ingredient rows against the CSV that is actually committed and sums
 * them with the same function the snapshot writer uses. A gram weight typed
 * against the wrong Anses row shows up here as a 4,000 kcal breakfast, months
 * before anybody would notice it on a screen.
 *
 * It also proves the two things F85 and F82 turn on: that the free-from variant
 * really produces DIFFERENT numbers rather than the same ones relabelled, and
 * that every rendered macronutrient across the whole catalogue carries no
 * decimal place.
 */

const rows = parseFoodCsv(readFileSync(join(process.cwd(), 'drizzle', 'seed', 'foods.csv'), 'utf8'));
const byId = new Map(rows.map((row) => [row.id, row]));

function resolve(recipe: CatalogueRecipe, variant: 'base' | 'lactose_free'): IngredientLine[] {
  return recipe.ingredients.map((line) => {
    const alias = aliasById(line.aliasId);
    const useId =
      variant === 'lactose_free' && alias?.lactoseFree ? alias.lactoseFree : line.aliasId;
    const useAlias = aliasById(useId);
    const row = useAlias ? byId.get(aliasFoodId(useAlias)) : undefined;
    return {
      aliasId: useId,
      grams: line.grams,
      food: row
        ? {
            id: row.id,
            source: row.source,
            // The insert type makes a nullable column optional, so an absent
            // key and a null are two shapes of the same fact here. Both become
            // null, which is the only shape the sum understands.
            kcal100g: row.kcal100g ?? null,
            proteinG: row.proteinG ?? null,
            carbG: row.carbG ?? null,
            fatG: row.fatG ?? null,
            fibreG: row.fibreG ?? null,
            energySource: row.energySource ?? null,
          }
        : null,
    };
  });
}

describe('every shipped recipe computes to a plausible meal', () => {
  test('the population walked is the whole catalogue and it is not empty', () => {
    console.log(`catalogue: ${RECIPE_CATALOGUE.length} recipes against ${rows.length} food rows`);
    expect(RECIPE_CATALOGUE.length).toBeGreaterThanOrEqual(20);
    expect(rows.length).toBeGreaterThan(3000);
  });

  test('each one resolves every ingredient and lands inside a sane energy band', () => {
    const report: string[] = [];
    for (const recipe of RECIPE_CATALOGUE) {
      const computed = computeRecipeNutrition(resolve(recipe, 'base'), recipe.servings);
      report.push(
        `${strings.nutrition.recipes[recipe.nameKey]}: ${energyText(computed.perServing.kcal)} kcal, ` +
          `P ${macroText(computed.perServing.proteinG)} C ${macroText(computed.perServing.carbG)} ` +
          `F ${macroText(computed.perServing.fatG)} fibre ${macroText(computed.perServing.fibreG)}, ` +
          `coverage ${computed.coveragePct.toFixed(0)}%, fibre ${computed.fibreCoveragePct.toFixed(0)}%`,
      );
      expect(computed.unresolvedCount).toBe(0);
      expect(computed.coveragePct).toBeCloseTo(100, 5);
      expect(computed.perServing.kcal).not.toBeNull();
      const kcal = computed.perServing.kcal ?? 0;
      const floor = recipe.slot === 'snack' ? 120 : 300;
      const ceiling = recipe.slot === 'snack' ? 600 : 1100;
      expect(kcal).toBeGreaterThan(floor);
      expect(kcal).toBeLessThan(ceiling);
      expect(computed.perServing.proteinG).not.toBeNull();
      expect(computed.perServing.carbG).not.toBeNull();
      expect(computed.perServing.fatG).not.toBeNull();
    }
    console.log(report.join('\n'));
  });

  test('no rendered macronutrient anywhere in the catalogue carries a decimal place', () => {
    let cells = 0;
    for (const recipe of RECIPE_CATALOGUE) {
      const computed = computeRecipeNutrition(resolve(recipe, 'base'), recipe.servings);
      for (const value of [
        computed.perServing.proteinG,
        computed.perServing.carbG,
        computed.perServing.fatG,
        computed.perServing.fibreG,
      ]) {
        cells += 1;
        const text = macroText(value === null ? null : roundMacro(value, 'computed'));
        expect(text).not.toContain('.');
      }
    }
    console.log(`macro cells rendered: ${cells}`);
    expect(cells).toBe(RECIPE_CATALOGUE.length * 4);
  });
});

describe('the lactose-free variant is a different computation, not a relabelled one', () => {
  const dairyRecipes = RECIPE_CATALOGUE.filter((recipe) =>
    recipe.ingredients.some((line) => aliasById(line.aliasId)?.lactoseFree),
  );

  test('the catalogue actually has dairy recipes to swap', () => {
    console.log(
      `dairy recipes: ${dairyRecipes.length} of ${RECIPE_CATALOGUE.length}: ` +
        dairyRecipes.map((recipe) => recipe.id).join(', '),
    );
    expect(dairyRecipes.length).toBeGreaterThan(0);
  });

  test('every dairy item offers a free-from alternative that is a real Anses row', () => {
    for (const recipe of dairyRecipes) {
      for (const line of recipe.ingredients) {
        const alias = aliasById(line.aliasId);
        if (!alias?.lactoseFree) continue;
        const replacement = aliasById(alias.lactoseFree);
        expect(replacement).toBeTruthy();
        if (!replacement) continue;
        expect(byId.has(aliasFoodId(replacement))).toBe(true);
        expect(replacement.allergens.includes('lactose')).toBe(false);
      }
    }
  });

  test('swapping recomputes the macronutrients, and at least one number moves', () => {
    let moved = 0;
    for (const recipe of dairyRecipes) {
      const base = computeRecipeNutrition(resolve(recipe, 'base'), recipe.servings);
      const free = computeRecipeNutrition(resolve(recipe, 'lactose_free'), recipe.servings);
      const differs =
        Math.round(base.perServing.kcal ?? 0) !== Math.round(free.perServing.kcal ?? 0) ||
        Math.round(base.perServing.proteinG ?? 0) !== Math.round(free.perServing.proteinG ?? 0) ||
        Math.round(base.perServing.fatG ?? 0) !== Math.round(free.perServing.fatG ?? 0);
      const swapped = recipe.ingredients
        .map((line) => aliasById(line.aliasId))
        .find((alias) => alias?.lactoseFree);
      console.log(
        `${recipe.id}: ${swapped ? aliasName(swapped) : ''} swapped, ` +
          `base ${energyText(base.perServing.kcal)} kcal / free-from ${energyText(free.perServing.kcal)} kcal`,
      );
      expect(differs).toBe(true);
      if (differs) moved += 1;
      // The hash has to move too, or nothing downstream would know.
      expect(free.sourceFoodIdsHash).not.toBe(base.sourceFoodIdsHash);
    }
    expect(moved).toBe(dairyRecipes.length);
  });

  test('the plant alternative with no published fibre moves the fibre coverage', () => {
    const recipe = RECIPE_CATALOGUE.find((entry) =>
      entry.ingredients.some((line) => aliasById(line.aliasId)?.lactoseFree === 'plant-dessert'),
    );
    expect(recipe).toBeDefined();
    if (!recipe) return;
    const base = computeRecipeNutrition(resolve(recipe, 'base'), recipe.servings);
    const free = computeRecipeNutrition(resolve(recipe, 'lactose_free'), recipe.servings);
    console.log(
      `${recipe.id}: fibre coverage ${base.fibreCoveragePct.toFixed(0)}% -> ${free.fibreCoveragePct.toFixed(0)}%`,
    );
    expect(base.fibreCoveragePct).toBe(100);
    expect(free.fibreCoveragePct).toBeLessThan(100);
  });
});

describe('the computed-energy marker reaches a real meal', () => {
  test('at least one shipped recipe carries an ingredient Vernier computed the energy of', () => {
    const carrying = RECIPE_CATALOGUE.filter((recipe) => {
      const computed = computeRecipeNutrition(resolve(recipe, 'base'), recipe.servings);
      return computed.computedEnergyCount > 0;
    });
    console.log(
      `recipes reaching a computed-energy row: ${carrying.length}: ${carrying.map((r) => r.id).join(', ')}`,
    );
    expect(carrying.length).toBeGreaterThan(0);
  });
});
