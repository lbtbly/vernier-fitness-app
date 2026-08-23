import { describe, expect, test } from 'vitest';
import {
  SWEEP_MINUTES,
  WEEKLY_REVIEW_SCHEDULE,
  localWallTime,
  missedPeriods,
  nextWeeklyPeriodKey,
  periodDueAt,
  reviewedWeekStart,
  sweepWindowKey,
  weeklyPeriodKey,
} from '@/lib/schedule';

/**
 * The period key, across both clock changes, which is the arithmetic F119 turns
 * on.
 *
 * WHAT WOULD MAKE THIS GO RED. Computing the period by flooring epoch
 * milliseconds into weekly buckets. On 25 October 2026 the Paris day is
 * twenty-five hours long, so a bucket boundary derived from an instant moves by
 * an hour that night, and two ticks a minute apart inside one Sunday evening
 * fall either side of it and produce two keys. Two keys is two ledger rows, two
 * claims and two plans for one week. The `distinct key` assertions below are
 * exactly that failure written as a number, and they print the population of
 * ticks they walked so a green run cannot be a run with nothing in it.
 *
 * 25 October 2026 is the last Sunday in October and 29 March 2026 is the last
 * Sunday in March. Both are Sundays, so the weekly run lands on both of them,
 * which is why they are the dates this file is built on rather than any other.
 */

const ZONE = 'Europe/Paris';
const key = (iso: string) => weeklyPeriodKey(new Date(iso), WEEKLY_REVIEW_SCHEDULE, ZONE);

