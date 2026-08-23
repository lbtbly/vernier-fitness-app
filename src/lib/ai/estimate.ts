import { type MacroSet, roundEnergy, roundMacro } from '@/lib/macros';
import { NUTRITION } from '@/lib/nutrition';
import { computeRecipeNutrition, type IngredientLine } from '@/lib/recipe-nutrition';

/**
 * A photograph becomes a range, and it never becomes a number.
 *
 * THE EVIDENCE IS THE WHOLE OF THIS FILE. Lucassen 2021, J Hum Nutr Diet
 * 34:945-952, PMID 33761165: only 35 percent of image-based portion estimates
 * landed within 25 percent of the true amount, and only 13 percent within 10
 * percent. So a photograph presented as "487 kcal" is a lie about precision,
 * and a plus or minus 10 percent band would still be wrong seven times in
 * eight. `.forge/research/nutrition-data.md` section 7 sets the rule this file
 * implements: never a bare point, a band of minus 25 to plus 35 percent, and a
 * grid coarser than the error.
 *
 * NEVER A BARE POINT IS A TYPE, NOT A HABIT. `PortionRange` has a low and a
 * high and no third field, and `estimateOf` is the only way to build one. A
 * screen cannot render a point from a photograph because there is no point
 * anywhere in what it is handed. A weighed line is a different thing: it has
 * `exactGrams` set, it is not an estimate, and it says so.
 *
 * THE MODEL RECOGNISES, THE APP COMPUTES. Claude returns what it thinks is on
 * the plate and roughly how much, as an alias from this product's own list. The
 * band, the grid, the nutrition and the arithmetic all happen here, off Anses
 * rows, because a nutrition figure the model wrote down is a figure with no
 * provenance and slice 9 already built the one that has some.
 */

/** How well the amount is known, which is what fixes the width of the band. */
export type PortionEvidence = 'photo' | 'named_portion' | 'weighed';

export type PortionRange = {
  /** The alias in src/lib/food-aliases.ts. Its name is copy and lives in the catalogue. */
  aliasId: string;
  gramsLow: number;
  gramsHigh: number;
  /** Set only when the owner weighed it. A weighed line is not an estimate. */
  exactGrams: number | null;
  evidence: PortionEvidence;
};

/** What the model said, before this product has done anything with it. */
export type ModelItem = { aliasId: string | null; text: string; grams: number };

export type ModelReading = { items: ModelItem[]; note: string };

/**
 * The band, from the research table, per level of evidence.
 *
 * Asymmetric on purpose: under-reporting is the documented direction of error
 * in self-reported dietary assessment, so the high side is wider.
 */
export function bandFor(evidence: PortionEvidence): { low: number; high: number } {
  if (evidence === 'weighed') return { low: 1, high: 1 };
  if (evidence === 'named_portion') return NUTRITION.namedPortionBand;
  return NUTRITION.photoEstimateBand;
}

/**
 * Grams onto the coarse grid.
 *
 * Ten grams, because the band around a 160 g fillet is 40 g wide on the low
 * side and 56 g on the high one, and a gram-precise edge on a 96 g interval is
 * theatre. The wireframe draws 140 to 180 and 90 to 120 for the same reason.
 */
export function snapGrams(grams: number): number {
  const grid = NUTRITION.roundPortionEstimatedG;
  return Math.max(grid, Math.round(grams / grid) * grid);
}

/** One item, as a range. The only constructor of a portion in this product. */
export function portionOf(
  aliasId: string,
  grams: number,
  evidence: PortionEvidence,
): PortionRange {
  if (evidence === 'weighed') {
    const exact = Math.max(1, Math.round(grams));
    return { aliasId, gramsLow: exact, gramsHigh: exact, exactGrams: exact, evidence };
  }
  const band = bandFor(evidence);
  return {
    aliasId,
    gramsLow: snapGrams(grams * band.low),
    gramsHigh: snapGrams(grams * band.high),
    exactGrams: null,
    evidence,
  };
}

/** True when this line still carries a range rather than a weight. */
export function isEstimated(portion: PortionRange): boolean {
  return portion.exactGrams === null;
}

/**
 * The five numbers, at both ends of the plate.
 *
 * Computed twice through slice 9's own `computeRecipeNutrition`, once with
 * every line at its low gram figure and once at its high one, so there is no
 * second nutrition model in this repository and a nutrient the food table does
 * not carry stays null at both ends rather than becoming a zero at one.
 */
