/**
 * An instant on a named calendar day at a named local hour.
 *
 * The offset is read AT THE TARGET DATE rather than at now, so a session placed
 * across a daylight-saving change lands on the hour it says it does. Next
 * Sunday's 07:15 is 07:15 whichever side of the last Sunday in October it falls.
 *
 * Dependency free, so the unit suite grades the arithmetic with no clock of its
 * own and the proposer stays pure.
 */
export function instantOnDay(dayKey: string, hour: number, minute: number, timeZone: string): Date {
  const noon = new Date(`${dayKey}T12:00:00Z`);
  const offset = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(noon)
    .find((part) => part.type === 'timeZoneName')!
    .value.replace('GMT', '');
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return new Date(`${dayKey}T${hh}:${mm}:00${offset || '+00:00'}`);
}

/** The day key `ahead` days after another one. Keys are labels, so this is UTC arithmetic. */
export function dayAfter(from: string, ahead: number): string {
  return new Date(Date.parse(`${from}T00:00:00Z`) + ahead * 86_400_000).toISOString().slice(0, 10);
}

/** The calendar day an instant falls on, in the app's zone. "2026-08-24". */
export function localDayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(date);
}

/**
 * Monday is 0 and Sunday is 6, read in the app's own zone.
 *
 * `Date.getDay()` is not usable here: it reads the MACHINE's zone, and the
 * timezone-shifted run across six zones is exactly where that shows up. The
 * day is resolved in the app's zone first and the index is then read off that
 * calendar date as a label, which is the same treatment `dayLabel` gives a key
 * in src/lib/format.ts.
 */
export function weekdayIndex(date: Date, timeZone: string): number {
  const asUtc = new Date(`${localDayKey(date, timeZone)}T00:00:00Z`);
  return (asUtc.getUTCDay() + 6) % 7;
}

/** The Monday of the week a day key sits in. */
export function mondayOf(dayKey: string, timeZone: string): string {
  const index = weekdayIndex(new Date(`${dayKey}T12:00:00Z`), timeZone);
  return dayAfter(dayKey, -index);
}
