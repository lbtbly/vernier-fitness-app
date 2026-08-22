/**
 * The numbers the demonstration seed writes, and nothing else.
 *
 * Pure data, in its own module, for one reason: the arithmetic these tables
 * produce is what the screens say out loud, so the unit suite grades the
 * sentences against the same tables the seed writes from. F33's "match a hand
 * computation over the demonstration seed" is a real check when the hand
 * computation reads this file, and a claim when it reads a screenshot.
 *
 * Nothing here touches a database, a clock or a request.
 */

/** Days before the seed's own day. Offset 0 is the day the seed first ran. */
export const WEIGHT_DAYS = 42;

/**
 * Kilograms per day, oldest at the right of this list. Offsets 10 to 13 are
 * absent on purpose: four days where the scale sent nothing, which is what the
 * charts break across, hatch and label.
 */
export const WEIGHT_BY_DAY: Record<number, number> = {
  0: 85.9, 1: 86.5, 2: 86.3, 3: 86.6, 4: 86.4, 5: 86.5, 6: 86.6,
  7: 87.1, 8: 86.8, 9: 87.1,
  14: 87.3, 15: 87.2, 16: 87.5, 17: 87.4, 18: 87.6, 19: 87.5, 20: 87.8,
  21: 87.7, 22: 87.9, 23: 87.8, 24: 88.1, 25: 88.0, 26: 88.2, 27: 88.1,
  28: 88.4, 29: 88.3, 30: 88.5, 31: 88.4, 32: 88.6, 33: 88.5, 34: 88.8,
  35: 88.7, 36: 88.9, 37: 88.8, 38: 89.0, 39: 88.9, 40: 89.1, 41: 89.0,
};

/** The four days the scale sent nothing. Named, so a test can assert the shape. */
export const DEMO_WEIGHT_GAP = [10, 11, 12, 13];

/** Centimetres, measured by hand about once a week. */
export const WAIST_BY_DAY: Record<number, number> = {
  3: 98.5, 10: 99.0, 17: 99.4, 24: 99.8, 31: 100.3, 38: 100.7,
};

/**
 * The phone stopped sending four days before the seed's own day, which is what
 * puts the warn chip on Health and hatches the end of all three charts. Steps
 * and sleep are daily up to that point and absent after it, and absent is drawn
 * as absent and never as a bar of zero.
 */
export const STEPS_BY_DAY: Record<number, number> = {
  4: 9412, 5: 7830, 6: 11204, 7: 8617, 8: 9903, 9: 6742, 10: 12088,
  11: 8455, 12: 10231, 13: 7619, 14: 9044, 15: 11760, 16: 8302, 17: 9587,
};

/** Minutes asleep. Stored as minutes, never as a formatted duration. */
export const SLEEP_BY_DAY: Record<number, number> = {
  4: 424, 5: 391, 6: 447, 7: 402, 8: 368, 9: 431, 10: 456,
  11: 389, 12: 412, 13: 375, 14: 438, 15: 407, 16: 421, 17: 396,
};

/** Resting beats a minute, once every few days. Sixty-one down to fifty-eight. */
export const RESTING_BY_DAY: Record<number, number> = {
  4: 58, 8: 59, 12: 58, 16: 60, 20: 59, 24: 61, 28: 60, 32: 61,
};

/** Heart rate variability, in milliseconds. The recovery signal. */
export const HRV_BY_DAY: Record<number, number> = { 4: 46, 11: 44, 18: 42, 25: 41 };

/**
 * VO2 max, which the watch estimates every few weeks. Two readings in six, and
 * between them the app shows the last one with its date rather than a number
 * that looks fresh.
 */
export const VO2_BY_DAY: Record<number, number> = { 12: 38.4, 40: 37.6 };

/** The goal: 89.0 kg to 76.0 kg, started 53 days before the seed's own day. */
export const DEMO_GOAL = {
  startValue: 89.0,
  startOffset: 53,
  targetValue: 76.0,
  /** Nine calendar months after the start, which is what the plan says. */
  targetMonths: 9,
};

/**
 * The planned sessions adherence counts. Three in the last seven days with two
 * done and one still to come, fourteen in the last twenty-eight with eleven
 * done and two missed. Every one of those numbers is countable off this list,
 * which is what F33's hand computation is checked against.
 */
export const DEMO_SESSIONS: Array<{ offset: number; state: 'planned' | 'completed' | 'missed' }> = [
  { offset: 0, state: 'planned' },
  { offset: 2, state: 'completed' },
  { offset: 5, state: 'completed' },
  { offset: 7, state: 'completed' },
  { offset: 9, state: 'completed' },
  { offset: 12, state: 'missed' },
  { offset: 14, state: 'completed' },
  { offset: 16, state: 'completed' },
  { offset: 19, state: 'completed' },
  { offset: 21, state: 'completed' },
  { offset: 23, state: 'completed' },
  { offset: 25, state: 'missed' },
  { offset: 26, state: 'completed' },
  { offset: 27, state: 'completed' },
];
