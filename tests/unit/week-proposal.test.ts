import { describe, expect, test } from 'vitest';
import { isFullBody, movementOf } from '@/lib/catalogue';
import { weekdayIndex } from '@/lib/local-time';
import {
  FULL_BODY_MAX,
  FULL_BODY_MIN,
  SAME_MUSCLE_HOURS,
  SESSIONS_MAX,
  SESSIONS_MIN,
  STEP_FLOOR,
  type WeekInput,
  durationOf,
  fullBodySet,
  proposeWeek,
  spacingMuscles,
  spacingProblems,
} from '@/lib/week-proposal';

/**
 * The proposed week, graded over the week it generates rather than over its
 * intentions.
 *
 * F72 IS FOUR CLAIMS AND EACH ONE IS WALKED HERE. Three to five sessions. Two
 * or three of them full body. At least 48 hours between two sessions that load
 * the same muscle, checked over the generated rows by a function written for
 * that purpose rather than trusted to the placement. And a cause on every row
 * that names the input it acted on, which is checked as a key plus its data:
 * the sentence is rendered from the catalogue at write time, so the key is what
 * decides which input was read.
 *
 * WHAT WOULD MAKE THIS GO RED. A placement rule that put two leg days back to
 * back would fail `spacingProblems`, which walks every PAIR of generated rows
 * and prints the muscles they share. A week that dropped to two sessions or
 * grew to six would fail the count. A cause that was a label rather than a
 * reason would fail the parameter check: `mostCompletedDay` without a `done`
 * count is a badge.
 */

const ZONE = 'Europe/Paris';
const NOW = new Date('2026-08-23T20:31:00+02:00');
const WEEK_START = '2026-08-24';

function input(overrides: Partial<WeekInput> = {}): WeekInput {
  return {
    weekStart: WEEK_START,
    timeZone: ZONE,
    history: [],
    steps: [],
    painBlock: null,
    now: NOW,
    ...overrides,
  };
}

/** Four weeks of Monday, Wednesday and Saturday sessions, all completed. */
function historyOf(days: number[], weeks = 4) {
  const rows: WeekInput['history'] = [];
  for (let week = 1; week <= weeks; week += 1) {
    for (const weekday of days) {
      const at = new Date(Date.parse(`${WEEK_START}T18:45:00+02:00`) - week * 7 * 86_400_000 + weekday * 86_400_000);
      rows.push({ at, minutes: 35, completed: true, muscles: ['chest', 'quadriceps'] });
    }
  }
  return rows;
}

describe('how many sessions, and how many of them are full body', () => {
  test('a week with no history at all is three sessions, which is where the guideline starts', () => {
    const week = proposeWeek(input());
    expect(week.length).toBeGreaterThanOrEqual(SESSIONS_MIN);
    expect(week.length).toBeLessThanOrEqual(SESSIONS_MAX);
    expect(week).toHaveLength(3);
  });

  test('two or three of them are full body, by what they load rather than by a label', () => {
    const week = proposeWeek(input({ history: historyOf([0, 2, 5]) }));
    const fullBody = week.filter((session) => session.fullBody);
    expect(fullBody.length).toBeGreaterThanOrEqual(FULL_BODY_MIN);
    expect(fullBody.length).toBeLessThanOrEqual(FULL_BODY_MAX);
    for (const session of fullBody) {
      expect(isFullBody(session.movementIds)).toBe(true);
    }
  });

  test('a third full-body session appears once three a week are being completed', () => {
    const busy = proposeWeek(input({ history: historyOf([0, 2, 5]) }));
    expect(busy.filter((session) => session.kind === 'strength')).toHaveLength(3);
  });

  test('a walk is added when the steps are low, and the cause names the count', () => {
    const steps = [7, 6, 5, 4, 3, 2, 1].map((back) => ({
      at: new Date(NOW.getTime() - back * 86_400_000),
      value: 4200,
    }));
    const week = proposeWeek(input({ steps }));
    const walk = week.find((session) => session.kind === 'walk');
    expect(walk).toBeDefined();
    expect(walk!.cause.key).toBe('lowSteps');
    expect(walk!.cause.params.lowDays).toBe(7);
    expect(walk!.cause.params.ofDays).toBe(7);
    expect(walk!.cause.params.floor).toBe(STEP_FLOOR);
  });

  test('a day with no step reading is not a day with zero steps', () => {
    // Three readings, all healthy, and four days with nothing at all. The walk
    // is not added, because absence is absence and never a low number.
    const steps = [3, 2, 1].map((back) => ({
      at: new Date(NOW.getTime() - back * 86_400_000),
      value: 11_000,
    }));
    const week = proposeWeek(input({ steps }));
    expect(week.find((session) => session.kind === 'walk')).toBeUndefined();
  });

  test('the week never grows past five whatever the inputs say', () => {
    const steps = [7, 6, 5, 4, 3, 2, 1].map((back) => ({
      at: new Date(NOW.getTime() - back * 86_400_000),
      value: 2000,
    }));
    const week = proposeWeek(input({ history: historyOf([0, 1, 2, 3, 4]), steps }));
    expect(week.length).toBeLessThanOrEqual(SESSIONS_MAX);
  });
});

