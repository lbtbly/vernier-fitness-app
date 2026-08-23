import { type BusyInterval, type CalendarFailure, findSlot } from '@/lib/google/availability';
import { eventIdFor } from '@/lib/google/event-id';

/**
 * The diff, worked out before anything is written and rendered before anything
 * is confirmed.
 *
 * THE PANEL NAMED THIS AS THE RISK CONTROL AND A SUMMARY SENTENCE FAILS THE TEST
 * IT EXISTS TO PASS. "3 changes will be applied" is a sentence the owner cannot
 * check. What he can check is three counts, two columns and a row per change
 * that names the change and its cause in plain words, and that is what this
 * module produces: rows, in the order added, moved, removed, each carrying the
 * before, the after, and the reason it is there.
 *
 * NOTHING HERE WRITES AND NOTHING HERE CAN. It is pure: sessions in, events in,
 * busy intervals in, rows out. The write sites are in
 * `src/lib/google/write-sites.ts` and every one of them refuses to run without a
 * confirmation this module cannot mint.
 *
 * THE CAUSE IS A KEY AND ITS DATA, never a sentence, exactly as slice 8's week
 * proposer does it. This file is in the shipped tree, so a sentence written here
 * would be product copy with no catalogue key. The service renders it from
 * `strings.calendar.causes` and freezes the rendered line on the plan row, so a
 * later rule change never rewrites what the owner was told at the time.
 */

export type DiffVerb = 'added' | 'moved' | 'removed';

export type CauseKey =
  | 'clear'
  | 'clearUnverified'
  | 'movedBusy'
  | 'movedInPlan'
  | 'sessionGone';

export type Cause = { key: CauseKey; params: Record<string, string | number> };

export type PlannedSessionInput = {
  id: string;
  title: string;
  plannedFor: Date;
  durationMinutes: number;
};

export type CalendarEventInput = {
  /** The identifier in the calendar, which for anything this app wrote is derived. */
  id: string;
  /** The planned session stamped on the event in `extendedProperties.private`. */
  sessionId: string | null;
  title: string;
  start: Date;
  end: Date;
};

export type DiffRow = {
  /** Stable for the same change, so a second build of the same plan reads the same. */
  id: string;
  verb: DiffVerb;
  sessionId: string | null;
  eventId: string;
  title: string;
  beforeStart: Date | null;
  beforeEnd: Date | null;
  afterStart: Date | null;
  afterEnd: Date | null;
  cause: Cause;
  /**
   * ADDITIONS AND MOVES SELECTED, REMOVALS UNSELECTED. You opt in to a delete,
   * never out of it. It is a property of the row rather than a rule the screen
   * remembers to apply, so a second surface rendering the same rows cannot get
   * it wrong.
   */
  selected: boolean;
};

export type UnplaceableSession = {
  sessionId: string;
  title: string;
  plannedFor: Date;
  blockedFrom: Date;
  blockedTo: Date;
};

export type DiffCounts = { added: number; moved: number; removed: number };

export type CalendarDiff = {
  counts: DiffCounts;
  rows: DiffRow[];
  /** Sessions with nowhere free inside the search window. Surfaced, never silently dropped. */
  unplaceable: UnplaceableSession[];
  /** Calendars the free-busy query could not answer for. Surfaced, never read as free. */
  failures: CalendarFailure[];
  /** True when at least one calendar failed, so no placement here is confirmed clear. */
  availabilityIncomplete: boolean;
  /** How many changes the window really held, before the cap below. */
  totalChanges: number;
  /** Changes this plan is not carrying because the plan is capped. */
  heldBack: number;
};

/**
 * The most rows one confirm screen will ever carry.
 *
 * A fixed budget binds only over a closed set, so the set is closed here rather
 * than left to a count of rows: a plan is at most this many changes, whatever
 * the window holds, and the remainder is stated on screen and offered on the
 * next build. Twenty is four times the largest week the proposer can produce
 * (five sessions) and still fits the four-second read the rubric measures.
 */
export const MAX_PLAN_ROWS = 20;

/** A minute of slack, so a stored second or a millisecond is not a "move". */
const SAME_TIME_MS = 60_000;

