import { describe, expect, test } from 'vitest';
import {
  NUTRITION,
  deficitForRate,
  macroTargets,
  maxWeeklyLossKg,
  palIsPublished,
  palOf,
  planTarget,
  restingMetabolicRate,
  totalDailyEnergy,
  type BodyFacts,
} from '@/lib/nutrition';

/**
 * The daily target, graded as arithmetic.
 *
 * F80 fixes two numbers to within one kilocalorie and F81 fixes three floors.
 * Every one of them is checked here against the equation and the guidance it
 * came from, not against whatever the code happens to return.
 *
 * WHAT WOULD MAKE THESE GO RED. Swapping Mifflin-St Jeor for Harris-Benedict
 * moves the resting figure to 1943 and fails the first test by 94 kcal.
 * Reaching for the unsourced 1.2 rung instead of the FAO/WHO/UNU 1.40 floor
 * fails `palIsPublished`. Turning the rate refusal into a warning, or the hard
 * floor into a caution, fails the outcome assertions: those two check the shape
 * of the verdict and not its wording, so softening the copy would not hide it.
 */

/** The owner, as GOAL.md and the research note both describe him. */
const OWNER: BodyFacts = { sex: 'male', ageYears: 38, heightCm: 183, weightKg: 89.0 };

describe('Mifflin-St Jeor', () => {
  test('the resting figure for 38 years, male, 183 cm, 89.0 kg is 1849 kcal', () => {
    // 10 x 89 + 6.25 x 183 - 5 x 38 + 5 = 890 + 1143.75 - 190 + 5
    expect(restingMetabolicRate(OWNER)).toBeCloseTo(1848.75, 5);
    expect(Math.abs(Math.round(restingMetabolicRate(OWNER)) - 1849)).toBeLessThanOrEqual(1);
  });

  test('the total at activity level 1.55 is 2866 kcal', () => {
    expect(palOf('light')).toBe(1.55);
    const tdee = totalDailyEnergy(OWNER, 'light');
    expect(Math.abs(Math.round(tdee) - 2866)).toBeLessThanOrEqual(1);
  });

  test('the female form differs by the published constant, 166 kcal', () => {
    const female = restingMetabolicRate({ ...OWNER, sex: 'female' });
    expect(restingMetabolicRate(OWNER) - female).toBeCloseTo(166, 5);
  });

  test('every activity level Vernier offers sits inside the FAO/WHO/UNU band', () => {
    const levels = Object.values(NUTRITION.pal);
    expect(levels.length).toBe(4);
    for (const pal of levels) expect(palIsPublished(pal)).toBe(true);
    // And the ladder every online calculator starts at does not.
    expect(palIsPublished(1.2)).toBe(false);
    expect(palIsPublished(1.375)).toBe(false);
  });
});

