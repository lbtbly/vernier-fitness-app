import { describe, expect, test } from 'vitest';
import {
  addMacros,
  coverageBand,
  energyText,
  macroLines,
  macroText,
  roundEnergy,
  roundMacro,
  roundMacros,
  type MacroSet,
} from '@/lib/macros';
import { strings } from '@/lib/strings';

/**
 * How a nutrition number is allowed to reach a screen.
 *
 * F78's clause is the one that matters most here: a missing nutrient is stored
 * null and RENDERS AS "unknown", NEVER AS 0. It is the difference between not
 * knowing a food's fibre and knowing the food has none, and it is a line.
 *
 * WHAT WOULD MAKE THESE GO RED. A `?? 0` anywhere between the column and the
 * screen turns the first block red immediately, because "0" and "unknown" are
 * different strings. Rounding a macronutrient to one decimal fails the second
 * block, because F82 says no decimal place on any macronutrient. Snapping
 * computed energy to 25 instead of 10 fails the third.
 */

const KNOWN: MacroSet = { kcal: 533.4, proteinG: 21.6, carbG: 52.3, fatG: 27.4, fibreG: 8.2 };

describe('a missing nutrient is a word and never a zero', () => {
  test('macroText renders null as the catalogue word', () => {
    expect(macroText(null)).toBe(strings.nutrition.unknown);
    expect(macroText(null)).not.toBe('0');
  });

  test('energyText renders null as the catalogue word', () => {
    expect(energyText(null)).toBe(strings.nutrition.unknown);
    expect(energyText(null)).not.toBe('0');
  });

  test('a measured zero is still a zero, which is a different fact', () => {
    expect(macroText(0)).toBe('0');
    expect(macroText(0)).not.toBe(strings.nutrition.unknown);
  });

  test('rounding a set keeps every null a null', () => {
    const partial: MacroSet = { ...KNOWN, fibreG: null };
    expect(roundMacros(partial, 'computed').fibreG).toBeNull();
    expect(roundMacros(partial, 'estimated').fibreG).toBeNull();
  });

  test('adding sets keeps a null a null, so absence never sums to zero', () => {
    const withFibre: MacroSet = { ...KNOWN };
    const withoutFibre: MacroSet = { ...KNOWN, fibreG: null };
    expect(addMacros(withFibre, withoutFibre).fibreG).toBeNull();
    expect(addMacros(withFibre, withFibre).fibreG).toBeCloseTo(16.4, 5);
  });

  test('the five lines every meal row carries include fibre, known or not', () => {
    const lines = macroLines({ ...KNOWN, fibreG: null });
    expect(lines.map((line) => line.label)).toEqual([
      strings.nutrition.energy,
      strings.nutrition.protein,
      strings.nutrition.carbohydrate,
      strings.nutrition.fat,
      strings.nutrition.fibre,
    ]);
    const fibre = lines[4];
    expect(fibre.known).toBe(false);
    expect(fibre.text).toBe(strings.nutrition.unknown);
  });
});

describe('no decimal place on any macronutrient', () => {
  test('a computed macro rounds to the nearest gram', () => {
    expect(roundMacro(31.7, 'computed')).toBe(32);
    expect(macroText(roundMacro(31.7, 'computed'))).toBe('32');
    expect(macroText(roundMacro(31.7, 'computed'))).not.toContain('.');
  });

  test('an estimated macro snaps to five grams, because the grid follows the error', () => {
    expect(roundMacro(31.7, 'estimated')).toBe(30);
    expect(roundMacro(33.1, 'estimated')).toBe(35);
  });

  test('every rendered macro across a whole set is free of a decimal point', () => {
    for (const line of macroLines(KNOWN)) expect(line.text).not.toContain('.');
  });
});

describe('energy rounds outward on the grid its precision fixes', () => {
  test('computed from ingredient rows, to the nearest 10', () => {
    expect(roundEnergy(533.4, 'computed')).toBe(530);
    expect(roundEnergy(536, 'computed')).toBe(540);
    expect(energyText(533.4, 'computed')).toBe('530');
  });

  test('estimated from a photo, to the nearest 25', () => {
    expect(roundEnergy(487, 'estimated')).toBe(475);
    expect(roundEnergy(490, 'estimated')).toBe(500);
  });

  test('a low-coverage band opens with the share of mass that did not resolve', () => {
    const tight = coverageBand(600, 95);
    const loose = coverageBand(600, 60);
    expect(loose.high - loose.low).toBeGreaterThan(tight.high - tight.low);
    // And full coverage is not a band at all.
    const full = coverageBand(600, 100);
    expect(full.low).toBe(600);
    expect(full.high).toBe(600);
  });

  test('both ends of a band sit on the estimated grid', () => {
    const band = coverageBand(613, 70);
    expect(band.low % 25).toBe(0);
    expect(band.high % 25).toBe(0);
  });
});
