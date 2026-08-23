import { describe, expect, test } from 'vitest';
import { nextWeekStart, weekStartKey } from '@/db/nutrition';

/**
 * Which Monday "next week" starts on, read in the app's own zone.
 *
 * This is the kind of arithmetic that works for eleven months and then moves a
 * whole week by a day at 23:40 on a Sunday in Paris, because the instant is
 * read in UTC and the calendar day is not. So it is computed from the app's own
 * day key and asserted at both ends of the day, in both halves of the year.
 *
 * WHAT WOULD MAKE THIS GO RED. Reading `getUTCDay()` off the raw instant rather
 * than off the app's calendar day fails the two late-evening cases immediately:
 * 23:40 Paris on a Sunday in July is 21:40 UTC on the same Sunday, but 00:30
 * Paris on a Monday is 22:30 UTC on the Sunday before it, and the two would
 * disagree about which week they are in.
 */

const ZONE = 'Europe/Paris';

describe('the Monday next week starts on', () => {
  test('a Sunday evening plans the day after', () => {
    // Sunday 23 August 2026, 20:45 Paris. The Sunday planning session.
    const start = nextWeekStart(new Date('2026-08-23T20:45:00+02:00'), ZONE);
    expect(weekStartKey(start)).toBe('2026-08-24');
  });

  test('a Monday plans the Monday after, not today', () => {
    const start = nextWeekStart(new Date('2026-08-24T09:00:00+02:00'), ZONE);
    expect(weekStartKey(start)).toBe('2026-08-31');
  });

  test('every other day of that week plans the same Monday', () => {
    for (const day of ['25', '26', '27', '28', '29']) {
      const start = nextWeekStart(new Date(`2026-08-${day}T12:00:00+02:00`), ZONE);
      expect(weekStartKey(start)).toBe('2026-08-31');
    }
    // And the Saturday, which is the last day before the Sunday flips it.
    expect(weekStartKey(nextWeekStart(new Date('2026-08-30T12:00:00+02:00'), ZONE))).toBe(
      '2026-08-31',
    );
  });

  test('late on a Sunday and early on the Monday are two different weeks', () => {
    // 23:40 Paris on Sunday is still the Sunday, and 00:30 Paris on Monday is
    // the Sunday in UTC. Read in the app's zone they are one day apart, and
    // they plan two different weeks.
    const sundayNight = nextWeekStart(new Date('2026-08-23T23:40:00+02:00'), ZONE);
    const mondayMorning = nextWeekStart(new Date('2026-08-24T00:30:00+02:00'), ZONE);
    expect(weekStartKey(sundayNight)).toBe('2026-08-24');
    expect(weekStartKey(mondayMorning)).toBe('2026-08-31');
  });

  test('winter, where the offset is one hour rather than two', () => {
    expect(weekStartKey(nextWeekStart(new Date('2026-01-04T23:40:00+01:00'), ZONE))).toBe(
      '2026-01-05',
    );
    expect(weekStartKey(nextWeekStart(new Date('2026-01-05T00:30:00+01:00'), ZONE))).toBe(
      '2026-01-12',
    );
  });

  test('the week it names is always seven days long and always a Monday', () => {
    for (let offset = 0; offset < 14; offset += 1) {
      const now = new Date(Date.UTC(2026, 7, 1 + offset, 10, 0, 0));
      const start = nextWeekStart(now, ZONE);
      const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: ZONE }).format(
        start,
      );
      expect(weekday).toBe('Monday');
      expect(start.getTime()).toBeGreaterThan(now.getTime());
    }
  });
});
