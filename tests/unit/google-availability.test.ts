import { describe, expect, it } from 'vitest';
import {
  EARLIEST_HOUR,
  LATEST_END_HOUR,
  SEARCH_DAYS,
  collisionsWith,
  findSlot,
  readFreeBusy,
} from '@/lib/google/availability';
import { buildDiff } from '@/lib/google/diff';
import { DEMO_UNSHARED_ID, demoBusy } from '@/lib/google/demo-dataset';

/**
 * F104. AVAILABILITY IS READ THROUGH THE FREE-BUSY QUERY, AND A PER-CALENDAR
 * ERROR IS SURFACED RATHER THAN TREATED AS FREE TIME.
 *
 * This is the check that passes by not checking, written down. A calendar the
 * owner has been unshared from answers with an `errors` entry AND AN EMPTY BUSY
 * LIST. A reader that looks only at `busy` sees an empty array, calls the day
 * free, and schedules a session over a real meeting while reporting the calendar
 * as clear. The two cases are identical in the field that most code reads and
 * different only in the field most code ignores.
 *
 * WHAT WOULD MAKE THIS GO RED. Dropping `errors` on the floor. Reporting a
 * failed calendar as having no busy periods. A diff that says "your calendars
 * show nothing else then" when one of them said nothing at all.
 */

const WINDOW = { min: '2026-08-24T00:00:00.000Z', max: '2026-08-31T00:00:00.000Z' };

/** What Google really answers when one of three calendars has been unshared. */
const ANSWER = {
  kind: 'calendar#freeBusy',
  timeMin: WINDOW.min,
  timeMax: WINDOW.max,
  calendars: {
    'owner@example.test': {
      busy: [{ start: '2026-08-27T16:00:00.000Z', end: '2026-08-27T21:00:00.000Z' }],
    },
    'family@example.test': { busy: [] },
    [DEMO_UNSHARED_ID]: { errors: [{ domain: 'global', reason: 'notFound' }], busy: [] },
  },
};

describe('F104, the free-busy answer', () => {
  it('surfaces the per-calendar error instead of reading it as free time', () => {
    const reading = readFreeBusy(ANSWER);
    console.log(`calendars answered for: ${reading.answeredFor.join(', ')}`);
    console.log(`busy intervals: ${reading.busy.length}`);
    console.log(`failures: ${JSON.stringify(reading.failures)}`);

    // The population beside the failure: three calendars came back, one busy
    // interval was read, and the failure is one of the three rather than the
    // whole answer.
    expect(reading.answeredFor.length).toBe(3);
    expect(reading.busy.length).toBe(1);
    expect(reading.failures.length).toBe(1);
    expect(reading.failures[0]).toEqual({
      calendarId: DEMO_UNSHARED_ID,
      reason: 'notFound',
      detail: 'global',
    });

    // AND THE FAILED CALENDAR CONTRIBUTES NO BUSY INTERVAL, which is exactly why
    // it must be reported: its silence is indistinguishable from a free week.
    expect(reading.busy.some((interval) => interval.calendarId === DEMO_UNSHARED_ID)).toBe(false);
    // The calendar that answered with a genuinely empty list is not a failure.
    expect(reading.failures.some((failure) => failure.calendarId === 'family@example.test')).toBe(false);
  });

  it('makes the diff say the time is not confirmed clear when a calendar failed', () => {
    const reading = readFreeBusy(ANSWER);
    const session = {
      id: 'plan_session_1',
      title: 'Strength',
      plannedFor: new Date('2026-08-25T17:00:00.000Z'),
      durationMinutes: 45,
    };

    const withFailure = buildDiff({
      sessions: [session],
      events: [],
      busy: reading.busy,
      failures: reading.failures,
      timeZone: 'Europe/Paris',
    });
    const withoutFailure = buildDiff({
      sessions: [session],
      events: [],
      busy: reading.busy,
      failures: [],
      timeZone: 'Europe/Paris',
    });

    console.log(`cause with a failed calendar: ${withFailure.rows[0].cause.key}`);
    console.log(`cause with every calendar read: ${withoutFailure.rows[0].cause.key}`);
    expect(withFailure.availabilityIncomplete).toBe(true);
    expect(withFailure.rows[0].cause.key).toBe('clearUnverified');
    expect(withFailure.failures.length).toBe(1);
    // The same placement with nothing failing says the plain thing instead, so
    // the difference above is the failure being carried and not a constant.
    expect(withoutFailure.availabilityIncomplete).toBe(false);
    expect(withoutFailure.rows[0].cause.key).toBe('clear');
  });

  it('reads a groups error as well, because a group that failed to expand is not empty', () => {
    const reading = readFreeBusy({
      calendars: {},
      groups: { 'team@example.test': { errors: [{ reason: 'notFound' }], calendars: [] } },
    });
    console.log(`group failures: ${JSON.stringify(reading.failures)}`);
    expect(reading.failures.length).toBe(1);
    expect(reading.failures[0].calendarId).toBe('team@example.test');
  });

  it('reads nothing out of an answer that is not one', () => {
    for (const body of [null, undefined, 'text', 42, {}]) {
      const reading = readFreeBusy(body);
      expect(reading.busy).toEqual([]);
      expect(reading.failures).toEqual([]);
    }
    console.log('five malformed bodies read as no busy periods and no failures');
  });
});

