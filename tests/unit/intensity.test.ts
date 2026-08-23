import { describe, expect, test } from 'vitest';
import {
  BANDS,
  DRIFT_AFTER_MINUTES,
  ESTIMATE_ERROR,
  OWNER_AGE,
  bandOf,
  guidanceFor,
  tanakaMaximum,
} from '@/lib/intensity';

/**
 * Heart-rate guidance, graded against the tables in
 * `.forge/research/training-rules.md` part 1 rather than against itself.
 *
 * Every number below is transcribed from sections 1.3 and 1.7 of that file,
 * which is what makes this a test and not a restatement of the implementation:
 * if the arithmetic changes, these numbers do not, and the failure names the
 * band and the beat.
 *
 * WHAT WOULD MAKE THESE GO RED. A point target instead of a range: the openness
 * test at the bottom fails the moment a band's low equals its high. A second
 * anchoring method on one reading: `guidanceFor` returns one `anchor` and one
 * set of bands, so a caller cannot get both without calling it twice with
 * different arguments, and the test asserts the two disagree, which is the
 * reason only one may be drawn.
 */

describe('Tanaka, and not 220 minus age', () => {
  test('the maximum at 38 is 181', () => {
    expect(tanakaMaximum(OWNER_AGE)).toBe(181);
    expect(OWNER_AGE).toBe(38);
  });

  test('it is 208 minus 0.7 times age at every age, rounded to a beat', () => {
    for (const age of [20, 30, 38, 45, 60, 75]) {
      expect(tanakaMaximum(age)).toBe(Math.round(208 - 0.7 * age));
    }
  });

  test('it is not Fox: the two differ everywhere except around 40', () => {
    expect(tanakaMaximum(20)).not.toBe(220 - 20);
    expect(tanakaMaximum(60)).not.toBe(220 - 60);
  });
});

describe('percent of maximum, used when no resting rate is stored', () => {
  const guidance = guidanceFor(null);

  test('the anchor says which arithmetic produced it', () => {
    expect(guidance.anchor).toBe('maximum');
    expect(guidance.restingHeartRate).toBeNull();
    expect(guidance.reserve).toBeNull();
  });

  // Section 1.7, table A, at HRmax 181.
  test.each([
    ['light', 103, 114],
    ['moderate', 116, 138],
    ['vigorous', 139, 172],
    ['nearMaximal', 174, 181],
  ])('%s is %i to %i bpm', (band, low, high) => {
    const range = bandOf(guidance, band as (typeof BANDS)[number]);
    expect(range.low).toBe(low);
    expect(range.high).toBe(high);
  });
});

describe('percent of heart-rate reserve, preferred whenever a resting rate is known', () => {
  // Section 1.7, table B. Four resting rates, every band, transcribed.
  const table: Array<[number, Array<[string, number, number]>]> = [
    [
      55,
      [
        ['light', 93, 104],
        ['moderate', 105, 129],
        ['vigorous', 131, 167],
        ['nearMaximal', 168, 181],
      ],
    ],
    [
      60,
      [
        ['light', 96, 107],
        ['moderate', 108, 131],
        ['vigorous', 133, 168],
        ['nearMaximal', 169, 181],
      ],
    ],
    [
      65,
      [
        ['light', 100, 110],
        ['moderate', 111, 133],
        ['vigorous', 135, 168],
        ['nearMaximal', 169, 181],
      ],
    ],
    [
      70,
      [
        ['light', 103, 113],
        ['moderate', 114, 135],
        ['vigorous', 137, 169],
        ['nearMaximal', 170, 181],
      ],
    ],
  ];

  for (const [resting, bands] of table) {
    describe(`resting ${resting}`, () => {
      const guidance = guidanceFor(resting);

      test('the anchor is the reserve and it names the reading it used', () => {
        expect(guidance.anchor).toBe('reserve');
        expect(guidance.restingHeartRate).toBe(resting);
        expect(guidance.reserve).toBe(181 - resting);
      });

      for (const [band, low, high] of bands) {
        test(`${band} is ${low} to ${high} bpm`, () => {
          const range = bandOf(guidance, band as (typeof BANDS)[number]);
          expect(range.low).toBe(low);
          expect(range.high).toBe(high);
        });
      }
    });
  }
});

describe('the two methods disagree, which is why only one is ever on screen', () => {
  test('at a resting rate of 60 the moderate band differs by eight beats at the bottom', () => {
    const reserve = bandOf(guidanceFor(60), 'moderate');
    const maximum = bandOf(guidanceFor(null), 'moderate');
    expect(reserve.low).toBe(108);
    expect(maximum.low).toBe(116);
    expect(maximum.low - reserve.low).toBe(8);
  });

  test('a nonsense resting rate falls back to the maximum method rather than inventing a reserve', () => {
    for (const resting of [0, -4, 181, 240]) {
      expect(guidanceFor(resting).anchor).toBe('maximum');
    }
  });
});

describe('ranges, never point targets', () => {
  test('every band is a span of at least two beats, under both anchors', () => {
    for (const guidance of [guidanceFor(null), guidanceFor(58)]) {
      for (const band of guidance.bands) {
        expect(band.high).toBeGreaterThan(band.low + 1);
      }
    }
  });

  test('the top band is the one that is open ended, and it is the only one', () => {
    const open = guidanceFor(null).bands.filter((band) => band.openEnded);
    expect(open).toHaveLength(1);
    expect(open[0].band).toBe('nearMaximal');
  });

  test('the published error is wide enough to move a person two bands, and is stated', () => {
    // Martin 2025: limits of agreement plus or minus 18 to 24 bpm, which is
    // wider than the whole moderate band at this maximum.
    const moderate = bandOf(guidanceFor(null), 'moderate');
    expect(ESTIMATE_ERROR.agreementLow).toBe(18);
    expect(ESTIMATE_ERROR.agreementHigh).toBe(24);
    expect(ESTIMATE_ERROR.agreementHigh).toBeGreaterThan(moderate.high - moderate.low);
  });

  test('the cardiac-drift threshold is 30 minutes, from the 15 against 45 minute comparison', () => {
    expect(DRIFT_AFTER_MINUTES).toBe(30);
  });
});
