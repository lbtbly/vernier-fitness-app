import { describe, expect, test } from 'vitest';
import {
  AVERAGE_STROKE,
  DOT_RADIUS,
  GOAL_DASH,
  GOAL_STROKE,
  averagePaths,
  barsOf,
  boxOf,
  columnX,
  dotsOf,
  gapBands,
  goalGeometry,
  gridLines,
  scaleY,
  trailingBand,
  wholeDomain,
} from '@/lib/chart';
import { GOAL_CORRIDOR, type Day, dailySeries, findGaps, rollingAverage, windowDays } from '@/lib/trend';
import { WEIGHT_BY_DAY } from '@/lib/demo-series';

/**
 * Chart geometry, graded without rendering anything.
 *
 * What is defended here is that the shape of the drawing follows the shape of
 * the data: no dot where there is no reading, no path across a gap, and the
 * weights DESIGN.md fixes as the product's signature.
 */

const ZONE = 'Europe/Paris';
const ANCHOR = new Date('2026-08-22T06:52:00+02:00');

function seriesOf(days: number, table: Record<number, number>): Day[] {
  const readings = Object.entries(table).map(([offset, value]) => ({
    id: `r${offset}`,
    value,
    measuredAt: new Date(ANCHOR.getTime() - Number(offset) * 86_400_000),
    origin: 'withings',
    seed: true,
  }));
  return dailySeries(readings, windowDays(ANCHOR, days, ZONE), ZONE);
}

const DAYS = seriesOf(30, WEIGHT_BY_DAY);
const BOX = boxOf(120);
const DOMAIN = wholeDomain(DAYS.flatMap((day) => (day.reading ? [day.reading.value] : [])));

describe('the weights are the ones DESIGN.md fixes', () => {
  test('a daily dot is 2.1, the average 2.6, the goal 1.5 dashed 5 5', () => {
    expect(DOT_RADIUS).toBe(2.1);
    expect(AVERAGE_STROKE).toBe(2.6);
    expect(GOAL_STROKE).toBe(1.5);
    expect(GOAL_DASH).toBe('5 5');
  });
});

describe('a dot exists only where a reading does', () => {
  test('twenty-six dots for thirty days with a four-day gap', () => {
    expect(dotsOf(DAYS, DOMAIN, BOX)).toHaveLength(26);
  });

  test('no dot lands inside the gap band', () => {
    const gaps = findGaps(DAYS);
    const [band] = gapBands(gaps, DAYS.length, BOX);
    const inside = dotsOf(DAYS, DOMAIN, BOX).filter(
      (dot) => dot.x > band.x && dot.x < band.x + band.width,
    );
    expect(inside).toHaveLength(0);
  });
});

describe('the average is broken across the gap, not bridged', () => {
  const points = rollingAverage(DAYS);
  const segments = averagePaths(points, DOMAIN, BOX, DAYS.length);
  const gaps = findGaps(DAYS);
  const [band] = gapBands(gaps, DAYS.length, BOX);

  test('there is more than one path, which is what a break means', () => {
    expect(segments.length).toBeGreaterThan(1);
  });

  test('no path has a point inside the gap band', () => {
    for (const segment of segments) {
      const xs = segment.d
        .replace('M', '')
        .split(' ')
        .filter((_, index) => index % 2 === 0)
        .map(Number);
      for (const x of xs) {
        expect(x > band.x && x < band.x + band.width).toBe(false);
      }
    }
  });

  test('no path spans the gap end to end', () => {
    // The defeat attempt this test exists for: a single path from before the
    // gap to after it would draw a straight line across four missing days and
    // would look exactly like a real trend.
    for (const segment of segments) {
      const xs = segment.d
        .replace('M', '')
        .split(' ')
        .filter((_, index) => index % 2 === 0)
        .map(Number);
      const spans = Math.min(...xs) < band.x && Math.max(...xs) > band.x + band.width;
      expect(spans).toBe(false);
    }
  });

  test('a short window is drawn dashed and a whole one solid', () => {
    expect(segments.some((segment) => segment.dashed)).toBe(true);
    expect(segments.some((segment) => !segment.dashed)).toBe(true);
  });
});

describe('the goal line and its corridor', () => {
  const goal = {
    startValue: 89,
    startAt: new Date(ANCHOR.getTime() - 53 * 86_400_000),
    targetValue: 76,
    targetAt: new Date('2027-03-30T07:00:00+02:00'),
    unit: 'kg',
  };

  test('the corridor is half a kilogram either side of the line', () => {
    expect(GOAL_CORRIDOR).toBe(0.5);
    const domain = { low: 84, high: 90 };
    const box = boxOf(120);
    const geometry = goalGeometry(goal, new Date('2026-07-24T12:00:00Z'), new Date('2026-08-22T12:00:00Z'), domain, box)!;
    const corner = geometry.corridor.points.split(' ').map((point) => Number(point.split(',')[1]));
    // Top edge is half a kilogram above the line, bottom edge half below, and a
    // kilogram is a fixed number of pixels on a linear scale.
    const perKilogram = Math.abs(scaleY(85, domain, box) - scaleY(86, domain, box));
    expect(Math.abs(corner[0] - geometry.line.y1)).toBeCloseTo(perKilogram / 2, 0);
    expect(Math.abs(corner[3] - geometry.line.y1)).toBeCloseTo(perKilogram / 2, 0);
  });
});

describe('gridlines land on whole units', () => {
  test('every line is a whole number', () => {
    for (const line of gridLines({ low: 84.2, high: 89.7 }, BOX)) {
      expect(Number.isInteger(line.value)).toBe(true);
    }
  });

  test('a domain rounded out reaches whole numbers on both sides', () => {
    const domain = wholeDomain([85.9, 89.1]);
    expect(Number.isInteger(domain.low)).toBe(true);
    expect(Number.isInteger(domain.high)).toBe(true);
    expect(domain.low).toBeLessThanOrEqual(85);
    expect(domain.high).toBeGreaterThanOrEqual(90);
  });
});

describe('a bar exists only where a day has a count', () => {
  test('a day with nothing sent draws no bar at all, not a bar of zero', () => {
    const steps = seriesOf(10, { 4: 9412, 5: 7830, 6: 11204, 7: 8617 });
    const box = boxOf(76);
    const bars = barsOf(steps, { low: 0, high: 12000 }, box);
    expect(bars).toHaveLength(4);
    expect(bars.every((bar) => bar.height > 1)).toBe(true);
  });

  test('the silence at the end of a series is one band reaching the right edge', () => {
    const steps = seriesOf(10, { 4: 9412, 5: 7830, 6: 11204, 7: 8617 });
    const box = boxOf(76);
    const band = trailingBand(steps, box)!;
    expect(band).not.toBeNull();
    expect(Math.round(band.x + band.width)).toBe(box.right);
  });

  test('a series that runs to today has no trailing band', () => {
    const steps = seriesOf(4, { 0: 9000, 1: 9100, 2: 9200, 3: 9300 });
    expect(trailingBand(steps, boxOf(76))).toBeNull();
  });
});

describe('the time axis', () => {
  test('the first day sits on the left edge and the last on the right', () => {
    expect(columnX(0, 30, BOX)).toBe(BOX.left);
    expect(columnX(29, 30, BOX)).toBe(BOX.right);
  });
});
