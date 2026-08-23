import { describe, expect, test } from 'vitest';
import {
  bandFor,
  isEstimated,
  parseModelReading,
  portionOf,
  snapGrams,
  totalsOf,
  type PortionRange,
} from '@/lib/ai/estimate';
import type { FoodFacts } from '@/lib/recipe-nutrition';
import { NUTRITION } from '@/lib/nutrition';

/**
 * A photograph gives a range and never a number. F96.
 *
 * The evidence is Lucassen 2021, J Hum Nutr Diet 34:945-952, PMID 33761165:
 * only 35 percent of image-based portion estimates landed within 25 percent of
 * the true amount. So the band is minus 25 to plus 35, the grid is coarser than
 * the error, and there is no code path that turns either into a point.
 *
 * WHAT WOULD MAKE THESE GO RED. Adding a `grams` field to `PortionRange` and
 * rendering it fails the first block, because the low and the high are asserted
 * to differ on every estimated line. Narrowing the band to plus or minus 10
 * percent fails the second, because the two ends are asserted against the
 * research's own figures. Rounding energy to the nearest 10 instead of 25 fails
 * the third. Summing a null as a zero fails the fourth.
 */

const SALMON: FoodFacts = {
  id: 'ciqual:26036',
  source: 'ciqual',
  kcal100g: 180,
  proteinG: 20,
  carbG: 0,
  fatG: 11,
  fibreG: 0,
  energySource: 'published',
};

/** A food with no published fibre, which is the field most often missing. */
const POTATOES: FoodFacts = {
  id: 'ciqual:4008',
  source: 'ciqual',
  kcal100g: 90,
  proteinG: 2,
  carbG: 19,
  fatG: 0.2,
  fibreG: null,
  energySource: 'published',
};

const LOOKUP = (aliasId: string): FoodFacts | null =>
  aliasId === 'salmon' ? SALMON : aliasId === 'potatoes' ? POTATOES : null;

describe('an estimate off a photograph is never a point', () => {
  test('every estimated portion has two different ends', () => {
    const portion = portionOf('salmon', 160, 'photo');
    expect(portion.gramsLow).toBeLessThan(portion.gramsHigh);
    expect(portion.exactGrams).toBeNull();
    expect(isEstimated(portion)).toBe(true);
  });

  test('a weighed portion is not an estimate and collapses to one number', () => {
    const portion = portionOf('salmon', 163, 'weighed');
    expect(portion.gramsLow).toBe(163);
    expect(portion.gramsHigh).toBe(163);
    expect(portion.exactGrams).toBe(163);
    expect(isEstimated(portion)).toBe(false);
  });
});

describe('the band is the research figure and narrows with evidence', () => {
  test('a photograph alone is minus 25 to plus 35 percent', () => {
    expect(bandFor('photo')).toEqual(NUTRITION.photoEstimateBand);
    expect(bandFor('photo').low).toBe(0.75);
    expect(bandFor('photo').high).toBe(1.35);
  });

  test('a portion the owner named is narrower than one read off a photograph', () => {
    const photo = bandFor('photo');
    const named = bandFor('named_portion');
    expect(named.high - named.low).toBeLessThan(photo.high - photo.low);
  });

  test('a weighed line has no band at all', () => {
    expect(bandFor('weighed')).toEqual({ low: 1, high: 1 });
  });

  test('160 g read off a photograph becomes 120 to 220 on the grid', () => {
    const portion = portionOf('salmon', 160, 'photo');
    expect(portion.gramsLow).toBe(120);
    expect(portion.gramsHigh).toBe(220);
  });
});

