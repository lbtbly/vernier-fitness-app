import { NUTRITION } from '@/lib/nutrition';
import { strings } from '@/lib/strings';

/**
 * How a nutrition number is allowed to reach a screen.
 *
 * Three rules, all from `.forge/research/nutrition-data.md` section 6.4, and
 * all of them implemented here rather than promised in a comment:
 *
 * 1. A missing nutrient is null and renders "unknown". Never 0. A zero is a
 *    measurement and absence is not, and fibre is the field where the two get
 *    confused most often.
 * 2. No decimal place on any macronutrient. "Protein 32 g", never "31.7 g". A
 *    decimal on an estimate is a lie about precision.
 * 3. Energy rounds outward to the nearest 10 when it was computed from
 *    ingredient rows and to the nearest 25 when it was estimated from a photo.
 *    A grid finer than the error is theatre.
 */

export type MacroSet = {
  kcal: number | null;
  proteinG: number | null;
  carbG: number | null;
  fatG: number | null;
  fibreG: number | null;
};

export const EMPTY_MACROS: MacroSet = {
  kcal: null,
  proteinG: null,
  carbG: null,
  fatG: null,
  fibreG: null,
};

/** How the number was arrived at, which is what fixes its rounding grid. */
export type EnergyPrecision = 'computed' | 'estimated';

export function roundEnergy(kcal: number, precision: EnergyPrecision): number {
  const grid =
    precision === 'estimated' ? NUTRITION.roundKcalEstimated : NUTRITION.roundKcalComputed;
  return Math.round(kcal / grid) * grid;
}

export function roundMacro(grams: number, precision: EnergyPrecision): number {
  if (precision === 'estimated') {
    const grid = NUTRITION.roundMacroEstimatedG;
    return Math.round(grams / grid) * grid;
  }
  return Math.round(grams);
}

/** The whole set, put on its grid at once, keeping every null a null. */
export function roundMacros(macros: MacroSet, precision: EnergyPrecision): MacroSet {
  return {
    kcal: macros.kcal === null ? null : roundEnergy(macros.kcal, precision),
    proteinG: macros.proteinG === null ? null : roundMacro(macros.proteinG, precision),
    carbG: macros.carbG === null ? null : roundMacro(macros.carbG, precision),
    fatG: macros.fatG === null ? null : roundMacro(macros.fatG, precision),
    fibreG: macros.fibreG === null ? null : roundMacro(macros.fibreG, precision),
  };
}

/**
 * A macronutrient, as text. The number with no decimal place, or the word for
 * absence.
 *
 * Every caller goes through here, which is what stops one screen printing
 * "0 g" for a fibre value nobody measured while the next one prints "unknown".
 */
export function macroText(grams: number | null): string {
  if (grams === null) return strings.nutrition.unknown;
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(Math.round(grams));
}

/** Energy, as text, on the grid its precision fixes. No decimal, ever. */
export function energyText(kcal: number | null, precision: EnergyPrecision = 'computed'): string {
  if (kcal === null) return strings.nutrition.unknown;
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(
    roundEnergy(kcal, precision),
  );
}

/**
 * The band a low-coverage or estimated figure is drawn as instead of a point.
 *
 * The width is not a taste. Below 85 percent of recipe mass resolved, the part
 * that did not resolve could carry anything, so the band opens by the share
 * that is missing rather than by a fixed percentage: a recipe whose numbers
 * cover 60 percent of its mass gets a wider band than one covering 84.
 */
export function coverageBand(kcal: number, coveragePct: number): { low: number; high: number } {
  const missing = Math.max(0, 100 - coveragePct) / 100;
  return {
    low: roundEnergy(kcal * (1 - missing * 0.5), 'estimated'),
    high: roundEnergy(kcal * (1 + missing), 'estimated'),
  };
}

/** "450 to 610", the two ends of a band, with the unit left to the caller. */
export function bandText(band: { low: number; high: number }): string {
  const format = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
  return strings.nutrition.range(format.format(band.low), format.format(band.high));
}

/** Adds two sets, keeping a null as a null. Absence does not sum to zero. */
export function addMacros(left: MacroSet, right: MacroSet): MacroSet {
  const add = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);
  return {
    kcal: add(left.kcal, right.kcal),
    proteinG: add(left.proteinG, right.proteinG),
    carbG: add(left.carbG, right.carbG),
    fatG: add(left.fatG, right.fatG),
    fibreG: add(left.fibreG, right.fibreG),
  };
}

/**
 * The five numbers a meal row carries, ready to render.
 *
 * C12 names them: energy and all four macronutrients including fibre, on every
 * meal row. One function builds that row so no surface can quietly drop fibre,
 * which is the field every other food table drops.
 */
export type MacroLine = { label: string; text: string; unit: string; known: boolean };

export function macroLines(macros: MacroSet, precision: EnergyPrecision = 'computed'): MacroLine[] {
  return [
    {
      label: strings.nutrition.energy,
      text: energyText(macros.kcal, precision),
      unit: strings.units.kcal,
      known: macros.kcal !== null,
    },
    {
      label: strings.nutrition.protein,
      text: macroText(macros.proteinG === null ? null : roundMacro(macros.proteinG, precision)),
      unit: strings.units.g,
      known: macros.proteinG !== null,
    },
    {
      label: strings.nutrition.carbohydrate,
      text: macroText(macros.carbG === null ? null : roundMacro(macros.carbG, precision)),
      unit: strings.units.g,
      known: macros.carbG !== null,
    },
    {
      label: strings.nutrition.fat,
      text: macroText(macros.fatG === null ? null : roundMacro(macros.fatG, precision)),
      unit: strings.units.g,
      known: macros.fatG !== null,
    },
    {
      label: strings.nutrition.fibre,
      text: macroText(macros.fibreG === null ? null : roundMacro(macros.fibreG, precision)),
      unit: strings.units.g,
      known: macros.fibreG !== null,
    },
  ];
}
