import { describe, expect, it } from 'vitest';
import {
  MissingCalendarIdError,
  PrimaryCalendarRefused,
  calendarListUrl,
  calendarUrl,
  containsPrimary,
  eventUrl,
  eventsInsertUrl,
  eventsListUrl,
  freeBusyUrl,
} from '@/lib/google/protocol';
import { ConfirmSkipped, confirmSelected, listAppEvents, listCalendars, queryFreeBusy } from '@/lib/google/client';
import { WRITE_SITES, type WriteInput } from '@/lib/google/write-sites';
import { harness, okAnswer } from './google-harness';

/**
 * F105 and half of F104. EVERY WRITE TARGETS THE STORED APP-CREATED CALENDAR AND
 * NO REQUEST PATH CONTAINS THE PRIMARY KEYWORD, and no event listing is issued
 * against any calendar but that one.
 *
 * The check is on the FINISHED URL rather than on the argument that went into
 * it, because a rule enforced where a URL is built is one refactor away from not
 * being enforced. Every outbound URL this client can produce is generated here,
 * printed, and greppped.
 *
 * WHAT WOULD MAKE THIS GO RED. A builder that accepted `primary`. A write that
 * took a calendar identifier from anywhere but the stored one. An `events.list`
 * against a second calendar, which is what the free-busy design exists to avoid.
 * A missing stored identifier treated as a reason to create a second calendar.
 */

const STORED = 'vernier-training@group.calendar.google.com';

const input: WriteInput = {
  calendarId: STORED,
  eventId: 'vrnr0000000000000000',
  sessionId: 'plan_session_1',
  summary: 'Training: Strength',
  description: 'Written by Vernier.',
  start: new Date('2026-08-24T17:00:00.000Z'),
  end: new Date('2026-08-24T17:45:00.000Z'),
  timeZone: 'Europe/Paris',
  mode: 'demonstration',
};

