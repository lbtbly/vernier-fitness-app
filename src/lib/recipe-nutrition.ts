import { createHash } from 'node:crypto';
import type { MacroSet } from '@/lib/macros';
import { NUTRITION } from '@/lib/nutrition';

/**
 * A recipe's nutrition, computed from its ingredient rows and stored as a
 * versioned snapshot with its provenance beside it.
 *
 * F87 IN ONE FILE. Three things have to be true at once and each of them is a
 * separate number here rather than a judgement made at render time:
 *
 *   `coveragePct`       the share of the recipe's mass that resolved to a food
 *                       row at all. Below 85 percent the energy renders as a
 *                       range and the shortfall is stated, because the mass
 *                       that did not resolve could carry anything.
 *   `fibreCoveragePct`  the same share counted only where fibre was not null.
 *                       Its own number, because fibre is the field most likely
 *                       to be missing and one coverage figure would hide
 *                       exactly that. Anses leaves fibre out on seventy rows.
 *   `sourceFoodIdsHash` every ingredient's food id and every stored nutrient,
 *                       hashed in order. When an Anses row behind this recipe
 *                       changes, the hash changes, and a changed hash RAISES A
 *                       QUESTION rather than replacing the stored figures.
 *
 * A NULL NUTRIENT IS NOT A ZERO AND IS NOT SUMMED AS ONE. An ingredient with no
 * published fibre contributes nothing to the fibre total and drops the fibre
 * coverage instead, so the answer is "23 g of fibre across 82 percent of the
 * mass" and never "23 g" as if the other 18 percent had been measured at zero.
 * When no ingredient at all carries a nutrient, the total is null and the
 * screen says unknown.
 */

/** One food row, as the sum needs it. Per 100 g, every nutrient nullable. */
export type FoodFacts = {
  id: string;
  source: string;
  kcal100g: number | null;
  proteinG: number | null;
  carbG: number | null;
  fatG: number | null;
  fibreG: number | null;
  energySource: string | null;
};

export type IngredientLine = {
  aliasId: string;
  grams: number;
  /** The resolved food row, or null when nothing in the table matched. */
  food: FoodFacts | null;
};

export type Provenance =
  | 'computed_ciqual'
  | 'computed_mixed'
  | 'computed_partial'
  | 'user_entered'
  | 'ai_estimate'
  | 'label_scan';

export type RecipeNutrition = {
  perServing: MacroSet;
  provenance: Provenance;
  coveragePct: number;
  fibreCoveragePct: number;
  sourceFoodIdsHash: string;
  computedEnergyCount: number;
  ingredientCount: number;
  unresolvedCount: number;
  /** True when the mass coverage sits under the 85 percent threshold. */
  wideRange: boolean;
};

const NUTRIENTS = ['kcal100g', 'proteinG', 'carbG', 'fatG', 'fibreG'] as const;

type NutrientKey = (typeof NUTRIENTS)[number];

const PER_SERVING_KEY: Record<NutrientKey, keyof MacroSet> = {
  kcal100g: 'kcal',
  proteinG: 'proteinG',
  carbG: 'carbG',
  fatG: 'fatG',
  fibreG: 'fibreG',
};

/**
 * The hash the question turns on.
 *
 * It covers the ingredient list AND the nutrients of every row behind it, in
 * order, because both can move: a recipe can gain an ingredient, and an Anses
 * release can change a number under an ingredient that did not move. A hash
 * over the ids alone would miss the second, which is the case the research
 * warns about and the one nobody would notice.
 */
export function sourceHash(lines: IngredientLine[]): string {
  const digest = createHash('sha256');
  for (const line of lines) {
    const food = line.food;
    digest.update(
      [
        line.aliasId,
        line.grams.toFixed(3),
        food?.id ?? '',
        food?.kcal100g ?? '',
        food?.proteinG ?? '',
        food?.carbG ?? '',
        food?.fatG ?? '',
        food?.fibreG ?? '',
        food?.energySource ?? '',
      ].join('\u001f'),
    );
    // A separator between ingredient lines, written as an escape rather than
    // as the byte itself so it is legible in the file. Without one the fields
    // of two adjacent ingredients run together, and two different splits of the
    // same characters would hash identically. The unit separator does the same
    // job inside a line: an ingredient name holding a space cannot impersonate
    // a field boundary.
    digest.update('\u001e');
  }
  return digest.digest('hex').slice(0, 32);
}

export function computeRecipeNutrition(
  lines: IngredientLine[],
  servings: number,
): RecipeNutrition {
  const portions = Math.max(1, servings);
  const totalMass = lines.reduce((sum, line) => sum + line.grams, 0);
  let resolvedMass = 0;
  let fibreMass = 0;
  let unresolvedCount = 0;
  let computedEnergyCount = 0;
  let nonCiqual = 0;

  const totals: Record<NutrientKey, number | null> = {
    kcal100g: null,
    proteinG: null,
    carbG: null,
    fatG: null,
    fibreG: null,
  };

  for (const line of lines) {
    const food = line.food;
    if (!food) {
      unresolvedCount += 1;
      continue;
    }
    resolvedMass += line.grams;
    if (food.source !== 'ciqual') nonCiqual += 1;
    if (food.energySource === 'computed_atwater') computedEnergyCount += 1;
    if (food.fibreG !== null) fibreMass += line.grams;
    const share = line.grams / 100;
    for (const key of NUTRIENTS) {
      const value = food[key];
      if (value === null) continue;
      totals[key] = (totals[key] ?? 0) + value * share;
    }
  }

  const perServing: MacroSet = {
    kcal: null,
    proteinG: null,
    carbG: null,
    fatG: null,
    fibreG: null,
  };
  for (const key of NUTRIENTS) {
    const total = totals[key];
    perServing[PER_SERVING_KEY[key]] = total === null ? null : total / portions;
  }

  const coveragePct = totalMass === 0 ? 0 : (resolvedMass / totalMass) * 100;
  const fibreCoveragePct = totalMass === 0 ? 0 : (fibreMass / totalMass) * 100;

  const provenance: Provenance =
    unresolvedCount > 0 ? 'computed_partial' : nonCiqual > 0 ? 'computed_mixed' : 'computed_ciqual';

  return {
    perServing,
    provenance,
    coveragePct,
    fibreCoveragePct,
    sourceFoodIdsHash: sourceHash(lines),
    computedEnergyCount,
    ingredientCount: lines.length,
    unresolvedCount,
    wideRange: coveragePct < NUTRITION.coverageRangeThresholdPct,
  };
}

/** True when the stored snapshot no longer matches the rows behind it. */
export function snapshotIsStale(storedHash: string, lines: IngredientLine[]): boolean {
  return storedHash !== sourceHash(lines);
}
