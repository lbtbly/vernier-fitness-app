import { describe, expect, it } from 'vitest';
import { MAX_PLAN_ROWS, buildDiff } from '@/lib/google/diff';
import { EVENT_ID_MAX, EVENT_ID_MIN, eventIdFor, isLegalEventId } from '@/lib/google/event-id';
import { renderCause } from '@/lib/google/service';

/**
 * F106 and F107. The diff itself: deterministic identifiers so a second apply
 * writes no duplicate, three counts in one order, rows grouped by verb with a
 * cause in plain words, and additions and moves selected by default while
 * removals are not.
 *
 * WHAT WOULD MAKE THIS GO RED. A random event identifier, which would put a
 * second copy of every session in the calendar on the second apply. A removal
 * that arrives ticked, which is a delete the owner opted out of rather than into.
 * A cause that says "rescheduled" instead of naming the block it moved off. A
 * plan whose length is a count of rows rather than a fixed maximum.
 */

const TZ = 'Europe/Paris';

const session = (id: string, at: string, minutes = 45, title = 'Strength') => ({
  id,
  title,
  plannedFor: new Date(at),
  durationMinutes: minutes,
});

const event = (id: string, at: string, minutes = 45, title = 'Training: Strength') => ({
  id,
  sessionId: null,
  title,
  start: new Date(at),
  end: new Date(Date.parse(at) + minutes * 60_000),
});

describe('F106, the deterministic event identifier', () => {
  it('is the same for the same session, for ever, and legal for Google', () => {
    const first = eventIdFor('plan_session_1');
    const second = eventIdFor('plan_session_1');
    const other = eventIdFor('plan_session_2');
    console.log(`plan_session_1: ${first}`);
    console.log(`plan_session_1 again: ${second}`);
    console.log(`plan_session_2: ${other}`);
    expect(second).toBe(first);
    expect(other).not.toBe(first);

    // Google's own constraint on the field: base32hex, lowercase a to v and the
    // digits, 5 to 1024 characters.
    console.log(`length ${first.length}, bounds ${EVENT_ID_MIN} to ${EVENT_ID_MAX}`);
    expect(isLegalEventId(first)).toBe(true);
    expect(first).toMatch(/^[0-9a-v]+$/);
    expect(first.length).toBeGreaterThanOrEqual(EVENT_ID_MIN);
    expect(first.length).toBeLessThanOrEqual(EVENT_ID_MAX);

    // A hundred sessions, a hundred distinct identifiers, so the determinism is
    // not collision by another name.
    const many = new Set(Array.from({ length: 100 }, (_, index) => eventIdFor(`plan_session_${index}`)));
    console.log(`identifiers generated for 100 sessions: ${many.size} distinct`);
    expect(many.size).toBe(100);
    expect([...many].every(isLegalEventId)).toBe(true);
  });

  it('produces no second row when the same plan is re-applied against its own events', () => {
    // The first build: three sessions, an empty calendar, three additions.
    const sessions = [
      session('plan_session_1', '2026-08-24T17:00:00.000Z'),
      session('plan_session_2', '2026-08-26T05:00:00.000Z', 35),
      session('plan_session_3', '2026-08-29T08:00:00.000Z', 50),
    ];
    const first = buildDiff({ sessions, events: [], busy: [], failures: [], timeZone: TZ });
    console.log(`first build: ${first.counts.added} added, ${first.counts.moved} moved, ${first.counts.removed} removed`);
    expect(first.counts).toEqual({ added: 3, moved: 0, removed: 0 });

    // Apply it: the calendar now holds exactly what those rows described.
    const written = first.rows.map((row) => ({
      id: row.eventId,
      sessionId: row.sessionId,
      title: row.title,
      start: row.afterStart!,
      end: row.afterEnd!,
    }));

    // THE SECOND BUILD OVER THE SAME PLAN HAS NOTHING TO DO. That is what makes
    // a second apply write no duplicate: there is no row to apply.
    const second = buildDiff({ sessions, events: written, busy: [], failures: [], timeZone: TZ });
    console.log(`events in the calendar after the first apply: ${written.length}`);
    console.log(`second build: ${second.rows.length} rows, counts ${JSON.stringify(second.counts)}`);
    expect(written.length).toBe(3);
    expect(second.rows).toEqual([]);
    expect(second.counts).toEqual({ added: 0, moved: 0, removed: 0 });
  });
});

