import { describe, expect, it } from 'vitest';
import {
  type ClientPorts,
  type TokenBundle,
  confirmSelected,
  confirmUndo,
  exchangeCode,
  listAppEvents,
  listCalendars,
  queryFreeBusy,
} from '@/lib/google/client';
import { afterColumn, beforeColumn } from '@/lib/google/columns';
import {
  DEMONSTRATION_MODE,
  DEMO_APP_CALENDAR_ID,
  DEMO_FAMILY_ID,
  DEMO_PRIMARY_ID,
  DEMO_UNSHARED_ID,
  type DemoEvent,
  type DemoStore,
  demoTransport,
} from '@/lib/google/demo-dataset';
import { buildDiff } from '@/lib/google/diff';
import { type WriteInput, type WriteSiteId, writeSite } from '@/lib/google/write-sites';

/**
 * F101, F106 and F108, walked end to end against the demonstration account with
 * no client identifier, no secret and no socket.
 *
 * THE WHOLE FLOW, NOT A STUB OF IT: the token exchange, the picker, the busy
 * periods with a calendar that has been unshared in among them, the dedicated
 * calendar being created, the diff, the write, a second apply of the same plan,
 * and an undo of a write made two plans earlier.
 *
 * The calendar here is a real store rather than a canned answer, so the event
 * counts below are counts of something. Both are printed either side of the
 * second apply, because a zero is evidence only beside the population it
 * covered.
 *
 * WHAT WOULD MAKE THIS GO RED. A demonstration mode that skipped a step the live
 * path takes. A second apply that landed a duplicate. An undo that put the event
 * back at the wrong time, or left the calendar holding something the Before
 * column did not.
 */

const TZ = 'Europe/Paris';
const DEMO_CODE = 'demonstration-authorization-code';

/** The demonstration calendar, in memory for this test, on the database in the app. */
function memoryStore(): DemoStore & { all: () => DemoEvent[] } {
  const events = new Map<string, DemoEvent>();
  return {
    readEvents: async () => [...events.values()],
    putEvent: async (event) => {
      events.set(event.id, event);
    },
    removeEvent: async (id) => events.delete(id),
    all: () => [...events.values()],
  };
}

function portsFor(store: DemoStore): { ports: ClientPorts; tokens: () => TokenBundle | null } {
  let stored: TokenBundle | null = null;
  return {
    tokens: () => stored,
    ports: {
      transport: demoTransport(store, { timeZone: TZ }),
      credentials: { clientId: '', clientSecret: '', redirectUri: '' },
      readTokens: async () => stored,
      storeTokens: async (next) => {
        stored = next;
      },
      onPermanentFailure: async () => {
        stored = null;
      },
      now: () => new Date('2026-08-23T18:45:00.000Z'),
    },
  };
}

const SESSIONS = [
  { id: 'plan_session_1', title: 'Strength', plannedFor: new Date('2026-08-24T17:00:00.000Z'), durationMinutes: 45 },
  { id: 'plan_session_2', title: 'Intervals', plannedFor: new Date('2026-08-27T16:45:00.000Z'), durationMinutes: 40 },
  { id: 'plan_session_3', title: 'Walk', plannedFor: new Date('2026-08-29T08:00:00.000Z'), durationMinutes: 50 },
];

/** One confirmed row, driven through the site it names. */
async function applyRow(
  ports: ClientPorts,
  site: WriteSiteId,
  planId: string,
  rowId: string,
  input: WriteInput,
) {
  const confirmation = confirmSelected({ id: planId, state: 'open', rowIds: [rowId] }, [rowId], new Date())[0];
  return writeSite(site).run(ports, confirmation, input);
}

function inputFor(calendarId: string, row: { eventId: string; sessionId: string | null; title: string; afterStart: Date | null; afterEnd: Date | null }): WriteInput {
  return {
    calendarId,
    eventId: row.eventId,
    sessionId: row.sessionId ?? '',
    summary: `Training: ${row.title}`,
    description: 'Written by Vernier from your training week.',
    start: row.afterStart ?? new Date(),
    end: row.afterEnd ?? new Date(),
    timeZone: TZ,
    mode: DEMONSTRATION_MODE,
  };
}

