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
