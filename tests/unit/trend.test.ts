import { describe, expect, test } from 'vitest';
import {
  AVERAGE_WINDOW,
  type Day,
  type Reading,
  STALE_HOURS,
  adherence,
  dailySeries,
  dayKey,
  findGaps,
  freshnessOf,
  goalValueOn,
  rollingAverage,
  windowDays,
} from '@/lib/trend';
import { DEMO_SESSIONS, DEMO_WEIGHT_GAP, WEIGHT_BY_DAY } from '@/lib/demo-series';
import { PACE_DAYS, weightSummary } from '@/lib/weight-summary';

/**
 * The trend rules, graded as arithmetic.
 *
 * These are the sentences the screens say out loud, and this file is where they
 * are true or not. Two things are being defended: that the trend leads and the
 * daily reading does not, and that absence is drawn rather than smoothed. Every
 * test below is written so that it fails if the smoothing comes back.
 */

const ZONE = 'Europe/Paris';
/** A fixed morning, so nothing here depends on when the suite runs. */
const ANCHOR = new Date('2026-08-22T06:52:00+02:00');

function readingsFrom(table: Record<number, number>, anchor = ANCHOR): Reading[] {
  return Object.entries(table).map(([offset, value]) => ({
    id: `r${offset}`,
    value,
    measuredAt: new Date(anchor.getTime() - Number(offset) * 86_400_000),
    origin: 'withings',
    seed: true,
  }));
}

function seriesOf(days: number, table: Record<number, number>): Day[] {
  return dailySeries(readingsFrom(table), windowDays(ANCHOR, days, ZONE), ZONE);
}

describe('a daily series keeps the days that are not there', () => {
  test('an empty day is a column with no reading, never a dropped column', () => {
    const days = seriesOf(30, WEIGHT_BY_DAY);
    expect(days).toHaveLength(30);
    const missing = days.filter((day) => day.reading === null);
    expect(missing).toHaveLength(DEMO_WEIGHT_GAP.length);
    // And what is missing is exactly the four the seed leaves out, by date.
    const gapDates = DEMO_WEIGHT_GAP.map((offset) =>
      dayKey(new Date(ANCHOR.getTime() - offset * 86_400_000), ZONE),
    ).sort();
    expect(missing.map((day) => day.at).sort()).toEqual(gapDates);
  });

  test('no value is carried forward into a day that has none', () => {
    const days = seriesOf(30, WEIGHT_BY_DAY);
    const empty = days.filter((day) => day.reading === null);
    expect(empty.every((day) => day.reading === null)).toBe(true);
    // The defeat attempt: if anything filled a hole with its neighbour, the
    // number of distinct stored values would rise to the number of days.
    const stored = days.filter((day) => day.reading).length;
    expect(stored).toBe(30 - DEMO_WEIGHT_GAP.length);
  });
});

describe('a gap is three days or more', () => {
  test('four missing days are one gap, named by its first and last date', () => {
    const days = seriesOf(30, WEIGHT_BY_DAY);
    const gaps = findGaps(days);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].toIndex - gaps[0].fromIndex + 1).toBe(4);
  });

  test('two missing days are not a gap, and three are', () => {
    const twoDays = seriesOf(10, { 0: 86, 1: 86.2, 2: 86.4, 5: 87, 6: 87.1, 7: 87.2, 8: 87.3, 9: 87.4 });
    expect(findGaps(twoDays)).toHaveLength(0);
    const threeDays = seriesOf(10, { 0: 86, 4: 87, 5: 87.1, 6: 87.2, 7: 87.3, 8: 87.4, 9: 87.5 });
    expect(findGaps(threeDays)).toHaveLength(1);
  });
});

describe('a rolling average states the window it actually had', () => {
  const days = seriesOf(30, WEIGHT_BY_DAY);
  const points = rollingAverage(days);

  test('seven of seven is solid', () => {
    const today = points[points.length - 1];
    expect(today.count).toBe(AVERAGE_WINDOW);
    expect(today.draw).toBe('solid');
  });

  test('five or six of seven is dashed and still carries its count', () => {
    const dashed = points.filter((point) => point.draw === 'dashed');
    expect(dashed.length).toBeGreaterThan(0);
    for (const point of dashed) {
      expect(point.count).toBeGreaterThanOrEqual(5);
      expect(point.count).toBeLessThan(AVERAGE_WINDOW);
      expect(point.value).not.toBeNull();
    }
  });

  test('below five days it is not drawn at all, and the mean is still known', () => {
    const gapDates = new Set(
      findGaps(days).flatMap((gap) =>
        days.slice(gap.fromIndex, gap.toIndex + 1).map((day) => day.at),
      ),
    );
    const undrawn = points.filter(
      (point) => point.draw === 'undrawn' && point.count > 0 && !gapDates.has(point.at),
    );
    expect(undrawn.length).toBeGreaterThan(0);
    for (const point of undrawn) {
      expect(point.count).toBeLessThan(5);
      // Not drawable, which is the rule, and not lost, which is the other rule:
      // the figure is real and may be stated as long as it states its count.
      expect(point.value).toBeNull();
      expect(point.mean).not.toBeNull();
    }
  });

  test('a day inside a gap is never drawn, however full its trailing window', () => {
    // The defeat attempt this exists for, and it is the one that got through
    // first. A trailing average over the previous six days is arithmetically
    // defined on the first day of a four-day gap, and drawing it walks the line
    // straight into the hatching looking exactly like a trend. F30 says the gap
    // breaks the line, so a day inside one is undrawn whatever its window held.
    const gapDates = new Set(
      findGaps(days).flatMap((gap) =>
        days.slice(gap.fromIndex, gap.toIndex + 1).map((day) => day.at),
      ),
    );
    const insideGap = points.filter((point) => gapDates.has(point.at));
    expect(insideGap).toHaveLength(4);
    expect(insideGap.some((point) => point.count >= 5)).toBe(true);
    for (const point of insideGap) {
      expect(point.draw).toBe('undrawn');
      expect(point.value).toBeNull();
    }
  });

  test('a window mean is over the days it has, never over seven with holes filled', () => {
    // Three readings, four holes. The mean is the mean of three.
    const short = seriesOf(7, { 0: 86, 1: 87, 2: 88 });
    const point = rollingAverage(short).at(-1)!;
    expect(point.count).toBe(3);
    expect(point.mean).toBeCloseTo(87, 6);
    // The defeat attempt: a zero-filled window would read 261 / 7 = 37.3.
    expect(point.mean).not.toBeCloseTo(261 / 7, 1);
  });
});