describe('48 hours between two sessions that load the same muscle', () => {
  test('the generated week holds no pair closer than 48 hours on a shared muscle', () => {
    for (const days of [[0, 2, 5], [1, 3, 6], [0, 1, 2], []]) {
      const week = proposeWeek(input({ history: historyOf(days) }));
      const problems = spacingProblems(week);
      // The population, beside the zero: how many pairs were compared at all.
      const pairs = (week.length * (week.length - 1)) / 2;
      expect(pairs).toBeGreaterThan(2);
      expect(problems).toEqual([]);
    }
  });

  test('the checker can see a violation, so a clean week means something', () => {
    const monday = new Date('2026-08-24T18:45:00+02:00');
    const tuesday = new Date('2026-08-25T18:45:00+02:00');
    const problems = spacingProblems([
      { plannedFor: monday, movementIds: fullBodySet(0) },
      { plannedFor: tuesday, movementIds: fullBodySet(1) },
    ]);
    expect(problems.length).toBe(1);
    expect(problems[0].muscles.length).toBeGreaterThan(0);
    expect(tuesday.getTime() - monday.getTime()).toBeLessThan(SAME_MUSCLE_HOURS * 3_600_000);
  });

  test('cardio does not lock a leg day out of the next morning', () => {
    // A bike ride uses the quadriceps and does not train them. The spacing rule
    // is about resistance, and this is where that is stated as a fact.
    expect(spacingMuscles(['stationary-bike'])).toEqual([]);
    expect(spacingMuscles(['bodyweight-squat'])).toContain('quadriceps');
  });

  test('a session finished yesterday pushes tomorrow out', () => {
    const yesterday = new Date(NOW.getTime() - 20 * 3_600_000);
    const week = proposeWeek(
      input({
        history: [
          ...historyOf([0, 2, 5]),
          { at: yesterday, minutes: 35, completed: true, muscles: ['chest', 'quadriceps', 'glutes'] },
        ],
      }),
    );
    for (const session of week.filter((entry) => entry.kind === 'strength')) {
      expect(session.plannedFor.getTime() - yesterday.getTime()).toBeGreaterThanOrEqual(
        SAME_MUSCLE_HOURS * 3_600_000,
      );
    }
  });
});

