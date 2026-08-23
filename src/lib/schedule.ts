import { dayAfter, instantOnDay, localDayKey, weekdayIndex } from '@/lib/local-time';

/**
 * Which period a scheduled job is in, computed on the app's own calendar.
 *
 * THE WHOLE OF THIS FILE IS ONE RULE: a period is named by a LOCAL calendar day
 * and a LOCAL wall time, never by arithmetic on an instant. On the last Sunday
 * in October the Paris day is twenty-five hours long, so a weekly bucket
 * computed by flooring epoch milliseconds moves its boundary by an hour that
 * night and can hand two different keys to two ticks of the same Sunday
 * evening. Two keys is two ledger rows, two ledger rows is two claims, and two
 * claims is the owner getting his week planned twice. The last Sunday in March
 * is the mirror: a twenty-three hour day, and a bucket that skips.
 *
 * `2026-10-25T20:00` is the key for every instant from that Sunday's 20:00
 * until the next Sunday's 20:00, whatever the offset did in between, because
 * the key is read off the calendar and the calendar does not care.
 *
 * Dependency free and pure, so the unit suite grades the arithmetic across the
 * actual clock-change dates with no clock, no database and no cron of its own.
 */

export type WeeklySchedule = {
  /** Monday is 0 and Sunday is 6, the same index `weekdayIndex` returns. */
  weekday: number;
  hour: number;
  minute: number;
};

/** Sunday at 20:00 Europe/Paris. The Sunday run. */
export const WEEKLY_REVIEW_SCHEDULE: WeeklySchedule = { weekday: 6, hour: 20, minute: 0 };

/** `20:00` from an hour and a minute, zero padded, which is what a key carries. */
function wallTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** The local wall clock at an instant, as `HH:MM` in 24 hours. */
export function localWallTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(at);
}

/**
 * The key of the period an instant falls in: the most recent occurrence of the
 * scheduled weekday and wall time at or before it.
 *
 * Read entirely off the local calendar. The day the instant falls on, the index
 * of that day in the local week, and the local wall clock, then whole days of
 * label arithmetic backwards. Nothing here subtracts milliseconds from an
 * instant, which is the operation that breaks on a twenty-five hour day.
 */
export function weeklyPeriodKey(at: Date, schedule: WeeklySchedule, timeZone: string): string {
  const today = localDayKey(at, timeZone);
  const index = weekdayIndex(at, timeZone);
  let back = (index - schedule.weekday + 7) % 7;
  if (back === 0 && localWallTime(at, timeZone) < wallTime(schedule.hour, schedule.minute)) {
    // The scheduled weekday, but the hour has not come round yet. This instant
    // still belongs to last week's period.
    back = 7;
  }
  return `${dayAfter(today, -back)}T${wallTime(schedule.hour, schedule.minute)}`;
}

/** The key of the period after a given one. Whole days on the calendar, again. */
export function nextWeeklyPeriodKey(key: string, schedule: WeeklySchedule): string {
  return `${dayAfter(key.slice(0, 10), 7)}T${wallTime(schedule.hour, schedule.minute)}`;
}

/**
 * The instant a period's work became due, resolved at the target date so the
 * offset that applies is the one in force that evening rather than the one in
 * force now.
 */
export function periodDueAt(key: string, schedule: WeeklySchedule, timeZone: string): Date {
  return instantOnDay(key.slice(0, 10), schedule.hour, schedule.minute, timeZone);
}

/** The Monday of the week a Sunday-evening period reviews, as a day key. */
export function reviewedWeekStart(key: string, timeZone: string): string {
  const day = key.slice(0, 10);
  const index = weekdayIndex(new Date(`${day}T12:00:00Z`), timeZone);
  return dayAfter(day, -index);
}

/**
 * Every period between two instants, oldest first, that a tick should have
 * fired and did not.
 *
 * This is what a container that was off across a Sunday reads at boot. It is
 * bounded by `limit` on purpose: a machine off for a month has four missed
 * Sundays behind it and firing four reviews at boot would push four plans and
 * four notifications at a person who wanted one. F120 says exactly once on next
 * boot, so the default limit is one and the catch-up takes the most recent
 * period only. The older ones stay unclaimed and unrun, which is the honest
 * record: they did not happen.
 */
export function missedPeriods(
  since: Date,
  now: Date,
  schedule: WeeklySchedule,
  timeZone: string,
  limit = 1,
): string[] {
  const keys: string[] = [];
  let key = weeklyPeriodKey(now, schedule, timeZone);
  while (keys.length < limit) {
    const due = periodDueAt(key, schedule, timeZone);
    if (due.getTime() < since.getTime() || due.getTime() > now.getTime()) break;
    keys.push(key);
    key = `${dayAfter(key.slice(0, 10), -7)}T${wallTime(schedule.hour, schedule.minute)}`;
  }
  return keys.reverse();
}

/**
 * The reminder sweep's window key: the local day and the wall clock rounded
 * down to the sweep interval.
 *
 * F117's grouping turns on this value. Two reminders whose fire times land in
 * the same window are one notification, and a window read off the local clock
 * behaves across a clock change for the same reason the weekly key does.
 */
export const SWEEP_MINUTES = 5;

export function sweepWindowKey(at: Date, timeZone: string, minutes = SWEEP_MINUTES): string {
  const day = localDayKey(at, timeZone);
  const [hour, minute] = localWallTime(at, timeZone).split(':').map(Number);
  const floored = Math.floor(minute / minutes) * minutes;
  return `${day}T${wallTime(hour, floored)}`;
}