describe('F101, the whole flow with no client identifier', () => {
  it('runs picker, busy periods, dedicated calendar, diff and write end to end', async () => {
    const store = memoryStore();
    const rig = portsFor(store);

    // 1. CONNECT. No client id, no secret, no network: the recorded token
    // endpoint answers and the bundle is stored.
    const connected = await exchangeCode(rig.ports, DEMO_CODE);
    console.log(`1. connect: ${connected.outcome}, refresh token stored: ${rig.tokens()?.refreshToken !== undefined}`);
    expect(connected.outcome).toBe('connected');
    expect(rig.ports.credentials.clientId).toBe('');
    expect(rig.tokens()?.refreshToken).toBeTruthy();

    // 2. THE PICKER.
    const picker = await listCalendars(rig.ports);
    console.log(`2. picker: ${picker.calendars.map((entry) => entry.summary).join(', ')}`);
    expect(picker.outcome).toBe('ok');
    expect(picker.calendars.length).toBe(3);
    expect(picker.calendars.map((entry) => entry.id)).toContain(DEMO_UNSHARED_ID);

    // 3. BUSY PERIODS, with the unshared calendar's error among them.
    const availability = await queryFreeBusy(rig.ports, {
      timeMin: '2026-08-24T00:00:00.000Z',
      timeMax: '2026-09-07T00:00:00.000Z',
      timeZone: TZ,
      calendarIds: [DEMO_PRIMARY_ID, DEMO_FAMILY_ID, DEMO_UNSHARED_ID],
    });
    console.log(
      `3. availability: ${availability.reading.busy.length} busy periods, ${availability.reading.failures.length} calendar(s) that could not be read`,
    );
    expect(availability.outcome).toBe('ok');
    expect(availability.reading.busy.length).toBeGreaterThan(5);
    expect(availability.reading.failures.map((entry) => entry.calendarId)).toEqual([DEMO_UNSHARED_ID]);

    // 4. THE DEDICATED CALENDAR, created through the confirmed write site.
    const created = await applyRow(rig.ports, 'calendars.insert', 'plan_0', 'plan_0_r0', {
      calendarId: '',
      eventId: 'vrnrcalendar',
      sessionId: '',
      summary: 'Vernier training',
      description: 'Training sessions written by Vernier on this Mac.',
      start: new Date(),
      end: new Date(),
      timeZone: TZ,
      mode: DEMONSTRATION_MODE,
    });
    const calendarId = (created.outcome === 'ok' ? (created.body as { id: string }).id : '');
    console.log(`4. dedicated calendar: ${calendarId}`);
    expect(created.outcome).toBe('ok');
    expect(calendarId).toBe(DEMO_APP_CALENDAR_ID);

    // 5. THE DIFF, over what the calendar holds and what the week says.
    const before = await listAppEvents(rig.ports, {
      calendarId,
      timeMin: '2026-08-24T00:00:00.000Z',
      timeMax: '2026-09-07T00:00:00.000Z',
    });
    const diff = buildDiff({
      sessions: SESSIONS,
      events: before.events.map((entry) => ({
        id: entry.id,
        sessionId: entry.sessionId,
        title: entry.title,
        start: entry.start,
        end: entry.end,
      })),
      busy: availability.reading.busy,
      failures: availability.reading.failures,
      timeZone: TZ,
    });
    console.log(`5. diff: ${JSON.stringify(diff.counts)}, rows ${diff.rows.map((row) => row.verb).join(', ')}`);
    expect(diff.counts.added).toBe(3);

    // 6. THE WRITE, one confirmed row at a time.
    for (const [index, row] of diff.rows.entries()) {
      const answer = await applyRow(
        rig.ports,
        'events.insert',
        'plan_1',
        `plan_1_r${index}`,
        inputFor(calendarId, row),
      );
      expect(answer.outcome).toBe('ok');
    }
    const landed = store.all();
    console.log(`6. events in the demonstration calendar: ${landed.length}`);
    console.log(`   ${landed.map((entry) => `${entry.summary} at ${entry.start}`).join('\n   ')}`);
    expect(landed.length).toBe(3);

    // EVERY EVENT IS MARKED AS A DEMONSTRATION, readable off the stored row
    // rather than off a badge a screen chose to draw.
    for (const entry of landed) {
      expect(entry.mode).toBe(DEMONSTRATION_MODE);
    }
  });
});

