#!/usr/bin/env node
// Renders every date and time shape this app has, in the app's zone, and prints
// them. Nothing else.
//
//   TZ=Europe/Paris     node scripts/tz-shift.mjs
//   TZ=Pacific/Auckland node scripts/tz-shift.mjs
//   TZ=America/Los_Angeles node scripts/tz-shift.mjs
//
// C6, second half. The three runs must be byte identical. They are only
// identical if no formatter in this app ever reads the process's own zone,
// which is the whole claim: every call passes the zone explicitly and the
// ambient one is never consulted. A machine in Auckland renders Friday 21
// August exactly as the Mac mini in Paris does.
//
// Imports src/lib/format.ts directly, the way scripts/route-table.mjs imports
// src/lib/routes.ts, so what is measured here is the code that ships.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');

const { daysBetween, formatNumber, longDate, longDateTime, shortDate, shortDateTime, time24 } =
  await import(join(projectRoot, 'src', 'lib', 'format.ts'));

/** The zone the app renders in. Configuration, never the host's own setting. */
const APP_ZONE = 'Europe/Paris';

/**
 * Fixed instants, chosen to catch the ways a zone leaks: an early morning that
 * is the previous day west of Paris, a late evening that is the next day east
 * of it, and both sides of the European summer-time change.
 */
const INSTANTS = [
  '2026-08-21T04:52:00Z',
  '2026-08-21T16:32:00Z',
  '2026-08-21T22:40:00Z',
  '2026-01-15T23:30:00Z',
  '2026-03-29T00:30:00Z',
  '2026-10-25T00:30:00Z',
  '2026-12-31T23:59:00Z',
];

process.stdout.write(`app zone: ${APP_ZONE}\n`);
process.stdout.write(`process TZ: (deliberately not printed, it must not matter)\n\n`);

for (const iso of INSTANTS) {
  const date = new Date(iso);
  process.stdout.write(`${iso}\n`);
  process.stdout.write(`  shortDate      ${shortDate(date, APP_ZONE)}\n`);
  process.stdout.write(`  longDate       ${longDate(date, APP_ZONE)}\n`);
  process.stdout.write(`  time24         ${time24(date, APP_ZONE)}\n`);
  process.stdout.write(`  shortDateTime  ${shortDateTime(date, APP_ZONE)}\n`);
  process.stdout.write(`  longDateTime   ${longDateTime(date, APP_ZONE)}\n`);
}

process.stdout.write('\nunits\n');
for (const [value, unit] of [
  [86.4, 'kg'],
  [98.5, 'cm'],
  [5.2, 'km'],
  [2150, 'kcal'],
  [148, 'g'],
  [9412, 'step'],
  [3.72, 'mmol/L'],
  [1.44, 'g/L'],
]) {
  process.stdout.write(`  ${formatNumber(value, unit)} ${unit}\n`);
}

process.stdout.write('\ndays between\n');
process.stdout.write(
  `  18 Aug to 21 Aug: ${daysBetween(new Date('2026-08-18T05:12:00Z'), new Date('2026-08-21T21:40:00Z'), APP_ZONE)}\n`,
);
