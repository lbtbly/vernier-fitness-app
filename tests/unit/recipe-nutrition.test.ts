import { describe, expect, test } from 'vitest';
import { NUTRITION } from '@/lib/nutrition';
import {
  computeRecipeNutrition,
  snapshotIsStale,
  sourceHash,
  type FoodFacts,
  type IngredientLine,
} from '@/lib/recipe-nutrition';

/**
 * A recipe's nutrition, computed from ingredient rows, graded as arithmetic.
 *
 * F87 asks for four things at once and each one is a separate number here:
 * a versioned per-serving snapshot, its provenance, its mass coverage, and a
 * SEPARATE fibre coverage. Plus the clause that matters most: a changed
 * ingredient-source hash raises a question rather than replacing the snapshot,
 * which means the hash has to move when a source nutrient moves.
 *
 * WHAT WOULD MAKE THESE GO RED. Treating a null nutrient as zero fails the
 * coverage tests, because the fibre total would stop being null and the fibre
 * coverage would stop differing from the mass coverage. Hashing only the food
 * ids, which is the obvious shortcut, fails "an Anses release that changes a
 * number under an ingredient that did not move": that is the case nobody would
 * notice in production and it is the case the hash exists for.
 */

function food(overrides: Partial<FoodFacts> = {}): FoodFacts {
  return {
    id: 'ciqual:1',
    source: 'ciqual',
    kcal100g: 100,
    proteinG: 10,
    carbG: 5,
    fatG: 2,
    fibreG: 3,
    energySource: 'published',
    ...overrides,
  };
}

const SIMPLE: IngredientLine[] = [
  { aliasId: 'a', grams: 100, food: food({ id: 'ciqual:1' }) },
  { aliasId: 'b', grams: 200, food: food({ id: 'ciqual:2', kcal100g: 50, proteinG: 2, carbG: 10, fatG: 1, fibreG: 1 }) },
];

describe('the sum', () => {
  test('per-serving figures divide the whole recipe by its servings', () => {
    const one = computeRecipeNutrition(SIMPLE, 1);
    const two = computeRecipeNutrition(SIMPLE, 2);
    // 100 g at 100 kcal plus 200 g at 50 kcal is 200 kcal.
    expect(one.perServing.kcal).toBeCloseTo(200, 5);
    expect(two.perServing.kcal).toBeCloseTo(100, 5);
    expect(one.perServing.proteinG).toBeCloseTo(14, 5);
    expect(one.perServing.fibreG).toBeCloseTo(5, 5);
  });

  test('every ingredient resolving to an Anses row gives 100 percent coverage', () => {
    const computed = computeRecipeNutrition(SIMPLE, 1);
    expect(computed.coveragePct).toBeCloseTo(100, 5);
    expect(computed.fibreCoveragePct).toBeCloseTo(100, 5);
    expect(computed.provenance).toBe('computed_ciqual');
    expect(computed.unresolvedCount).toBe(0);
    expect(computed.wideRange).toBe(false);
  });
});

describe('a null nutrient is not summed as zero', () => {
  const withoutFibre: IngredientLine[] = [
    { aliasId: 'a', grams: 100, food: food({ id: 'ciqual:1' }) },
    { aliasId: 'b', grams: 300, food: food({ id: 'ciqual:2', fibreG: null }) },
  ];

  test('the fibre total counts only the mass that had a fibre value', () => {
    const computed = computeRecipeNutrition(withoutFibre, 1);
    // Only the first 100 g carried fibre: 3 g, not 3 + 0.
    expect(computed.perServing.fibreG).toBeCloseTo(3, 5);
  });

  test('fibre coverage is its own number and drops below the mass coverage', () => {
    const computed = computeRecipeNutrition(withoutFibre, 1);
    expect(computed.coveragePct).toBeCloseTo(100, 5);
    expect(computed.fibreCoveragePct).toBeCloseTo(25, 5);
    expect(computed.fibreCoveragePct).toBeLessThan(computed.coveragePct);
  });

  test('a nutrient no ingredient carries comes back null, not zero', () => {
    const noFibreAnywhere: IngredientLine[] = [
      { aliasId: 'a', grams: 100, food: food({ fibreG: null }) },
      { aliasId: 'b', grams: 100, food: food({ id: 'ciqual:2', fibreG: null }) },
    ];
    const computed = computeRecipeNutrition(noFibreAnywhere, 1);
    expect(computed.perServing.fibreG).toBeNull();
    expect(computed.perServing.fibreG).not.toBe(0);
    expect(computed.fibreCoveragePct).toBe(0);
  });
});

