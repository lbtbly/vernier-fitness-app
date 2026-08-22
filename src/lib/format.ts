/**
 * Dates and times render Europe/Paris, 24 hour, in the two shapes DESIGN.md
 * fixes: "21 Aug" and "Friday 21 August". The zone comes from configuration so
 * a timezone-shifted run produces identical rendered dates.
 */
export function longDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  }).format(date);
}

export function shortDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(date);
}

export function time24(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(date);
}

/**
 * "21 Aug, 06:52". The two date shapes DESIGN.md fixes are the only two this
 * app renders, so a timestamp is one of them plus a 24-hour time and never a
 * third format smuggled in beside them.
 */
export function shortDateTime(date: Date, timeZone: string): string {
  return `${shortDate(date, timeZone)}, ${time24(date, timeZone)}`;
}

/** "Friday 21 August, 18:32". */
export function longDateTime(date: Date, timeZone: string): string {
  return `${longDate(date, timeZone)}, ${time24(date, timeZone)}`;
}

/**
 * Decimal places per unit, so the same measurement never renders 98.5 on one
 * screen and 98.50 on the next. Metric throughout, exactly the units DESIGN.md
 * names, plus whatever the laboratory printed.
 */
const PRECISION: Record<string, number> = {
  kg: 1,
  cm: 1,
  km: 2,
  kcal: 0,
  g: 0,
  step: 0,
  point: 0,
  min: 0,
  bpm: 0,
  ms: 0,
  'mL/kg/min': 1,
  'mmol/L': 2,
  'g/L': 2,
  'µg/L': 0,
};

/** The number alone, grouped and fixed to its unit's precision. No unit on it. */
export function formatNumber(value: number, unit: string): string {
  const digits = PRECISION[unit] ?? 1;
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * How many whole days ago, read in the app's zone rather than in 24-hour
 * chunks, because "3 days old" means three calendar days to the person reading
 * it and not 72 hours.
 */
/**
 * A day key, "2026-08-21", as the app writes dates: "21 Aug".
 *
 * Formatted in UTC on purpose, and this is not a hole in the timezone rule. The
 * key was computed in the app's own zone by `dayKey()`, so it already names the
 * right calendar day; reading it back in the app's zone would shift it again in
 * any zone east of UTC, and the timezone-shifted run across six zones is
 * exactly where that shows up. A key is a label, not an instant.
 */
export function dayLabel(key: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${key}T00:00:00Z`),
  );
}

/** The same key as "21 August", for a sentence rather than an axis. */
export function longDayLabel(key: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${key}T00:00:00Z`),
  );
}

/**
 * Whole hours between two instants. F34's threshold is 36 hours and it falls
 * inside a day boundary, so an age rounded to calendar days cannot be checked
 * at 35 and again at 37. Hours can.
 */
export function hoursBetween(earlier: Date, later: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 3_600_000);
}

export function daysBetween(earlier: Date, later: Date, timeZone: string): number {
  const dayOf = (date: Date) =>
    new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone })
      .format(date);
  const start = Date.parse(`${dayOf(earlier)}T00:00:00Z`);
  const end = Date.parse(`${dayOf(later)}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}