describe('the goal is a straight line between two points', () => {
  const goal = {
    startValue: 89,
    startAt: new Date('2026-06-30T07:00:00+02:00'),
    targetValue: 76,
    targetAt: new Date('2027-03-30T07:00:00+02:00'),
    unit: 'kg',
  };

  test('the value on the start day is the start value', () => {
    expect(goalValueOn(goal, goal.startAt)).toBeCloseTo(89, 6);
  });

  test('the value on the target day is the target value', () => {
    expect(goalValueOn(goal, goal.targetAt)).toBeCloseTo(76, 6);
  });

  test('halfway through is halfway down', () => {
    const middle = new Date((goal.startAt.getTime() + goal.targetAt.getTime()) / 2);
    expect(goalValueOn(goal, middle)).toBeCloseTo(82.5, 4);
  });
});

/**
 * The hand computation F29, F30 and F33 ask for, done here against the same
 * tables `src/db/demo-series.ts` hands the seed. If a number on Today changes,
 * this fails first.
 */
describe('the demonstration seed, computed by hand', () => {
  const days = seriesOf(30, WEIGHT_BY_DAY);
  const goal = {
    startValue: 89,
    startAt: new Date(ANCHOR.getTime() - 53 * 86_400_000),
    targetValue: 76,
    targetAt: new Date('2027-03-30T07:00:00+02:00'),
    unit: 'kg',
  };
  const summary = weightSummary(days, goal, ANCHOR);

  test("today's seven-day average is 86.4 kg and this morning's reading is 85.9", () => {
    expect(summary.average!.mean!).toBeCloseTo(604.8 / 7, 6);
    expect(summary.average!.mean!.toFixed(1)).toBe('86.4');
    expect(summary.latest!.value).toBe(85.9);
    // The whole design in one assertion: the headline is not the daily reading.
    expect(summary.average!.mean).not.toBe(summary.latest!.value);
  });

  test("last week's average is 87.0 on three days of seven, and the week is down 0.6", () => {
    expect(summary.shortWindow).toEqual({ count: 3, size: 7 });
    expect(summary.lastWeek!.mean!.toFixed(1)).toBe('87.0');
    expect(summary.weekChange!.toFixed(1)).toBe('-0.6');
  });

  test('the 28-day pace is half a kilogram a week', () => {
    expect(summary.pace!.toFixed(1)).toBe('-0.5');
    expect(PACE_DAYS).toBe(28);
  });

  test('the average sits a tenth of a kilogram under the line to 76.0', () => {
    expect(summary.goalDelta).toBeLessThan(0);
    expect(Math.abs(summary.goalDelta!).toFixed(1)).toBe('0.1');
  });
});

describe('adherence is a count over its denominator', () => {
  const sessions = DEMO_SESSIONS.map((session) => ({
    id: `s${session.offset}`,
    plannedFor: new Date(ANCHOR.getTime() - session.offset * 86_400_000),
    state: session.state,
  }));

  test('two of three over seven days, eleven of fourteen over twenty-eight', () => {
    expect(adherence(sessions, ANCHOR, 7, ZONE)).toEqual({ completed: 2, planned: 3, days: 7 });
    expect(adherence(sessions, ANCHOR, 28, ZONE)).toEqual({ completed: 11, planned: 14, days: 28 });
  });

  test('the denominator counts what was planned, not what was done', () => {
    const week = adherence(sessions, ANCHOR, 7, ZONE);
    expect(week.planned).toBeGreaterThan(week.completed);
    // The defeat attempt: a percentage would read 67 and hide the one still to
    // come. The count keeps it.
    expect(week.planned - week.completed).toBe(1);
  });
});

describe('a source is stale at thirty-six hours, and not at thirty-five', () => {
  const now = new Date('2026-08-22T12:00:00+02:00');

  test('thirty-five hours is fresh', () => {
    const fresh = freshnessOf('apple_health_shortcut', new Date(now.getTime() - 35 * 3_600_000), now);
    expect(fresh.hours).toBe(35);
    expect(fresh.stale).toBe(false);
  });

  test('thirty-seven hours is stale, and the age is in hours', () => {
    const stale = freshnessOf('apple_health_shortcut', new Date(now.getTime() - 37 * 3_600_000), now);
    expect(stale.hours).toBe(37);
    expect(stale.stale).toBe(true);
    expect(STALE_HOURS).toBe(36);
  });

  test('a source that has never sent anything is absent, not stale', () => {
    const never = freshnessOf('withings', null, now);
    expect(never.stale).toBe(false);
    expect(never.hours).toBeNull();
    expect(never.lastAt).toBeNull();
  });
});