describe('the Sunday period, in Paris local time', () => {
  test('an ordinary Sunday evening names its own date', () => {
    expect(key('2026-08-23T20:45:00+02:00')).toBe('2026-08-23T20:00');
  });

  test('five ticks inside one period produce one key', () => {
    // 20:00 Paris on 25 October 2026 is 19:00 UTC, because the clocks went back
    // that morning and Paris is CET by the evening.
    const ticks = [
      '2026-10-25T19:00:00Z',
      '2026-10-25T19:00:30Z',
      '2026-10-25T19:01:00Z',
      '2026-10-25T19:02:30Z',
      '2026-10-25T19:04:00Z',
    ];
    const keys = new Set(ticks.map(key));
    console.log(`five ticks walked: ${ticks.join(', ')}`);
    console.log(`keys produced: ${[...keys].join(', ')}`);
    expect(ticks).toHaveLength(5);
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe('2026-10-25T20:00');
  });

  test('a tick on each side of the October fallback belongs to one Sunday', () => {
    // Before the hour has come round, the Sunday still belongs to last week.
    expect(key('2026-10-25T00:30:00+02:00')).toBe('2026-10-18T20:00');
    expect(key('2026-10-25T18:59:00Z')).toBe('2026-10-18T20:00');
    // At and after it, and on into the Monday that follows, it is this Sunday.
    expect(key('2026-10-25T19:00:00Z')).toBe('2026-10-25T20:00');
    expect(key('2026-10-26T00:30:00+01:00')).toBe('2026-10-25T20:00');
    expect(key('2026-10-31T23:59:00+01:00')).toBe('2026-10-25T20:00');
  });

  test('every minute of the twenty-five hour day produces at most two keys', () => {
    // The whole of 25 October 2026 in Paris, minute by minute, from midnight
    // CEST to midnight CET. Twenty-five hours, so 1500 ticks, and exactly two
    // periods can be represented in them: last Sunday's before 20:00 and this
    // Sunday's from 20:00.
    const start = Date.parse('2026-10-25T00:00:00+02:00');
    const ticks: string[] = [];
    const keys = new Set<string>();
    for (let minute = 0; minute < 25 * 60; minute += 1) {
      const at = new Date(start + minute * 60_000);
      ticks.push(at.toISOString());
      keys.add(weeklyPeriodKey(at, WEEKLY_REVIEW_SCHEDULE, ZONE));
    }
    console.log(`walked ${ticks.length} ticks from ${ticks[0]} to ${ticks[ticks.length - 1]}`);
    console.log(`distinct keys: ${[...keys].sort().join(', ')}`);
    expect(ticks.length).toBe(1500);
    expect([...keys].sort()).toEqual(['2026-10-18T20:00', '2026-10-25T20:00']);
  });

  test('the March spring forward, where the day is twenty-three hours', () => {
    expect(key('2026-03-29T01:30:00Z')).toBe('2026-03-22T20:00');
    expect(key('2026-03-28T19:00:00Z')).toBe('2026-03-22T20:00');
    expect(key('2026-03-29T18:00:00Z')).toBe('2026-03-29T20:00');
    const start = Date.parse('2026-03-29T00:00:00+01:00');
    const keys = new Set<string>();
    let ticks = 0;
    for (let minute = 0; minute < 23 * 60; minute += 1) {
      keys.add(weeklyPeriodKey(new Date(start + minute * 60_000), WEEKLY_REVIEW_SCHEDULE, ZONE));
      ticks += 1;
    }
    console.log(`walked ${ticks} ticks across the spring forward`);
    console.log(`distinct keys: ${[...keys].sort().join(', ')}`);
    expect(ticks).toBe(1380);
    expect([...keys].sort()).toEqual(['2026-03-22T20:00', '2026-03-29T20:00']);
  });

  test('the due instant is resolved at the target date, not at now', () => {
    // CET on the October Sunday, CEST on the March one. An offset read at "now"
    // rather than at the date would put one of these an hour out.
    expect(periodDueAt('2026-10-25T20:00', WEEKLY_REVIEW_SCHEDULE, ZONE).toISOString()).toBe(
      '2026-10-25T19:00:00.000Z',
    );
    expect(periodDueAt('2026-03-29T20:00', WEEKLY_REVIEW_SCHEDULE, ZONE).toISOString()).toBe(
      '2026-03-29T18:00:00.000Z',
    );
    expect(localWallTime(periodDueAt('2026-10-25T20:00', WEEKLY_REVIEW_SCHEDULE, ZONE), ZONE)).toBe(
      '20:00',
    );
    expect(localWallTime(periodDueAt('2026-03-29T20:00', WEEKLY_REVIEW_SCHEDULE, ZONE), ZONE)).toBe(
      '20:00',
    );
  });

  test('the next period is seven calendar days on, across the change', () => {
    expect(nextWeeklyPeriodKey('2026-10-18T20:00', WEEKLY_REVIEW_SCHEDULE)).toBe('2026-10-25T20:00');
    expect(nextWeeklyPeriodKey('2026-10-25T20:00', WEEKLY_REVIEW_SCHEDULE)).toBe('2026-11-01T20:00');
    expect(nextWeeklyPeriodKey('2026-03-22T20:00', WEEKLY_REVIEW_SCHEDULE)).toBe('2026-03-29T20:00');
  });

  test('the week a Sunday period reviews starts on its own Monday', () => {
    expect(reviewedWeekStart('2026-10-25T20:00', ZONE)).toBe('2026-10-19');
    expect(reviewedWeekStart('2026-08-23T20:00', ZONE)).toBe('2026-08-17');
  });
});

describe('the week the screen reads back', () => {
  test('is the same one the job claimed, from Sunday evening to Sunday evening', async () => {
    // The screen and the job compute this from one function. `mondayOf(today)`
    // is right at 20:45 on a Sunday and wrong every other hour of the week: on
    // the Monday after, it names the week that has just started and has nothing
    // in it, and the proposal block then looks at the week after next and finds
    // no sessions, because slice 8 proposes for the Monday that is coming.
    const { reviewedWeekOf } = await import('@/db/weekly-review');
    const walked: string[] = [];
    for (const at of [
      '2026-08-23T20:45:00+02:00',
      '2026-08-23T23:59:00+02:00',
      '2026-08-24T09:00:00+02:00',
      '2026-08-26T13:00:00+02:00',
      '2026-08-29T18:00:00+02:00',
      '2026-08-30T19:59:00+02:00',
    ]) {
      const week = reviewedWeekOf(new Date(at), ZONE);
      walked.push(`${at} -> ${week}`);
      expect(week).toBe('2026-08-17');
    }
    console.log(walked.join('\n'));
    expect(walked).toHaveLength(6);

    // And the moment the next Sunday's 20:00 arrives, it moves on by exactly
    // one week and not by one day.
    expect(reviewedWeekOf(new Date('2026-08-30T20:00:00+02:00'), ZONE)).toBe('2026-08-24');
  });

  test('the next week it proposes for is the one slice 8 proposes for', async () => {
    const { reviewedWeekOf } = await import('@/db/weekly-review');
    const { upcomingWeekStart } = await import('@/db/training');
    // At the moment the review is generated, which is the moment that matters:
    // the block on screen names the week the training proposer just filled.
    for (const at of ['2026-08-23T20:45:00+02:00', '2026-10-25T20:45:00+01:00']) {
      const reviewed = reviewedWeekOf(new Date(at), ZONE);
      const proposesFor = dayAfterKey(reviewed, 7);
      const theirs = upcomingWeekStart(new Date(at), ZONE);
      console.log(`${at}: review proposes for ${proposesFor}, training proposes for ${theirs}`);
      expect(proposesFor).toBe(theirs);
    }
  });
});