describe('F105, the request paths', () => {
  it('generates every outbound URL this client can produce, and none names the primary calendar', async () => {
    const plan = { id: 'plan_1', state: 'open', rowIds: ['plan_1_r0'] };
    const confirmation = confirmSelected(plan, ['plan_1_r0'], new Date())[0];
    const rig = harness({ answer: () => okAnswer({ id: STORED, items: [] }) });

    // Every read.
    await listCalendars(rig.ports);
    await queryFreeBusy(rig.ports, {
      timeMin: '2026-08-24T00:00:00.000Z',
      timeMax: '2026-09-07T00:00:00.000Z',
      timeZone: 'Europe/Paris',
      calendarIds: ['owner@example.test'],
    });
    await listAppEvents(rig.ports, {
      calendarId: STORED,
      timeMin: '2026-08-24T00:00:00.000Z',
      timeMax: '2026-09-07T00:00:00.000Z',
    });

    // Every write, confirmed, so each one really goes out.
    for (const site of WRITE_SITES) {
      await site.run(rig.ports, confirmation, input);
    }

    const urls = rig.urls();
    console.log(`outbound URLs generated:\n  ${urls.join('\n  ')}`);
    // The population beside the zero: eight URLs, three reads and five writes.
    expect(urls.length).toBe(8);
    expect(rig.writes().length).toBe(5);

    for (const url of urls) {
      expect(containsPrimary(url)).toBe(false);
      expect(url.startsWith('https://www.googleapis.com/calendar/v3/')).toBe(true);
    }

    // AND EVERY CALENDAR-SCOPED PATH NAMES THE STORED IDENTIFIER. Not "some
    // identifier": that one.
    // Five of the eight name a calendar in the path. The sixth write,
    // `calendars.insert`, posts to the collection and names none, because the
    // calendar it creates does not exist yet.
    const scoped = urls.filter((url) => url.includes('/calendars/'));
    console.log(`calendar-scoped paths: ${scoped.length}`);
    expect(scoped.length).toBe(5);
    for (const url of scoped) {
      expect(decodeURIComponent(new URL(url).pathname)).toContain(STORED);
    }
  });

  it('reads events on the app calendar and on nothing else', async () => {
    // The whole design of the availability read: `freeBusy.query` for everybody
    // else's calendars, `events.list` for this app's own. So the only events
    // path in the run above is the one naming the stored identifier.
    const rig = harness({ answer: () => okAnswer({ items: [] }) });
    await queryFreeBusy(rig.ports, {
      timeMin: '2026-08-24T00:00:00.000Z',
      timeMax: '2026-09-07T00:00:00.000Z',
      timeZone: 'Europe/Paris',
      calendarIds: ['owner@example.test', 'family@example.test'],
    });
    await listAppEvents(rig.ports, {
      calendarId: STORED,
      timeMin: '2026-08-24T00:00:00.000Z',
      timeMax: '2026-09-07T00:00:00.000Z',
    });

    const eventLists = rig.urls().filter((url) => url.includes('/events'));
    console.log(`event listings issued: ${eventLists.length}`);
    console.log(`  ${eventLists.join('\n  ')}`);
    expect(eventLists.length).toBe(1);
    expect(decodeURIComponent(eventLists[0])).toContain(STORED);

    // And the free-busy call named two calendars in ONE request, which is the
    // batched read Google documents rather than one request per calendar.
    const freeBusy = rig.sent.filter((request) => request.url === freeBusyUrl());
    expect(freeBusy.length).toBe(1);
    const body = freeBusy[0].json as { items: Array<{ id: string }> };
    console.log(`free-busy asked about: ${body.items.map((item) => item.id).join(', ')}`);
    expect(body.items.length).toBe(2);
  });

  it('refuses the primary keyword wherever it is offered', () => {
    const attempts = ['primary', 'PRIMARY', ' primary '];
    for (const attempt of attempts) {
      expect(() => eventsInsertUrl(attempt)).toThrow(PrimaryCalendarRefused);
      expect(() => eventUrl(attempt, 'vrnr0000000000000000')).toThrow(PrimaryCalendarRefused);
      expect(() => calendarUrl(attempt)).toThrow(PrimaryCalendarRefused);
      expect(() =>
        eventsListUrl(attempt, { timeMin: '2026-08-24T00:00:00.000Z', timeMax: '2026-09-07T00:00:00.000Z' }),
      ).toThrow(PrimaryCalendarRefused);
    }
    console.log(`primary keyword refused in ${attempts.length * 4} builder calls`);

    // And the finished-URL reader catches it even if a builder ever stopped.
    expect(containsPrimary('https://www.googleapis.com/calendar/v3/calendars/primary/events')).toBe(true);
    expect(containsPrimary('https://www.googleapis.com/calendar/v3/calendars/pri%6dary/events')).toBe(true);
    // A calendar whose own identifier merely contains the word is not a match:
    // the reader compares path segments rather than searching the string.
    expect(containsPrimary(eventsInsertUrl('primary.school@example.test'))).toBe(false);
  });

  it('treats a missing stored identifier as an error and never as a second calendar', async () => {
    for (const empty of ['', '   ']) {
      expect(() => eventsInsertUrl(empty)).toThrow(MissingCalendarIdError);
      expect(() => eventUrl(empty, 'vrnr0000000000000000')).toThrow(MissingCalendarIdError);
      expect(() => calendarUrl(empty)).toThrow(MissingCalendarIdError);
    }

    // Driven through a write site with a confirmation, so this is the refusal a
    // real apply would meet rather than a builder called in isolation.
    const plan = { id: 'plan_1', state: 'open', rowIds: ['plan_1_r0'] };
    const confirmation = confirmSelected(plan, ['plan_1_r0'], new Date())[0];
    const rig = harness({ answer: () => okAnswer() });
    let thrown: unknown = null;
    try {
      await WRITE_SITES[2].run(rig.ports, confirmation, { ...input, calendarId: '' });
    } catch (error) {
      thrown = error;
    }
    console.log(`insert with no stored calendar: threw=${thrown !== null}, requests sent=${rig.sent.length}`);
    expect(thrown).toBeInstanceOf(MissingCalendarIdError);
    expect(thrown).not.toBeInstanceOf(ConfirmSkipped);
    expect(rig.sent).toEqual([]);
  });

  it('sends no notification traffic on a write, because there are no guests', () => {
    const insert = new URL(eventsInsertUrl(STORED));
    const patch = new URL(eventUrl(STORED, 'vrnr0000000000000000'));
    console.log(`sendUpdates: insert=${insert.searchParams.get('sendUpdates')}, update=${patch.searchParams.get('sendUpdates')}`);
    expect(insert.searchParams.get('sendUpdates')).toBe('none');
    expect(patch.searchParams.get('sendUpdates')).toBe('none');
  });

  it('asks the calendar list for a page it can actually read', () => {
    const url = new URL(calendarListUrl());
    console.log(`calendar list: ${url.pathname}?${url.searchParams.toString()}`);
    expect(url.pathname).toBe('/calendar/v3/users/me/calendarList');
    expect(url.searchParams.get('maxResults')).toBe('250');
  });

  it('bounds an event listing the way a scheduling read has to be bounded', () => {
    const url = new URL(
      eventsListUrl(STORED, { timeMin: '2026-08-24T00:00:00.000Z', timeMax: '2026-09-07T00:00:00.000Z' }),
    );
    console.log(`events list parameters: ${url.searchParams.toString()}`);
    // singleEvents=true or a recurring session comes back as one master with an
    // RRULE and no instances, and the diff would see one event where the
    // calendar shows six.
    expect(url.searchParams.get('singleEvents')).toBe('true');
    expect(url.searchParams.get('orderBy')).toBe('startTime');
    expect(url.searchParams.get('timeMin')).toBe('2026-08-24T00:00:00.000Z');
    expect(url.searchParams.get('timeMax')).toBe('2026-09-07T00:00:00.000Z');
  });
});