export function buildDiff(input: {
  sessions: PlannedSessionInput[];
  events: CalendarEventInput[];
  busy: BusyInterval[];
  failures: CalendarFailure[];
  timeZone: string;
}): CalendarDiff {
  const availabilityIncomplete = input.failures.length > 0;
  const added: DiffRow[] = [];
  const moved: DiffRow[] = [];
  const removed: DiffRow[] = [];
  const unplaceable: UnplaceableSession[] = [];

  const byEventId = new Map(input.events.map((event) => [event.id, event]));
  const claimed = new Set<string>();

  const sessions = [...input.sessions].sort(
    (left, right) => left.plannedFor.getTime() - right.plannedFor.getTime(),
  );

  for (const session of sessions) {
    const eventId = eventIdFor(session.id);
    const existing = byEventId.get(eventId) ?? null;
    if (existing) claimed.add(existing.id);

    const slot = findSlot(session.plannedFor, session.durationMinutes, input.busy, input.timeZone);
    if (slot.kind === 'no_slot') {
      unplaceable.push({
        sessionId: session.id,
        title: session.title,
        plannedFor: session.plannedFor,
        blockedFrom: new Date(slot.blockedBy.start),
        blockedTo: new Date(slot.blockedBy.end),
      });
      continue;
    }

    const start = slot.start;
    const end = new Date(start.getTime() + session.durationMinutes * 60_000);

    const cause: Cause =
      slot.kind === 'moved'
        ? {
            key: 'movedBusy',
            params: {
              from: slot.blockedBy.start,
              to: slot.blockedBy.end,
              was: session.plannedFor.toISOString(),
            },
          }
        : availabilityIncomplete
          ? { key: 'clearUnverified', params: { at: start.toISOString(), calendars: input.failures.length } }
          : { key: 'clear', params: { at: start.toISOString() } };

    if (!existing) {
      added.push({
        id: `added:${eventId}`,
        verb: 'added',
        sessionId: session.id,
        eventId,
        title: session.title,
        beforeStart: null,
        beforeEnd: null,
        afterStart: start,
        afterEnd: end,
        cause,
        selected: true,
      });
      continue;
    }

    const sameTime = Math.abs(existing.start.getTime() - start.getTime()) < SAME_TIME_MS;
    const sameLength = Math.abs(existing.end.getTime() - end.getTime()) < SAME_TIME_MS;
    if (sameTime && sameLength) continue;

    moved.push({
      id: `moved:${eventId}`,
      verb: 'moved',
      sessionId: session.id,
      eventId,
      title: session.title,
      beforeStart: existing.start,
      beforeEnd: existing.end,
      afterStart: start,
      afterEnd: end,
      // A session the owner himself moved in the plan is not a session the
      // calendar pushed. Two different facts, two different sentences.
      cause: slot.kind === 'moved' ? cause : { key: 'movedInPlan', params: { at: start.toISOString() } },
      selected: true,
    });
  }

  for (const event of input.events) {
    if (claimed.has(event.id)) continue;
    removed.push({
      id: `removed:${event.id}`,
      verb: 'removed',
      sessionId: event.sessionId,
      eventId: event.id,
      title: event.title,
      beforeStart: event.start,
      beforeEnd: event.end,
      afterStart: null,
      afterEnd: null,
      cause: { key: 'sessionGone', params: { at: event.start.toISOString() } },
      // UNSELECTED. A delete is opted into.
      selected: false,
    });
  }

  const byStart = (left: DiffRow, right: DiffRow) =>
    (left.afterStart ?? left.beforeStart!).getTime() - (right.afterStart ?? right.beforeStart!).getTime();
  added.sort(byStart);
  moved.sort(byStart);
  removed.sort(byStart);

  const ordered = [...added, ...moved, ...removed];
  const rows = ordered.slice(0, MAX_PLAN_ROWS);

  return {
    counts: {
      added: rows.filter((row) => row.verb === 'added').length,
      moved: rows.filter((row) => row.verb === 'moved').length,
      removed: rows.filter((row) => row.verb === 'removed').length,
    },
    rows,
    unplaceable,
    failures: input.failures,
    availabilityIncomplete,
    totalChanges: ordered.length,
    heldBack: Math.max(0, ordered.length - rows.length),
  };
}

/**
 * The dedicated calendar as it stands, and as it would stand if these rows
 * applied. Two columns, which is what F107 asks for and what a summary sentence
 * cannot give.
 *
 * It takes the SELECTED set as an argument rather than reading `row.selected`,
 * because the after column has to follow the owner's ticks as he makes them.
 */
export type ColumnEntry = {
  eventId: string;
  title: string;
  start: Date;
  end: Date;
  /** How this line differs from the other column, so the screen can style it. */
  change: 'same' | 'added' | 'removed' | 'movedFrom' | 'movedTo';
};

export function beforeColumn(events: CalendarEventInput[]): ColumnEntry[] {
  return [...events]
    .sort((left, right) => left.start.getTime() - right.start.getTime())
    .map((event) => ({
      eventId: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      change: 'same' as const,
    }));
}

export function afterColumn(
  events: CalendarEventInput[],
  rows: DiffRow[],
  selected: ReadonlySet<string>,
): ColumnEntry[] {
  const entries = new Map<string, ColumnEntry>();
  for (const event of events) {
    entries.set(event.id, {
      eventId: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      change: 'same',
    });
  }

  for (const row of rows) {
    if (!selected.has(row.id)) continue;
    if (row.verb === 'added' && row.afterStart && row.afterEnd) {
      entries.set(row.eventId, {
        eventId: row.eventId,
        title: row.title,
        start: row.afterStart,
        end: row.afterEnd,
        change: 'added',
      });
    } else if (row.verb === 'moved' && row.afterStart && row.afterEnd) {
      entries.set(row.eventId, {
        eventId: row.eventId,
        title: row.title,
        start: row.afterStart,
        end: row.afterEnd,
        change: 'movedTo',
      });
    } else if (row.verb === 'removed') {
      entries.delete(row.eventId);
    }
  }

  return [...entries.values()].sort((left, right) => left.start.getTime() - right.start.getTime());
}

/** How many changes will apply, which is the number the sticky footer states. */
export function selectedCount(rows: DiffRow[], selected: ReadonlySet<string>): number {
  return rows.filter((row) => selected.has(row.id)).length;
}