export type EstimateTotals = {
  low: MacroSet;
  high: MacroSet;
  /** The middle of each range, which is what a confirmed entry stores. */
  mid: MacroSet;
  coveragePct: number;
  fibreCoveragePct: number;
  unresolvedCount: number;
  /** True while any line still carries a range. */
  estimated: boolean;
};

type FoodLookup = (aliasId: string) => IngredientLine['food'];

function linesAt(
  portions: PortionRange[],
  end: 'low' | 'high',
  lookup: FoodLookup,
): IngredientLine[] {
  return portions.map((portion) => ({
    aliasId: portion.aliasId,
    grams: end === 'low' ? portion.gramsLow : portion.gramsHigh,
    food: lookup(portion.aliasId),
  }));
}

function midOf(low: MacroSet, high: MacroSet, estimated: boolean): MacroSet {
  const middle = (a: number | null, b: number | null) => (a === null || b === null ? null : (a + b) / 2);
  const grid = estimated ? 'estimated' : 'computed';
  const kcal = middle(low.kcal, high.kcal);
  return {
    kcal: kcal === null ? null : roundEnergy(kcal, grid),
    proteinG: nullableRound(middle(low.proteinG, high.proteinG), grid),
    carbG: nullableRound(middle(low.carbG, high.carbG), grid),
    fatG: nullableRound(middle(low.fatG, high.fatG), grid),
    fibreG: nullableRound(middle(low.fibreG, high.fibreG), grid),
  };
}

function nullableRound(value: number | null, grid: 'estimated' | 'computed'): number | null {
  return value === null ? null : roundMacro(value, grid);
}

function roundSet(macros: MacroSet, grid: 'estimated' | 'computed'): MacroSet {
  return {
    kcal: macros.kcal === null ? null : roundEnergy(macros.kcal, grid),
    proteinG: nullableRound(macros.proteinG, grid),
    carbG: nullableRound(macros.carbG, grid),
    fatG: nullableRound(macros.fatG, grid),
    fibreG: nullableRound(macros.fibreG, grid),
  };
}

export function totalsOf(portions: PortionRange[], lookup: FoodLookup): EstimateTotals {
  const estimated = portions.some(isEstimated);
  const grid = estimated ? 'estimated' : 'computed';
  const lowSide = computeRecipeNutrition(linesAt(portions, 'low', lookup), 1);
  const highSide = computeRecipeNutrition(linesAt(portions, 'high', lookup), 1);
  return {
    low: roundSet(lowSide.perServing, grid),
    high: roundSet(highSide.perServing, grid),
    mid: midOf(lowSide.perServing, highSide.perServing, estimated),
    // The high side and the low side walk the same lines, so either coverage
    // answers for both. The high one is read because it is the mass the day
    // total is closer to.
    coveragePct: highSide.coveragePct,
    fibreCoveragePct: highSide.fibreCoveragePct,
    unresolvedCount: highSide.unresolvedCount,
    estimated,
  };
}

/**
 * What the model is asked to send back, and what happens when it sends
 * something else.
 *
 * A reply that does not parse is a failure with a cause, never a default and
 * never a partial guess. There is no fallback item, no "unknown food" row and
 * no zero: an unreadable reply leaves the owner exactly where he was, with the
 * photograph still on screen and the typed path one tap away.
 */
export type ParseOutcome =
  | { ok: true; reading: ModelReading }
  | { ok: false; reason: 'not_json' | 'no_items' | 'bad_item' };

export function parseModelReading(text: string): ParseOutcome {
  const trimmed = text.trim();
  // A reply wrapped in a fenced block is still a reply. Nothing else is
  // repaired: this strips the fence and parses, or it fails with a cause.
  const body = trimmed.startsWith('```')
    ? trimmed.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim()
    : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, reason: 'not_json' };
  }

  const holder = parsed as { items?: unknown; note?: unknown };
  if (!Array.isArray(holder.items) || holder.items.length === 0) {
    return { ok: false, reason: 'no_items' };
  }

  const items: ModelItem[] = [];
  for (const entry of holder.items) {
    const item = entry as { alias?: unknown; text?: unknown; grams?: unknown };
    const grams = typeof item.grams === 'number' ? item.grams : Number(item.grams);
    if (!Number.isFinite(grams) || grams <= 0) return { ok: false, reason: 'bad_item' };
    if (typeof item.text !== 'string' || item.text.trim() === '') return { ok: false, reason: 'bad_item' };
    items.push({
      aliasId: typeof item.alias === 'string' && item.alias.trim() !== '' ? item.alias.trim() : null,
      text: item.text.trim(),
      grams,
    });
  }

  return {
    ok: true,
    reading: { items, note: typeof holder.note === 'string' ? holder.note.trim() : '' },
  };
}