describe('coverage below 85 percent widens the range and says so', () => {
  test('an unresolved ingredient drops the coverage and changes the provenance', () => {
    const partial: IngredientLine[] = [
      { aliasId: 'a', grams: 100, food: food() },
      { aliasId: 'b', grams: 400, food: null },
    ];
    const computed = computeRecipeNutrition(partial, 1);
    expect(computed.coveragePct).toBeCloseTo(20, 5);
    expect(computed.unresolvedCount).toBe(1);
    expect(computed.provenance).toBe('computed_partial');
    expect(computed.wideRange).toBe(true);
  });

  /*
   * AND THE LINE WITH NO NAME AT ALL, WHICH IS THE ONE THE PRODUCT ACTUALLY
   * PRODUCES.
   *
   * Every case in this block passed while the branch was unreachable in the
   * shipped product, which is worth writing down. They all use `aliasId: 'b'`
   * with `food: null`: an ingredient the alias layer names and the food table
   * does not carry. Nothing in the shipped catalogue is in that state, and the
   * one importer that could produce an unresolved line, the recipe box, dropped
   * every one of them before they became rows. So the arithmetic below was
   * correct and no input the product could build ever reached it.
   *
   * A weighed line with no alias is what a recipe card really hands this app,
   * and it is now stored. This is the same sum over that shape.
   *
   * GOES RED IF: a line with no alias stops counting towards total mass, which
   * would put the shortfall back where it was.
   */
  test('a weighed line with no name at all is mass the coverage has to answer for', () => {
    const fromACard: IngredientLine[] = [
      { aliasId: 'potatoes', grams: 300, food: food() },
      { aliasId: null, grams: 200, food: null },
    ];
    const computed = computeRecipeNutrition(fromACard, 1);
    console.log(
      `500 g on the card, 300 g named: coverage ${computed.coveragePct.toFixed(1)}%, ` +
        `wideRange ${computed.wideRange}, provenance ${computed.provenance}`,
    );
    expect(computed.coveragePct).toBeCloseTo(60, 5);
    expect(computed.unresolvedCount).toBe(1);
    expect(computed.ingredientCount).toBe(2);
    expect(computed.provenance).toBe('computed_partial');
    expect(computed.wideRange).toBe(true);
    // And the number it computed is the named third's, not a figure for 500 g.
    expect(computed.perServing.kcal).toBeCloseTo(3 * (food().kcal100g ?? 0), 5);
  });

  test('a line with no name still moves the source hash, so it cannot be invisible', () => {
    const withIt = sourceHash([
      { aliasId: 'potatoes', grams: 300, food: food() },
      { aliasId: null, grams: 200, food: null },
    ]);
    const withoutIt = sourceHash([{ aliasId: 'potatoes', grams: 300, food: food() }]);
    console.log(`with the unnamed line ${withIt}, without it ${withoutIt}`);
    expect(withIt).not.toBe(withoutIt);
  });

  test('the threshold is the published 85 percent and nothing else', () => {
    expect(NUTRITION.coverageRangeThresholdPct).toBe(85);
    const justUnder: IngredientLine[] = [
      { aliasId: 'a', grams: 84, food: food() },
      { aliasId: 'b', grams: 16, food: null },
    ];
    const justOver: IngredientLine[] = [
      { aliasId: 'a', grams: 86, food: food() },
      { aliasId: 'b', grams: 14, food: null },
    ];
    expect(computeRecipeNutrition(justUnder, 1).wideRange).toBe(true);
    expect(computeRecipeNutrition(justOver, 1).wideRange).toBe(false);
  });

  test('a row from another source makes the provenance mixed rather than pure', () => {
    const mixed: IngredientLine[] = [
      { aliasId: 'a', grams: 100, food: food() },
      { aliasId: 'b', grams: 100, food: food({ id: 'off:1', source: 'off' }) },
    ];
    expect(computeRecipeNutrition(mixed, 1).provenance).toBe('computed_mixed');
  });
});

describe('the computed-energy marker survives the sum', () => {
  test('ingredients whose energy Vernier computed are counted, not hidden', () => {
    const lines: IngredientLine[] = [
      { aliasId: 'a', grams: 100, food: food({ energySource: 'published' }) },
      { aliasId: 'b', grams: 100, food: food({ id: 'ciqual:2', energySource: 'computed_atwater' }) },
    ];
    const computed = computeRecipeNutrition(lines, 1);
    expect(computed.computedEnergyCount).toBe(1);
    expect(computed.ingredientCount).toBe(2);
  });
});

describe('the source hash is what raises a question', () => {
  test('it moves when an ingredient is added', () => {
    const before = sourceHash(SIMPLE);
    const after = sourceHash([...SIMPLE, { aliasId: 'c', grams: 10, food: food({ id: 'ciqual:3' }) }]);
    expect(after).not.toBe(before);
  });

  test('it moves when a gram weight changes', () => {
    const before = sourceHash(SIMPLE);
    const after = sourceHash([{ ...SIMPLE[0], grams: 101 }, SIMPLE[1]]);
    expect(after).not.toBe(before);
  });

  test('IT MOVES WHEN A NUTRIENT UNDER AN UNCHANGED INGREDIENT CHANGES', () => {
    // The case a hash over ids alone would miss: the recipe did not move, the
    // Anses release did. Nobody would notice this in production, which is the
    // whole reason the hash covers the numbers and not just the identifiers.
    const before = sourceHash(SIMPLE);
    const moved: IngredientLine[] = [
      { ...SIMPLE[0], food: food({ id: 'ciqual:1', fibreG: 3.4 }) },
      SIMPLE[1],
    ];
    expect(sourceHash(moved)).not.toBe(before);
    expect(snapshotIsStale(before, moved)).toBe(true);
  });

  test('it does not move when nothing moved', () => {
    expect(snapshotIsStale(sourceHash(SIMPLE), SIMPLE)).toBe(false);
  });

  test('it moves when a resolved ingredient stops resolving', () => {
    const before = sourceHash(SIMPLE);
    const lost: IngredientLine[] = [{ ...SIMPLE[0], food: null }, SIMPLE[1]];
    expect(sourceHash(lost)).not.toBe(before);
  });
});
