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

/**
 * ---------------------------------------------------------------------------
 * THE CONTINUATION, WHICH IS WHY THIS DEMONSTRATION IS STILL TRUE TOMORROW.
 *
 * Everything above is anchored to the day the seed first ran. Left alone, that
 * install grows a trailing hole one day at a time: a week on, the last seven
 * days hold nothing, the seven-day average has no window, and Today and Health
 * fall into the empty state that tells a signed-in owner to create his account.
 * The evidence for nine rubric lines stops being reproducible on the same
 * machine that produced it.
 *
 * So the seed keeps writing. Every function below takes `day`, the number of
 * days SINCE THE ANCHOR, and returns what that calendar date holds. They are
 * pure and total: the same date gives the same reading whenever it is asked,
 * which is what lets the writer key a row's id to its date, insert on conflict
 * do nothing, and stay correct whether it runs once a day, six times an hour,
 * or once after a fortnight with the machine switched off.
 *
 * Nothing here moves an existing row. `measurement` is append only and stays
 * that way: the demonstration ages forward, exactly as a real source does.
 * ---------------------------------------------------------------------------
 */

/** Kilograms a day, which is the 0.53 a week the table above walks. */
const WEIGHT_PER_DAY = 0.0757;

/**
 * The daily swing, cycling by weekday. A body-composition scale moves with
 * hydration by more than a good week of progress, which is the sentence the
 * whole product is built around, so the continuation had better show it.
 */
const WEIGHT_SWING = [0, 0.3, -0.2, 0.4, -0.3, 0.1, -0.4];

/** How often the scale goes quiet, and for how long. F30 needs a hole to draw. */
const QUIET_EVERY = 21;
const QUIET_FIRST = 8;
const QUIET_DAYS = 4;

/**
 * True on the days the scale sent nothing.
 *
 * Every 21 days for 4 days, first run starting 8 days after the anchor. The
 * period is shorter than the 30-day window every chart draws, so there is
 * always a hole in view: the authored gap at offsets 10 to 13 leaves the window
 * seventeen days after the anchor, and this one is already inside it by then.
 */
export function scaleWasQuiet(day: number): boolean {
  if (day < QUIET_FIRST) return false;
  return (day - QUIET_FIRST) % QUIET_EVERY < QUIET_DAYS;
}

/** A tenth of a kilogram, which is what the scale reports. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** The weight for a day after the anchor, or null on a day the scale was quiet. */
export function weightOnDay(day: number): number | null {
  if (day < 1 || scaleWasQuiet(day)) return null;
  return round1(WEIGHT_BY_DAY[0] - WEIGHT_PER_DAY * day + WEIGHT_SWING[day % WEIGHT_SWING.length]);
}

/** The tape comes out every seven days, on the same cadence the table above set. */
export function waistOnDay(day: number): number | null {
  if (day < 1 || (day - 4) % 7 !== 0) return null;
  return round1(WAIST_BY_DAY[3] - 0.5 * ((day + 3) / 7));
}

/**
 * The phone stopped four days ago, and it is still four days ago tomorrow.
 *
 * The silence slides forward by filling in the day that just left it, which is
 * the one shape of drift an append-only table can carry. F34's chip, its age
 * and the hatched range at the end of all three signal charts hold on any day
 * this is read.
 */
export const PHONE_SILENT_DAYS = 4;

/** Steps, sleep and the rest, cycling. Plausible, never round, never repeating weekly. */
const STEPS_CYCLE = [9412, 7830, 11204, 8617, 9903, 6742, 12088, 8455, 10231, 7619, 9044];
const SLEEP_CYCLE = [424, 391, 447, 402, 368, 431, 456, 389, 412, 375, 438];
const RESTING_CYCLE = [58, 59, 58, 60, 59, 61, 60];
const HRV_CYCLE = [46, 44, 42, 41, 45];
const VO2_CYCLE = [38.4, 37.6, 38.8];

/** What the shortcut sent on a day, or nothing at all. Keyed by metric. */
export function phoneOnDay(day: number): Array<{ metric: string; unit: string; value: number }> {
  if (day < 1) return [];
  const sent: Array<{ metric: string; unit: string; value: number }> = [];
  sent.push({ metric: 'steps', unit: 'step', value: STEPS_CYCLE[day % STEPS_CYCLE.length] });
  sent.push({ metric: 'sleep_minutes', unit: 'min', value: SLEEP_CYCLE[day % SLEEP_CYCLE.length] });
  if (day % 4 === 0) {
    sent.push({
      metric: 'resting_heart_rate',
      unit: 'bpm',
      value: RESTING_CYCLE[(day / 4) % RESTING_CYCLE.length],
    });
  }
  if (day % 7 === 0) {
    sent.push({ metric: 'hrv', unit: 'ms', value: HRV_CYCLE[(day / 7) % HRV_CYCLE.length] });
  }
  if (day % 28 === 0) {
    sent.push({ metric: 'vo2_max', unit: 'mL/kg/min', value: VO2_CYCLE[(day / 28) % VO2_CYCLE.length] });
  }
  return sent;
}

/**
 * The training week, continued: three sessions most weeks and a fourth every
 * other one, which is the 14 in 28 days the table above plans, and one missed
 * session a fortnight, which is the 2 in 28 it misses.
 *
 * A session's state is decided by the date and not by when the row was written,
 * so the row a boot writes as planned is settled by the next boot that finds
 * the day behind it. Adherence stays a real count over a real denominator.
 */
export function sessionOnDay(day: number): 'completed' | 'missed' | 'planned' | null {
  if (day < 1) return null;
  const fourth = day % 14 === 6;
  if (!fourth && ![0, 2, 4].includes(day % 7)) return null;
  return fourth ? 'missed' : 'completed';
}

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
