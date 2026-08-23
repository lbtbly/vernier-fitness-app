import { instantOnDay, localDayKey } from '@/lib/local-time';

/**
 * Availability, read from `freeBusy.query` and from nothing else.
 *
 * THE PER-CALENDAR ERROR IS THE WHOLE OF THIS FILE'S CARE. A `freeBusy` answer
 * carries one entry per calendar asked about, and a calendar that has been
 * unshared, deleted or refused comes back with an `errors` array AND AN EMPTY
 * `busy` LIST. An empty busy list is indistinguishable from a free day unless
 * the errors are read, so a reader that ignores them schedules a session over a
 * real meeting and reports the calendar as clear while doing it. That is a check
 * that passes by not checking, and this run has found seven of those.
 *
 * So `readFreeBusy` returns the errors beside the intervals, every caller
 * carries them, and the screen prints them. Nothing in this file ever answers
 * "free" for a calendar that failed: it answers "unknown", which is a different
 * word and a different sentence on the diff.
 */

export type BusyInterval = { calendarId: string; start: string; end: string };

/** One calendar the query could not answer for, with Google's own reason token. */
export type CalendarFailure = { calendarId: string; reason: string; detail: string };

export type FreeBusyReading = {
  busy: BusyInterval[];
  failures: CalendarFailure[];
  /** Every calendar the answer carried an entry for, failed or not. */
  answeredFor: string[];
};

/**
 * The answer, taken apart.
 *
 * `groups` carries errors too, for a calendar group that could not be expanded,
 * and they are surfaced under the group key for the same reason: a group that
 * failed to expand is not a group with nothing in it.
 */
export function readFreeBusy(body: unknown): FreeBusyReading {
  const busy: BusyInterval[] = [];
  const failures: CalendarFailure[] = [];
  const answeredFor: string[] = [];
  if (!body || typeof body !== 'object') return { busy, failures, answeredFor };

  const record = body as Record<string, unknown>;
  for (const key of ['calendars', 'groups']) {
    const section = record[key];
    if (!section || typeof section !== 'object') continue;
    for (const [calendarId, raw] of Object.entries(section as Record<string, unknown>)) {
      answeredFor.push(calendarId);
      if (!raw || typeof raw !== 'object') continue;
      const entry = raw as Record<string, unknown>;

      const errors = Array.isArray(entry.errors) ? entry.errors : [];
      for (const error of errors) {
        const shape = (error ?? {}) as Record<string, unknown>;
        failures.push({
          calendarId,
          reason: typeof shape.reason === 'string' ? shape.reason : 'unknown',
          detail: typeof shape.domain === 'string' ? shape.domain : '',
        });
      }

      const periods = Array.isArray(entry.busy) ? entry.busy : [];
      for (const period of periods) {
        const shape = (period ?? {}) as Record<string, unknown>;
        if (typeof shape.start !== 'string' || typeof shape.end !== 'string') continue;
        busy.push({ calendarId, start: shape.start, end: shape.end });
      }
    }
  }

  return { busy, failures, answeredFor };
}

/** Do two half-open intervals overlap. Touching at an edge does not. */
export function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** The busy intervals a proposed slot collides with, in the order they start. */
export function collisionsWith(
  start: Date,
  minutes: number,
  busy: BusyInterval[],
): BusyInterval[] {
  const end = new Date(start.getTime() + minutes * 60_000);
  return busy
    .filter((interval) =>
      overlaps(start, end, new Date(interval.start), new Date(interval.end)),
    )
    .sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
}

/**
 * The hours a session may be placed in, local time.
 *
 * Not a preference and not a guess at the owner's day: it is the bound that
 * makes the search terminate and makes the largest diff a closed set. A slot is
 * looked for from the planned time forward inside the same day, then at the same
 * local time on each following day, and never before 07:00 or ending after
 * 22:00.
 */
export const EARLIEST_HOUR = 7;
export const LATEST_END_HOUR = 22;

/** Fifteen minutes, so a moved session lands on a time a person would write down. */
export const SLOT_STEP_MINUTES = 15;

/** How many days forward the search may walk before it gives up and says so. */
export const SEARCH_DAYS = 7;

export type SlotSearch =
  | { kind: 'kept'; start: Date }
  | { kind: 'moved'; start: Date; blockedBy: BusyInterval }
  | { kind: 'no_slot'; blockedBy: BusyInterval };

/**
 * Where a session of this length can actually go.
 *
 * Bounded by construction: at most `SEARCH_DAYS` days, at most
 * `(LATEST_END_HOUR - EARLIEST_HOUR) * 60 / SLOT_STEP_MINUTES` candidates a day,
 * so the walk is 420 comparisons at worst and cannot loop. When nothing is
 * free it says so rather than returning the busy slot with a shrug.
 */
export function findSlot(
  desired: Date,
  minutes: number,
  busy: BusyInterval[],
  timeZone: string,
): SlotSearch {
  const first = collisionsWith(desired, minutes, busy);
  if (first.length === 0) return { kind: 'kept', start: desired };
  const blockedBy = first[0];

  const startDay = localDayKey(desired, timeZone);
  for (let dayOffset = 0; dayOffset < SEARCH_DAYS; dayOffset += 1) {
    const dayKey = dayOffset === 0 ? startDay : addDays(startDay, dayOffset);
    const dayStart = instantOnDay(dayKey, EARLIEST_HOUR, 0, timeZone);
    const dayLast = instantOnDay(dayKey, LATEST_END_HOUR, 0, timeZone).getTime() - minutes * 60_000;

    // On the first day the search starts at the planned time, because moving a
    // session earlier than the owner asked for is a change he did not request.
    let cursor = dayOffset === 0 ? Math.max(desired.getTime(), dayStart.getTime()) : dayStart.getTime();
    cursor = roundUpToStep(cursor);

    while (cursor <= dayLast) {
      const candidate = new Date(cursor);
      if (collisionsWith(candidate, minutes, busy).length === 0) {
        if (candidate.getTime() === desired.getTime()) return { kind: 'kept', start: candidate };
        return { kind: 'moved', start: candidate, blockedBy };
      }
      cursor += SLOT_STEP_MINUTES * 60_000;
    }
  }

  return { kind: 'no_slot', blockedBy };
}

function roundUpToStep(instant: number): number {
  const step = SLOT_STEP_MINUTES * 60_000;
  return Math.ceil(instant / step) * step;
}

function addDays(dayKey: string, days: number): string {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