describe('the grid is coarser than the error', () => {
  test('grams snap to ten', () => {
    expect(snapGrams(163)).toBe(160);
    expect(snapGrams(167)).toBe(170);
    // Never zero. A portion this product decided was on the plate does not
    // round away to nothing.
    expect(snapGrams(1)).toBe(10);
  });

  test('energy snaps to 25 and a macronutrient to 5', () => {
    const totals = totalsOf([portionOf('salmon', 160, 'photo')], LOOKUP);
    expect(totals.low.kcal! % 25).toBe(0);
    expect(totals.high.kcal! % 25).toBe(0);
    expect(totals.mid.kcal! % 25).toBe(0);
    expect(totals.mid.proteinG! % 5).toBe(0);
  });

  test('the middle sits inside the range and the range is not a point', () => {
    const totals = totalsOf([portionOf('salmon', 160, 'photo')], LOOKUP);
    expect(totals.low.kcal!).toBeLessThan(totals.high.kcal!);
    expect(totals.mid.kcal!).toBeGreaterThanOrEqual(totals.low.kcal!);
    expect(totals.mid.kcal!).toBeLessThanOrEqual(totals.high.kcal!);
    expect(totals.estimated).toBe(true);
  });
});

describe('absence is drawn as absence at both ends of the range', () => {
  test('a food with no published fibre drops the fibre coverage rather than the total', () => {
    const totals = totalsOf(
      [portionOf('salmon', 160, 'photo'), portionOf('potatoes', 200, 'photo')],
      LOOKUP,
    );
    /*
     * SLICE 9'S RULE, UNCHANGED AND DELIBERATELY NOT A SECOND OPINION. A recipe
     * sums the nutrients its rows publish and reports a SEPARATE fibre coverage
     * for the mass whose fibre was null, which is why `recipe_nutrition` carries
     * two coverage columns. The alternative, nulling the whole fibre figure
     * because one ingredient of six is missing it, throws away five real
     * numbers to avoid overstating one.
     *
     * What must never happen is the coverage staying at 100 while a null was
     * counted as a zero, and that is what this asserts.
     */
    expect(totals.fibreCoveragePct).toBeLessThan(100);
    expect(totals.coveragePct).toBe(100);
    expect(totals.mid.kcal).toBeGreaterThan(0);
  });

  test('an item with no food row is counted as unresolved rather than dropped silently', () => {
    const plate: PortionRange[] = [
      portionOf('salmon', 160, 'photo'),
      portionOf('not-a-food', 100, 'photo'),
    ];
    const totals = totalsOf(plate, LOOKUP);
    expect(totals.unresolvedCount).toBe(1);
    expect(totals.coveragePct).toBeLessThan(100);
  });

  test('a plate where nothing resolved has no energy rather than zero energy', () => {
    const totals = totalsOf([portionOf('not-a-food', 100, 'photo')], LOOKUP);
    expect(totals.mid.kcal).toBeNull();
    expect(totals.mid.kcal).not.toBe(0);
  });
});

describe('the reply is parsed strictly, and a bad one is a cause and not a guess', () => {
  test('the shape the prompt asks for parses', () => {
    const outcome = parseModelReading(
      '{"items":[{"alias":"salmon","text":"Salmon fillet","grams":160}],"note":"one fillet"}',
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.reading.items).toHaveLength(1);
      expect(outcome.reading.items[0].aliasId).toBe('salmon');
      expect(outcome.reading.items[0].grams).toBe(160);
    }
  });

  test('a fenced reply is still a reply', () => {
    const outcome = parseModelReading('```json\n{"items":[{"alias":"","text":"Rice","grams":180}]}\n```');
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.reading.items[0].aliasId).toBeNull();
  });

  test('prose instead of JSON fails with a cause and produces no items', () => {
    const outcome = parseModelReading('I can see a salmon fillet of about 160 g.');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('not_json');
  });

  test('an empty item list is a failure and never an empty plate', () => {
    expect(parseModelReading('{"items":[]}').ok).toBe(false);
  });

  test('an item with no weight is refused rather than defaulted', () => {
    const outcome = parseModelReading('{"items":[{"alias":"salmon","text":"Salmon","grams":0}]}');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('bad_item');
  });
});
