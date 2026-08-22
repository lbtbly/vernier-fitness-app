import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { valueLabel, valueLine } from '@/lib/display';
import { daysBetween, formatNumber, longDate, longDateTime, shortDate, shortDateTime, time24 } from '@/lib/format';
import { strings } from '@/lib/strings';

const PARIS = 'Europe/Paris';
const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * C6. Two date shapes, 24-hour times, metric units, and none of it reading the
 * machine's own zone.
 */
describe('dates and times', () => {
  const morning = new Date('2026-08-21T04:52:00Z');

  it('renders the two shapes DESIGN.md fixes and no third one', () => {
    expect(shortDate(morning, PARIS)).toBe('21 Aug');
    expect(longDate(morning, PARIS)).toBe('Friday 21 August');
  });

  it('renders times 24 hour, with no meridiem anywhere', () => {
    expect(time24(morning, PARIS)).toBe('06:52');
    expect(time24(new Date('2026-08-21T16:32:00Z'), PARIS)).toBe('18:32');
    expect(shortDateTime(morning, PARIS)).toBe('21 Aug, 06:52');
    expect(longDateTime(morning, PARIS)).toBe('Friday 21 August, 06:52');
    expect(`${shortDateTime(morning, PARIS)} ${time24(morning, PARIS)}`).not.toMatch(/[ap]m/i);
  });

  it('reads Paris, not the instant, when the two disagree about the day', () => {
    // 22:40 UTC is already the 22nd in Paris.
    expect(shortDate(new Date('2026-08-21T22:40:00Z'), PARIS)).toBe('22 Aug');
  });

  it('counts days as calendar days in the app zone', () => {
    expect(
      daysBetween(new Date('2026-08-18T05:12:00Z'), new Date('2026-08-21T21:40:00Z'), PARIS),
    ).toBe(3);
  });
});

describe('units', () => {
  it('is metric, with the precision the unit deserves and no more', () => {
    expect(formatNumber(86.4, 'kg')).toBe('86.4');
    expect(formatNumber(98.5, 'cm')).toBe('98.5');
    expect(formatNumber(2150, 'kcal')).toBe('2,150');
    expect(formatNumber(3.72, 'mmol/L')).toBe('3.72');
    expect(formatNumber(9412, 'step')).toBe('9,412');
  });

  it('names every unit in the catalogue rather than in a component', () => {
    expect(strings.units.kg).toBe('kg');
    expect(strings.units.cm).toBe('cm');
    expect(strings.units.km).toBe('km');
    expect(strings.units.kcal).toBe('kcal');
    expect(strings.units.g).toBe('g');
  });

  it('renders a rating as a rating and a note as itself, never as a number with a unit', () => {
    expect(valueLine({ value: 4, rawValue: '4', unit: 'point' })).toBe('4 of 5');
    expect(valueLine({ value: null, rawValue: 'Slept badly. Left knee fine.', unit: 'text' })).toBe(
      'Slept badly. Left knee fine.',
    );
    expect(valueLabel({ value: 98.5, rawValue: '98.5', unit: 'cm' })).toEqual({
      number: '98.5',
      unit: 'cm',
    });
  });
});

/**
 * The timezone-shifted run, in the suite as well as on the command line, so a
 * formatter that starts reading the ambient zone fails here before it reaches a
 * screen.
 */
describe('a timezone-shifted run renders identical dates', () => {
  function render(tz: string): string {
    return execFileSync(process.execPath, ['scripts/tz-shift.mjs'], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { ...process.env, TZ: tz },
    });
  }

  it('is byte identical from Paris, Auckland and Los Angeles', () => {
    const paris = render('Europe/Paris');
    const auckland = render('Pacific/Auckland');
    const losAngeles = render('America/Los_Angeles');

    expect(auckland).toBe(paris);
    expect(losAngeles).toBe(paris);
    expect(paris).toContain('Friday 21 August');
    expect(paris).toContain('21 Aug, 06:52');
  });
});