describe('every row carries the cause it was placed on', () => {
  test('a cause is a key plus the data it acted on, never a bare label', () => {
    const week = proposeWeek(input({ history: historyOf([0, 2, 5]) }));
    expect(week.length).toBeGreaterThan(0);
    for (const session of week) {
      expect(session.cause.key).toBeTruthy();
      expect(Object.keys(session.cause.params).length).toBeGreaterThan(0);
    }
  });

  test('the weekday cause names how many of the last four weeks it was completed on', () => {
    const week = proposeWeek(input({ history: historyOf([0, 2, 5]) }));
    const placed = week.find((session) => session.cause.key === 'mostCompletedDay');
    expect(placed).toBeDefined();
    expect(Number(placed!.cause.params.done)).toBeGreaterThan(0);
    expect(placed!.cause.params.weeks).toBe(4);
    // And it really is the day it names.
    expect(weekdayIndex(placed!.plannedFor, ZONE)).toBe(Number(placed!.cause.params.weekday));
  });

  test('a first week with nothing to read says so rather than inventing a reason', () => {
    const week = proposeWeek(input());
    expect(week.some((session) => session.cause.key === 'noHistoryYet')).toBe(true);
  });

  test('a repeated pain site changes the cause on the strength sessions and names the site', () => {
    const week = proposeWeek(
      input({
        history: historyOf([0, 2, 5]),
        painBlock: { site: 'knee', reason: 'repeatedSite' },
      }),
    );
    const strength = week.filter((session) => session.kind === 'strength');
    expect(strength.length).toBeGreaterThan(0);
    for (const session of strength) {
      expect(session.cause.key).toBe('painDeload');
      expect(session.cause.params.site).toBe('knee');
    }
  });

  /*
   * EACH LIMB OF THE PAIN RULE CARRIES ITS OWN CAUSE, AND F72 IS WHY.
   *
   * Every proposed row states the input it was placed on in plain words. All
   * four limbs used to render "you reported knee in two sessions running",
   * because there was one cause key: a week cut back because the knee got worse
   * than last week would have told the owner about two sessions that did not
   * happen. A cause that names the wrong input is worse than no cause, because
   * he checks it against his own memory and finds it wrong.
   *
   * GOES RED IF: two limbs collapse onto one key again.
   */
  test('each limb of the pain rule names its own reason on the strength sessions', () => {
    const expected: Array<[string, string]> = [
      ['repeatedSite', 'painDeload'],
      ['aboveCeiling', 'painCeiling'],
      ['notSubsided', 'painMorning'],
      ['roseFromLastWeek', 'painRose'],
    ];
    const keys = new Set<string>();
    for (const [reason, key] of expected) {
      const week = proposeWeek(
        input({ history: historyOf([0, 2, 5]), painBlock: { site: 'knee', reason } }),
      );
      const strength = week.filter((session) => session.kind === 'strength');
      expect(strength.length).toBeGreaterThan(0);
      for (const session of strength) {
        expect(session.cause.key, `${reason} rendered as ${session.cause.key}`).toBe(key);
        expect(session.cause.params.site).toBe('knee');
      }
      keys.add(key);
    }
    // Four reasons, four keys, so nothing here passed by two of them agreeing.
    expect(keys.size).toBe(expected.length);
  });
});

describe('the length fact travels with the row', () => {
  test('a session longer than 110 percent of the 30-day longest is flagged with its percentage', () => {
    const week = proposeWeek(
      input({
        history: [{ at: new Date(NOW.getTime() - 4 * 86_400_000), minutes: 20, completed: true, muscles: [] }],
      }),
    );
    const flagged = week.filter((session) => session.length?.flagged);
    expect(flagged.length).toBeGreaterThan(0);
    for (const session of flagged) {
      expect(session.length!.percentLonger).toBeGreaterThan(10);
      expect(session.length!.longestMinutes).toBe(20);
    }
  });

  test('with no history there is no length fact at all', () => {
    for (const session of proposeWeek(input())) {
      expect(session.length).toBeNull();
    }
  });
});

describe('the shape of a session', () => {
  test('a full-body set holds one movement from each of the five patterns', () => {
    for (const rotation of [0, 1, 2]) {
      const set = fullBodySet(rotation);
      const patterns = set.map((id) => movementOf(id)!.pattern);
      expect(new Set(patterns).size).toBe(5);
      expect(isFullBody(set)).toBe(true);
    }
  });

  test('two sessions in one week are not the same five movements', () => {
    expect(fullBodySet(0)).not.toEqual(fullBodySet(1));
  });

  test('a session needs no equipment the owner does not have', () => {
    const allowed = new Set(['mat', 'chair', 'step']);
    for (const id of fullBodySet(0)) {
      for (const item of movementOf(id)!.equipment) expect(allowed.has(item)).toBe(true);
    }
  });

  test('the duration is computed from what is in the session, not typed', () => {
    const short = durationOf(['push-up']);
    const long = durationOf(fullBodySet(0));
    expect(long).toBeGreaterThan(short);
    expect(long % 5).toBe(0);
  });
});