describe('the three floors, implemented rather than promised', () => {
  test('a planned loss above 0.89 kg a week is refused, and the nearest compliant rate is offered', () => {
    expect(maxWeeklyLossKg(89.0)).toBe(0.89);
    const verdict = planTarget({ body: OWNER, level: 'light', rateKgPerWeek: 1.2 });
    expect(verdict.outcome).toBe('rate_refused');
    if (verdict.outcome !== 'rate_refused') throw new Error('expected a refusal');
    expect(verdict.requestedRate).toBe(1.2);
    expect(verdict.offeredRate).toBe(0.89);
    expect(verdict.weightKg).toBe(89.0);
  });

  test('the ceiling is the stricter of one kilogram and one percent of body weight', () => {
    // At 89 kg one percent is the stricter of the two.
    expect(maxWeeklyLossKg(89.0)).toBe(0.89);
    // At 140 kg one percent would be 1.4, so the absolute kilogram binds.
    expect(maxWeeklyLossKg(140)).toBe(1.0);
  });

  test('no confirmation exists that unlocks a refused rate', () => {
    const confirmed = planTarget({
      body: OWNER,
      level: 'light',
      rateKgPerWeek: 1.2,
      hardFloorConfirmed: true,
    });
    expect(confirmed.outcome).toBe('rate_refused');
  });

  test('a target below 1500 kcal is blocked until it is explicitly confirmed', () => {
    // A small, sedentary body, so a compliant rate still lands under the floor.
    const small = { sex: 'male', ageYears: 60, heightCm: 160, weightKg: 55 } as const;
    const rate = maxWeeklyLossKg(small.weightKg);
    const blocked = planTarget({ body: small, level: 'sedentary', rateKgPerWeek: rate });
    expect(blocked.outcome).toBe('blocked_below_floor');
    if (blocked.outcome !== 'blocked_below_floor') throw new Error('expected a block');
    expect(blocked.floor).toBe(NUTRITION.hardFloorKcalMale);
    expect(blocked.kcal).toBeLessThan(NUTRITION.hardFloorKcalMale);

    const confirmed = planTarget({
      body: small,
      level: 'sedentary',
      rateKgPerWeek: rate,
      hardFloorConfirmed: true,
    });
    expect(confirmed.outcome).toBe('allowed');
    if (confirmed.outcome !== 'allowed') throw new Error('expected an allowance');
    expect(confirmed.cautions).toContain('below_hard_floor_confirmed');
  });

  test('the female hard floor is the published 1200 rather than the male 1500', () => {
    expect(NUTRITION.hardFloorKcalFemale).toBe(1200);
    expect(NUTRITION.hardFloorKcalMale).toBe(1500);
  });

  test('a target below the estimated resting figure is allowed and cautioned', () => {
    // Sedentary at the fastest compliant rate puts the target under the resting
    // figure without going under the hard floor: 1848.75 x 1.40 is 2588, and
    // 0.89 kg a week is a 979 kcal deficit, which lands at 1609.
    const verdict = planTarget({ body: OWNER, level: 'sedentary', rateKgPerWeek: 0.89 });
    expect(verdict.outcome).toBe('allowed');
    if (verdict.outcome !== 'allowed') throw new Error('expected an allowance');
    expect(verdict.kcal).toBeLessThan(Math.round(verdict.rmr));
    expect(verdict.cautions).toContain('below_resting');
  });

  test('a deficit over the NHLBI cap is flagged, and the cap is 1000 kcal', () => {
    expect(NUTRITION.maxDailyDeficitKcal).toBe(1000);
    // 0.92 kg a week would be 1012 kcal a day, but 0.92 is over the rate
    // ceiling for this owner, so the cap is checked on a heavier body where a
    // compliant rate can still cross it.
    const heavy = { sex: 'male', ageYears: 38, heightCm: 190, weightKg: 120 } as const;
    const verdict = planTarget({ body: heavy, level: 'active', rateKgPerWeek: 1.0 });
    expect(verdict.outcome).toBe('allowed');
    if (verdict.outcome !== 'allowed') throw new Error('expected an allowance');
    expect(Math.round(deficitForRate(1.0))).toBe(1100);
    expect(verdict.cautions).toContain('deficit_above_cap');
  });

  test("the owner's own plan sits comfortably inside every guideline", () => {
    const verdict = planTarget({ body: OWNER, level: 'light', rateKgPerWeek: 0.33 });
    expect(verdict.outcome).toBe('allowed');
    if (verdict.outcome !== 'allowed') throw new Error('expected an allowance');
    expect(verdict.cautions).toEqual([]);
    // 2866 minus a 363 kcal deficit, which the research put near 2500.
    expect(verdict.kcal).toBeGreaterThan(2450);
    expect(verdict.kcal).toBeLessThan(2550);
  });
});

describe('macro floors', () => {
  test('protein anchors to body weight and fibre to the ANSES reference', () => {
    const macros = macroTargets(2500, 89.0);
    expect(macros.proteinG).toBe(Math.round(89.0 * NUTRITION.proteinGPerKg.target));
    expect(macros.fibreG).toBe(30);
  });

  test('fat takes the higher of 0.8 g per kg and a fifth of the energy', () => {
    // At 2500 kcal a fifth is 500 kcal, which is 55.6 g, above 0.8 x 89 = 71.2.
    // So the weight rule binds here and the energy rule binds at a higher target.
    const low = macroTargets(2000, 89.0);
    expect(low.fatG).toBe(Math.round(89.0 * NUTRITION.fatMinGPerKg));
    const high = macroTargets(4500, 60);
    expect(high.fatG).toBe(Math.round((4500 * 0.2) / 9));
  });

  test('carbohydrate takes what remains and never goes below zero', () => {
    const macros = macroTargets(1500, 120);
    expect(macros.carbG).toBeGreaterThanOrEqual(0);
  });

  test('every macro target is a whole number of grams', () => {
    const macros = macroTargets(2503, 88.7);
    for (const value of [macros.proteinG, macros.carbG, macros.fatG, macros.fibreG]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});