/** Whole days on a label, the same arithmetic `dayAfter` does. */
function dayAfterKey(from: string, ahead: number): string {
  return new Date(Date.parse(`${from}T00:00:00Z`) + ahead * 86_400_000).toISOString().slice(0, 10);
}

describe('what a boot owes', () => {
  test('a container down across Sunday owes exactly one period', () => {
    // Booting on the Tuesday after a Sunday it missed.
    const now = new Date('2026-08-25T09:12:00+02:00');
    const since = new Date(now.getTime() - 8 * 86_400_000);
    const owed = missedPeriods(since, now, WEEKLY_REVIEW_SCHEDULE, ZONE);
    console.log(`boot at ${now.toISOString()} owes: ${owed.join(', ') || 'nothing'}`);
    expect(owed).toEqual(['2026-08-23T20:00']);
  });

  test('a container down for a month still owes one, and never four', () => {
    const now = new Date('2026-09-15T09:12:00+02:00');
    const since = new Date(now.getTime() - 40 * 86_400_000);
    const owed = missedPeriods(since, now, WEEKLY_REVIEW_SCHEDULE, ZONE);
    console.log(`boot after a month owes: ${owed.join(', ')}`);
    expect(owed).toHaveLength(1);
    expect(owed).toEqual(['2026-09-13T20:00']);
  });

  test('a boot before the first period of a window owes nothing', () => {
    const now = new Date('2026-08-24T09:12:00+02:00');
    // A window that opens after the last Sunday evening has already passed.
    const since = new Date('2026-08-24T00:00:00+02:00');
    expect(missedPeriods(since, now, WEEKLY_REVIEW_SCHEDULE, ZONE)).toEqual([]);
  });
});

describe('the five-minute sweep window', () => {
  test('everything inside one window shares a key', () => {
    const base = '2026-08-23T20:0';
    const keys = new Set(
      ['0:00', '1:12', '2:59', '4:59'].map((tail) =>
        sweepWindowKey(new Date(`${base}${tail}+02:00`), ZONE),
      ),
    );
    console.log(`window keys across five minutes: ${[...keys].join(', ')}`);
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe('2026-08-23T20:00');
  });

  test('the next window is its own key', () => {
    expect(sweepWindowKey(new Date('2026-08-23T20:05:00+02:00'), ZONE)).toBe('2026-08-23T20:05');
    expect(SWEEP_MINUTES).toBe(5);
  });

  test('a window is named on the local clock, so the fallback hour repeats safely', () => {
    // 02:30 CEST and 02:30 CET on 25 October 2026 are two different instants an
    // hour apart, and both are 02:30 in Paris. They share a window key, which
    // is correct: they are the same five minutes of the owner's evening, and
    // the item state, not the key, is what stops a second send.
    const first = sweepWindowKey(new Date('2026-10-25T00:30:00Z'), ZONE);
    const second = sweepWindowKey(new Date('2026-10-25T01:30:00Z'), ZONE);
    console.log(`ambiguous hour: ${first} and ${second}`);
    expect(first).toBe('2026-10-25T02:30');
    expect(second).toBe('2026-10-25T02:30');
  });
});