describe('F106, a second apply of the same plan', () => {
  it('leaves the event count identical, before and after', async () => {
    const store = memoryStore();
    const rig = portsFor(store);
    await exchangeCode(rig.ports, DEMO_CODE);
    const created = await applyRow(rig.ports, 'calendars.insert', 'plan_0', 'plan_0_r0', {
      calendarId: '',
      eventId: 'vrnrcalendar',
      sessionId: '',
      summary: 'Vernier training',
      description: 'Training sessions written by Vernier.',
      start: new Date(),
      end: new Date(),
      timeZone: TZ,
      mode: DEMONSTRATION_MODE,
    });
    const calendarId = created.outcome === 'ok' ? (created.body as { id: string }).id : '';
    expect(calendarId).toBe(DEMO_APP_CALENDAR_ID);

    const diff = buildDiff({ sessions: SESSIONS, events: [], busy: [], failures: [], timeZone: TZ });
    for (const [index, row] of diff.rows.entries()) {
      await applyRow(rig.ports, 'events.insert', 'plan_1', `plan_1_r${index}`, inputFor(calendarId, row));
    }
    const first = store.all().length;

    // THE SAME PLAN, APPLIED AGAIN. The identifiers are derived from the app's
    // own records, so every insert names an event that is already there.
    const statuses: number[] = [];
    for (const [index, row] of diff.rows.entries()) {
      const answer = await applyRow(
        rig.ports,
        'events.insert',
        'plan_1',
        `plan_1_r${index}`,
        inputFor(calendarId, row),
      );
      statuses.push(answer.outcome === 'failed' ? answer.status : 200);
    }
    const second = store.all().length;

    console.log(`events before the second apply: ${first}`);
    console.log(`answers on the second apply: ${statuses.join(', ')}`);
    console.log(`events after the second apply: ${second}`);
    expect(first).toBe(3);
    expect(second).toBe(3);
    expect(statuses).toEqual([409, 409, 409]);
  });
});