describe('F104, where a session can go', () => {
  it('keeps a slot that collides with nothing', () => {
    const busy = [{ calendarId: 'owner', start: '2026-08-25T09:00:00.000Z', end: '2026-08-25T12:00:00.000Z' }];
    const desired = new Date('2026-08-25T17:00:00.000Z');
    const slot = findSlot(desired, 45, busy, 'Europe/Paris');
    console.log(`slot kind: ${slot.kind}, at ${slot.kind !== 'no_slot' ? slot.start.toISOString() : 'none'}`);
    expect(slot.kind).toBe('kept');
  });

  it('moves a slot off a busy block and names the block it moved off', () => {
    // The design sheet's own example: Thursday evening, busy 18:00 to 23:00.
    const busy = [
      { calendarId: 'owner', start: '2026-08-27T16:00:00.000Z', end: '2026-08-27T21:00:00.000Z' },
    ];
    const desired = new Date('2026-08-27T16:45:00.000Z');
    const slot = findSlot(desired, 40, busy, 'Europe/Paris');
    console.log(`slot kind: ${slot.kind}`);
    expect(slot.kind).toBe('moved');
    if (slot.kind !== 'moved') return;
    console.log(`moved to ${slot.start.toISOString()}, blocked by ${slot.blockedBy.start} to ${slot.blockedBy.end}`);
    expect(collisionsWith(slot.start, 40, busy)).toEqual([]);
    expect(slot.blockedBy.start).toBe('2026-08-27T16:00:00.000Z');
    // It never moves EARLIER than the owner asked for: a session pulled forward
    // is a change he did not request.
    expect(slot.start.getTime()).toBeGreaterThan(desired.getTime());
  });

  it('says so rather than shrugging when a week has nowhere free', () => {
    // Busy from 06:00 to 23:00 local, every day of the search window, so there
    // is genuinely nowhere a 45-minute session fits.
    const busy = Array.from({ length: SEARCH_DAYS + 1 }, (_, day) => ({
      calendarId: 'owner',
      start: new Date(Date.parse('2026-08-25T04:00:00.000Z') + day * 86_400_000).toISOString(),
      end: new Date(Date.parse('2026-08-25T21:00:00.000Z') + day * 86_400_000).toISOString(),
    }));
    const slot = findSlot(new Date('2026-08-25T17:00:00.000Z'), 45, busy, 'Europe/Paris');
    console.log(`slot kind over ${busy.length} blocked days: ${slot.kind}`);
    expect(slot.kind).toBe('no_slot');
    // The bound is fixed by construction rather than by how full the calendar
    // is: hours a day, days ahead, both constants.
    console.log(`search bounds: ${EARLIEST_HOUR}:00 to ${LATEST_END_HOUR}:00, ${SEARCH_DAYS} days`);
    expect(SEARCH_DAYS).toBe(7);
  });

  it('generates a demonstration week whose Thursday evening is the one the sheet quotes', () => {
    const busy = demoBusy(WINDOW.min, WINDOW.max, ['owner@demonstration.vernier'], 'Europe/Paris');
    console.log(`demonstration busy intervals in the window: ${busy.length}`);
    expect(busy.length).toBeGreaterThan(5);
    const thursdayEvening = busy.find((interval) => {
      const start = new Date(interval.start);
      return (
        new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'Europe/Paris' }).format(start) ===
          'Thursday' &&
        new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Paris' }).format(
          start,
        ) === '18'
      );
    });
    console.log(`Thursday evening block: ${thursdayEvening?.start} to ${thursdayEvening?.end}`);
    expect(thursdayEvening).toBeDefined();
  });
});
