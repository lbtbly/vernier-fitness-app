import type { Day, Goal } from '@/lib/trend';
import type { ReviewFacts } from '@/lib/weekly-review';

/**
 * A week with two sessions that did not happen, because Thursday ran late.
 *
 * THIS IS THE WEEK F121 EXISTS FOR. The panel's finding, verbatim: two missed
 * sessions because Thursday ran late is Tuesday, not a failure state. So the
 * fixture the denylist is walked over is not a clean week: it is the week a
 * product like this is most tempted to editorialise about. Two sessions did not
 * happen, two days of activity are missing, the menu is half decided, and one
 * source has gone quiet.
 *
 * Every value is the shape the real reads produce, so `assembleReview` is
 * exercised through the same door the screen uses.
 */

export const WEEK_START = '2026-08-17';
export const ZONE = 'Europe/Paris';

function day(at: string, value: number | null, origin = 'withings'): Day {
  if (value === null) return { at, reading: null };
  return {
    at,
    reading: {
      id: `${origin}-${at}`,
      value,
      measuredAt: new Date(`${at}T06:50:00+02:00`),
      origin,
      seed: false,
    },
  };
}

const GOAL: Goal = {
  startValue: 92.4,
  startAt: new Date('2026-05-01T06:00:00+02:00'),
  targetValue: 76,
  targetAt: new Date('2027-03-29T06:00:00+02:00'),
  unit: 'kg',
};

/** Mon 17 to Sun 23 August 2026, and the week before it. */
export function twoMissedSessions(): ReviewFacts {
  return {
    weekStart: WEEK_START,
    timeZone: ZONE,
    generatedAt: new Date('2026-08-23T20:00:00+02:00'),
    weightDays: [
      day('2026-08-17', 86.9),
      day('2026-08-18', 86.6),
      day('2026-08-19', 86.5),
      day('2026-08-20', 86.4),
      day('2026-08-21', 86.2),
      day('2026-08-22', 86.3),
      day('2026-08-23', 86.1),
    ],
    priorWeightDays: [
      day('2026-08-10', 87.4),
      day('2026-08-11', 87.2),
      day('2026-08-12', 87.1),
      day('2026-08-13', 87.0),
      day('2026-08-14', 86.9),
      day('2026-08-15', 87.0),
      day('2026-08-16', 86.8),
    ],
    waistDays: [
      day('2026-08-17', null),
      day('2026-08-18', null),
      day('2026-08-19', null),
      day('2026-08-20', null),
      day('2026-08-21', 98.0, 'manual'),
      day('2026-08-22', null),
      day('2026-08-23', null),
    ],
    priorWaistDays: [
      day('2026-08-10', null),
      day('2026-08-11', null),
      day('2026-08-12', null),
      day('2026-08-13', null),
      day('2026-08-14', 98.5, 'manual'),
      day('2026-08-15', null),
      day('2026-08-16', null),
    ],
    goal: GOAL,
    sessions: [
      {
        id: 'mon',
        plannedFor: new Date('2026-08-17T19:00:00+02:00'),
        state: 'completed',
        title: 'Neoness cardio',
        cause: 'Placed at 19:00, your calendar is clear from 18:30.',
      },
      {
        id: 'wed',
        plannedFor: new Date('2026-08-19T07:00:00+02:00'),
        state: 'completed',
        title: 'Home strength',
        cause: 'Morning, because your calendar shows you busy 18:00 to 22:30.',
      },
      {
        id: 'thu',
        plannedFor: new Date('2026-08-20T19:00:00+02:00'),
        state: 'missed',
        title: 'Neoness intervals',
        cause: 'Your calendar was full from 18:00 to 23:00.',
      },
      {
        id: 'sat',
        plannedFor: new Date('2026-08-22T10:30:00+02:00'),
        state: 'missed',
        title: 'Recovery walk',
        cause: '',
      },
    ],
    stepDays: [
      day('2026-08-17', 9120, 'apple_health_shortcut'),
      day('2026-08-18', 8410, 'apple_health_shortcut'),
      day('2026-08-19', 8690, 'apple_health_shortcut'),
      day('2026-08-20', null),
      day('2026-08-21', null),
      day('2026-08-22', null),
      day('2026-08-23', null),
    ],
    sleepDays: [
      day('2026-08-17', 402, 'apple_health_shortcut'),
      day('2026-08-18', 428, 'apple_health_shortcut'),
      day('2026-08-19', 391, 'apple_health_shortcut'),
      day('2026-08-20', 415, 'apple_health_shortcut'),
      day('2026-08-21', null),
      day('2026-08-22', null),
      day('2026-08-23', null),
    ],
    sets: [
      { movementId: 'goblet-squat' },
      { movementId: 'goblet-squat' },
      { movementId: 'goblet-squat' },
      { movementId: 'romanian-deadlift' },
      { movementId: 'romanian-deadlift' },
      { movementId: 'calf-raise' },
    ],
    meals: { decided: 9, planned: 14 },
    kcalTarget: 2150,
    staleSources: [
      { source: 'apple_health_shortcut', lastAt: new Date('2026-08-19T22:10:00+02:00') },
    ],
    proposal: {
      training: {
        sessions: 3,
        minutes: 120,
        cause:
          'Three, not four, because you finished three in each of the last two weeks and a fourth was dropped both times.',
      },
      nutrition: { kcalTarget: 2150, cause: null },
      shopping: { items: 23, deducted: 7, cause: null },
      decisions: { training: 'proposed', nutrition: 'proposed', shopping: 'proposed' },
    },
  };
}

/** A week with nothing in it at all, which is what a fresh install reads back. */
export function emptyWeek(): ReviewFacts {
  const blank = (offset: number) =>
    Array.from({ length: 7 }, (_, index) => day(`2026-08-${String(offset + index).padStart(2, '0')}`, null));
  return {
    weekStart: WEEK_START,
    timeZone: ZONE,
    generatedAt: null,
    weightDays: blank(17),
    priorWeightDays: blank(10),
    waistDays: blank(17),
    priorWaistDays: blank(10),
    goal: null,
    sessions: [],
    stepDays: blank(17),
    sleepDays: blank(17),
    sets: [],
    meals: null,
    kcalTarget: null,
    staleSources: [],
    proposal: {
      training: null,
      nutrition: null,
      shopping: null,
      decisions: { training: 'proposed', nutrition: 'proposed', shopping: 'proposed' },
    },
  };
}