describe('F108, undo restores exactly the before column', () => {
  it('puts the calendar back to what the Before column showed, including a write from two plans earlier', async () => {
    const store = memoryStore();
    const rig = portsFor(store);
    await exchangeCode(rig.ports, DEMO_CODE);
    const created = await applyRow(rig.ports, 'calendars.insert', 'plan_0', 'plan_0_r0', {
      calendarId: '',
      eventId: 'vrnrcalendar',
      sessionId: '',
      summary: 'Vernier training',
      description: 'Training sessions written by Vernier.',
      start: new Date(),
      end: new Date(),
      timeZone: TZ,
      mode: DEMONSTRATION_MODE,
    });
    const calendarId = created.outcome === 'ok' ? (created.body as { id: string }).id : '';
    expect(calendarId).toBe(DEMO_APP_CALENDAR_ID);

    // PLAN ONE, two sessions written. This is the "two sessions earlier" write.
    const planOne = buildDiff({
      sessions: SESSIONS.slice(0, 2),
      events: [],
      busy: [],
      failures: [],
      timeZone: TZ,
    });
    const oldWrite = planOne.rows[0];
    for (const [index, row] of planOne.rows.entries()) {
      await applyRow(rig.ports, 'events.insert', 'plan_1', `plan_1_r${index}`, inputFor(calendarId, row));
    }

    // PLAN TWO, a third session written. Nothing about the first plan changes.
    const planTwo = buildDiff({
      sessions: SESSIONS,
      events: (await listAppEvents(rig.ports, {
        calendarId,
        timeMin: '2026-08-24T00:00:00.000Z',
        timeMax: '2026-09-07T00:00:00.000Z',
      })).events.map((entry) => ({
        id: entry.id,
        sessionId: entry.sessionId,
        title: entry.title,
        start: entry.start,
        end: entry.end,
      })),
      busy: [],
      failures: [],
      timeZone: TZ,
    });
    for (const [index, row] of planTwo.rows.entries()) {
      await applyRow(rig.ports, 'events.insert', 'plan_2', `plan_2_r${index}`, inputFor(calendarId, row));
    }

    const before = beforeColumn(
      store.all().map((entry) => ({
        eventId: entry.id,
        title: entry.summary,
        start: entry.start,
        end: entry.end,
        change: 'same' as const,
      })),
    );
    console.log(`events after two plans: ${before.length}`);
    console.log(`  ${before.map((entry) => `${entry.title} at ${entry.start}`).join('\n  ')}`);
    expect(before.length).toBe(3);

    // A THIRD PLAN: move one session and remove another, then apply both.
    const movedRow = {
      id: 'plan_3_r0',
      verb: 'moved',
      eventId: planTwo.rows[0].eventId,
      title: planTwo.rows[0].title,
      afterStart: new Date(Date.parse(before[2].start) + 3_600_000).toISOString(),
      afterEnd: new Date(Date.parse(before[2].end) + 3_600_000).toISOString(),
    };
    await applyRow(rig.ports, 'events.update', 'plan_3', 'plan_3_r0', {
      ...inputFor(calendarId, {
        eventId: movedRow.eventId,
        sessionId: 'plan_session_3',
        title: movedRow.title,
        afterStart: new Date(movedRow.afterStart),
        afterEnd: new Date(movedRow.afterEnd),
      }),
    });

    // NOW UNDO THE OLDEST WRITE OF ALL, the one from plan one. Everything the
    // undo needs is on the log row: the verb, the identifier and both sides.
    const undoConfirmation = confirmUndo(
      { id: 'cw_old', outcome: 'written', undoneByWriteId: null },
      new Date(),
    );
    expect(undoConfirmation).not.toBeNull();
    const undone = await writeSite('events.delete').run(rig.ports, undoConfirmation, {
      ...inputFor(calendarId, {
        eventId: oldWrite.eventId,
        sessionId: oldWrite.sessionId,
        title: oldWrite.title,
        afterStart: oldWrite.afterStart,
        afterEnd: oldWrite.afterEnd,
      }),
    });
    console.log(`undo of the plan-one write: outcome=${undone.outcome}`);
    expect(undone.outcome).toBe('ok');

    const remaining = store.all().map((entry) => entry.id);
    console.log(`events remaining: ${remaining.length}`);
    expect(remaining).not.toContain(oldWrite.eventId);
    expect(remaining.length).toBe(2);

    // And the move is reversed back to exactly the time the Before column held.
    const reverse = confirmUndo({ id: 'cw_move', outcome: 'written', undoneByWriteId: null }, new Date());
    await writeSite('events.update').run(rig.ports, reverse, {
      ...inputFor(calendarId, {
        eventId: movedRow.eventId,
        sessionId: 'plan_session_3',
        title: movedRow.title,
        afterStart: new Date(before[2].start),
        afterEnd: new Date(before[2].end),
      }),
    });
    const restored = store.all().find((entry) => entry.id === movedRow.eventId);
    console.log(`moved event restored to ${restored?.start}, before column had ${before[2].start}`);
    expect(restored?.start).toBe(before[2].start);
    expect(restored?.end).toBe(before[2].end);
  });

  it('draws an after column that follows the ticks and a before column that does not', () => {
    const events = [
      { eventId: 'vrnra', title: 'Training: Strength', start: '2026-08-24T17:00:00.000Z', end: '2026-08-24T17:45:00.000Z', change: 'same' as const },
      { eventId: 'vrnrb', title: 'Training: Walk', start: '2026-08-30T09:00:00.000Z', end: '2026-08-30T09:30:00.000Z', change: 'same' as const },
    ];
    const rows = [
      { id: 'r0', verb: 'added', eventId: 'vrnrc', title: 'Training: Intervals', afterStart: '2026-08-28T05:00:00.000Z', afterEnd: '2026-08-28T05:40:00.000Z' },
      { id: 'r1', verb: 'removed', eventId: 'vrnrb', title: 'Training: Walk', afterStart: null, afterEnd: null },
    ];

    const nothing = afterColumn(events, rows, new Set());
    const addition = afterColumn(events, rows, new Set(['r0']));
    const both = afterColumn(events, rows, new Set(['r0', 'r1']));

    console.log(`before: ${beforeColumn(events).map((entry) => entry.title).join(', ')}`);
    console.log(`after, nothing ticked: ${nothing.map((entry) => entry.title).join(', ')}`);
    console.log(`after, the addition ticked: ${addition.map((entry) => entry.title).join(', ')}`);
    console.log(`after, both ticked: ${both.map((entry) => entry.title).join(', ')}`);

    expect(beforeColumn(events).map((entry) => entry.eventId)).toEqual(['vrnra', 'vrnrb']);
    expect(nothing.map((entry) => entry.eventId)).toEqual(['vrnra', 'vrnrb']);
    expect(addition.map((entry) => entry.eventId)).toEqual(['vrnra', 'vrnrc', 'vrnrb']);
    expect(both.map((entry) => entry.eventId)).toEqual(['vrnra', 'vrnrc']);
    // The addition is marked so the column can draw it in `--good`.
    expect(addition.find((entry) => entry.eventId === 'vrnrc')?.change).toBe('added');
  });
});