describe('F107, the shape of the diff', () => {
  it('counts added, moved and removed, and groups the rows in that order', () => {
    const sessions = [
      // Unchanged: already in the calendar at the right time, so no row at all.
      session('plan_session_1', '2026-08-24T17:00:00.000Z'),
      // New.
      session('plan_session_2', '2026-08-26T05:00:00.000Z', 35),
      // Moved: the calendar holds it an hour earlier than the plan now says.
      session('plan_session_3', '2026-08-29T08:00:00.000Z', 50),
    ];
    const events = [
      event(eventIdFor('plan_session_1'), '2026-08-24T17:00:00.000Z'),
      event(eventIdFor('plan_session_3'), '2026-08-29T07:00:00.000Z', 50),
      // In the calendar and not in the plan any more: a removal.
      event('vrnrleftover0000000', '2026-08-30T09:00:00.000Z', 30, 'Training: Walk'),
    ];

    const diff = buildDiff({ sessions, events, busy: [], failures: [], timeZone: TZ });
    console.log(`counts: ${JSON.stringify(diff.counts)}`);
    console.log(`rows in order: ${diff.rows.map((row) => `${row.verb}:${row.title}`).join(', ')}`);

    expect(diff.counts).toEqual({ added: 1, moved: 1, removed: 1 });
    expect(diff.rows.map((row) => row.verb)).toEqual(['added', 'moved', 'removed']);

    // A move carries both sides, which is what the two columns are drawn from.
    const moved = diff.rows[1];
    expect(moved.beforeStart?.toISOString()).toBe('2026-08-29T07:00:00.000Z');
    expect(moved.afterStart?.toISOString()).toBe('2026-08-29T08:00:00.000Z');
    // An addition has no before and a removal has no after.
    expect(diff.rows[0].beforeStart).toBeNull();
    expect(diff.rows[2].afterStart).toBeNull();
  });

  it('selects additions and moves by default and leaves removals unselected', () => {
    const diff = buildDiff({
      sessions: [session('plan_session_2', '2026-08-26T05:00:00.000Z', 35)],
      events: [event('vrnrleftover0000000', '2026-08-30T09:00:00.000Z', 30, 'Training: Walk')],
      busy: [],
      failures: [],
      timeZone: TZ,
    });
    const defaults = diff.rows.map((row) => `${row.verb}=${row.selected}`);
    console.log(`defaults: ${defaults.join(', ')}`);
    expect(defaults).toEqual(['added=true', 'removed=false']);

    // The property, not the rendering: every removal in any diff starts
    // unselected, so a second surface drawing the same rows cannot get it wrong.
    for (const row of diff.rows) {
      expect(row.selected).toBe(row.verb !== 'removed');
    }
  });

  it('names the cause in plain words, and a move names the block it moved off', () => {
    const busy = [
      { calendarId: 'owner', start: '2026-08-27T16:00:00.000Z', end: '2026-08-27T21:00:00.000Z' },
    ];
    const diff = buildDiff({
      sessions: [session('plan_session_4', '2026-08-27T16:45:00.000Z', 40, 'Intervals')],
      events: [],
      busy,
      failures: [],
      timeZone: TZ,
    });
    const row = diff.rows[0];
    const sentence = renderCause(row.cause, TZ);
    console.log(`cause key: ${row.cause.key}`);
    console.log(`cause: ${sentence}`);

    expect(row.cause.key).toBe('movedBusy');
    // The words the design sheet fixes: the day it moved off, and the hours the
    // calendar shows as busy. Never "rescheduled".
    expect(sentence).toContain('Thursday');
    expect(sentence).toContain('18:00');
    expect(sentence).toContain('23:00');
    expect(sentence).toContain('because');
    expect(sentence.toLowerCase()).not.toContain('rescheduled');
    expect(sentence.length).toBeGreaterThan(40);

    // And a placement that collided with nothing says the plain thing.
    const clear = buildDiff({
      sessions: [session('plan_session_5', '2026-08-25T17:00:00.000Z')],
      events: [],
      busy,
      failures: [],
      timeZone: TZ,
    });
    const plain = renderCause(clear.rows[0].cause, TZ);
    console.log(`cause: ${plain}`);
    expect(plain).toContain('because');
    expect(plain).toContain('19:00');
  });

  it('surfaces a session with nowhere free instead of dropping it', () => {
    const busy = Array.from({ length: 9 }, (_, day) => ({
      calendarId: 'owner',
      start: new Date(Date.parse('2026-08-25T04:00:00.000Z') + day * 86_400_000).toISOString(),
      end: new Date(Date.parse('2026-08-25T21:00:00.000Z') + day * 86_400_000).toISOString(),
    }));
    const diff = buildDiff({
      sessions: [session('plan_session_6', '2026-08-25T17:00:00.000Z')],
      events: [],
      busy,
      failures: [],
      timeZone: TZ,
    });
    console.log(`rows: ${diff.rows.length}, unplaceable: ${diff.unplaceable.length}`);
    console.log(`unplaceable: ${JSON.stringify(diff.unplaceable[0]?.title)}`);
    // No row, because nothing can be written. And it is not silence: the session
    // is carried out of the diff so the screen can say why it is not there.
    expect(diff.rows).toEqual([]);
    expect(diff.unplaceable.length).toBe(1);
    expect(diff.unplaceable[0].sessionId).toBe('plan_session_6');
  });

  it('has a maximum fixed by construction rather than by how full the week is', () => {
    // A fixed budget binds only over a closed set. Forty leftover events in the
    // window produce a plan of twenty rows and a stated remainder, so the
    // largest diff this screen can draw is a constant.
    const events = Array.from({ length: 40 }, (_, index) =>
      event(`vrnrleftover${String(index).padStart(7, '0')}`, `2026-08-25T0${index % 9}:00:00.000Z`, 30),
    );
    const diff = buildDiff({ sessions: [], events, busy: [], failures: [], timeZone: TZ });
    console.log(`events in the window: ${events.length}`);
    console.log(`rows on the plan: ${diff.rows.length}, held back: ${diff.heldBack}, total: ${diff.totalChanges}`);
    expect(diff.rows.length).toBe(MAX_PLAN_ROWS);
    expect(diff.totalChanges).toBe(40);
    expect(diff.heldBack).toBe(20);
  });
});
