import {
  AVERAGE_WINDOW,
  GOAL_CORRIDOR,
  type AveragePoint,
  type Day,
  type Gap,
  type Goal,
  goalValueOn,
} from '@/lib/trend';

/**
 * Chart geometry. Numbers in, numbers out, no decisions.
 *
 * Every rule about what may be drawn lives in `src/lib/trend.ts`; this turns
 * the answer into coordinates. Keeping the two apart is what lets the unit
 * suite grade "the average went dashed on a six-day window" without rendering
 * anything, and what stops a pixel calculation quietly becoming a data rule.
 *
 * The weights are DESIGN.md section 3, and they are the product's signature
 * rather than a style: daily readings are 2.1 px dots and are never joined,
 * because joining them draws a line through hydration; the seven-day average is
 * a 2.6 px round-capped path and the loudest object in the card; the goal
 * trajectory is 1.5 px dashed 5 5 in a quiet colour with a corridor of plus or
 * minus half a kilogram; gridlines are 1 px at whole kilograms only.
 *
 * The chart is server-rendered SVG. No canvas, no chart library, no client
 * bundle: a trend the owner reads in ten seconds must not wait on JavaScript,
 * and a `<circle>` in the response is a thing a verifier can read the stroke
 * width off.
 */

export const CHART_WIDTH = 329;
export const PAD_LEFT = 8;
export const PAD_RIGHT = 8;
export const PAD_TOP = 8;
/** Room under the plot for the date labels along the bottom. */
export const PAD_BOTTOM = 24;

export const DOT_RADIUS = 2.1;
export const AVERAGE_STROKE = 2.6;
export const GOAL_STROKE = 1.5;
export const GOAL_DASH = '5 5';
export const AVERAGE_DASH = '4 4';
export const GRID_STROKE = 1;
/** The hatch that marks a range with nothing in it. 45 degrees, DESIGN.md. */
export const HATCH_ANGLE = 45;

export type Box = { left: number; right: number; top: number; bottom: number };

export function boxOf(height: number, width = CHART_WIDTH): Box {
  return { left: PAD_LEFT, right: width - PAD_RIGHT, top: PAD_TOP, bottom: height - PAD_BOTTOM };
}

/** The x of one day column. A single-day window sits on the left edge. */
export function columnX(index: number, count: number, box: Box): number {
  if (count <= 1) return box.left;
  return box.left + ((box.right - box.left) * index) / (count - 1);
}

export type Domain = { low: number; high: number };

/** The y of a value, with the domain's high at the top. */
export function scaleY(value: number, domain: Domain, box: Box): number {
  const span = domain.high - domain.low;
  if (span <= 0) return (box.top + box.bottom) / 2;
  return box.bottom - ((value - domain.low) / span) * (box.bottom - box.top);
}

/**
 * A domain rounded out to whole units, so the gridlines land on whole
 * kilograms rather than on whatever the data happened to reach.
 */
export function wholeDomain(values: number[], pad = 0.4): Domain {
  const present = values.filter((value) => Number.isFinite(value));
  if (present.length === 0) return { low: 0, high: 1 };
  const low = Math.floor(Math.min(...present) - pad);
  const high = Math.ceil(Math.max(...present) + pad);
  return { low, high: high > low ? high : low + 1 };
}

export type GridLine = { y: number; value: number };

/** One line per whole unit inside the domain, thinned so a card holds six at most. */
export function gridLines(domain: Domain, box: Box, most = 6): GridLine[] {
  const step = Math.max(1, Math.ceil((domain.high - domain.low) / most));
  const lines: GridLine[] = [];
  for (let value = Math.ceil(domain.low); value <= domain.high; value += step) {
    lines.push({ value, y: scaleY(value, domain, box) });
  }
  return lines;
}

export type Dot = { x: number; y: number; id: string; at: string; value: number };
export type PathSegment = { d: string; dashed: boolean };
export type Band = { x: number; width: number; from: string; to: string };

/** The daily readings, as unconnected dots. Nothing here ever returns a path. */
export function dotsOf(days: Day[], domain: Domain, box: Box): Dot[] {
  const dots: Dot[] = [];
  days.forEach((day, index) => {
    if (!day.reading) return;
    dots.push({
      x: columnX(index, days.length, box),
      y: scaleY(day.reading.value, domain, box),
      id: day.reading.id,
      at: day.at,
      value: day.reading.value,
    });
  });
  return dots;
}

/**
 * The rolling average as one or more paths, broken wherever it may not be
 * drawn and dashed wherever its window was short.
 *
 * An edge takes the weaker of its two ends: a solid day joined to a dashed day
 * is drawn dashed, because the segment between them spans a window that was
 * missing days. Nothing bridges an undrawn day, which is what makes the break
 * across a gap a real break rather than a lighter line.
 */
export function averagePaths(points: AveragePoint[], domain: Domain, box: Box, count: number): PathSegment[] {
  const segments: PathSegment[] = [];
  let run: { points: string[]; dashed: boolean } | null = null;

  const flush = () => {
    if (run && run.points.length >= 2) segments.push({ d: `M${run.points.join(' ')}`, dashed: run.dashed });
    run = null;
  };

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (point.value === null) {
      flush();
      continue;
    }
    const at = `${round(columnX(index, count, box))} ${round(scaleY(point.value, domain, box))}`;
    const dashed = point.draw === 'dashed';
    if (!run) {
      run = { points: [at], dashed };
      continue;
    }
    if (run.dashed !== dashed) {
      // The join belongs to both, so the point is the end of one path and the
      // start of the next. Without this the line has a hole at every change of
      // style, which reads as a gap that is not there.
      run.points.push(at);
      flush();
      run = { points: [at], dashed };
      continue;
    }
    run.points.push(at);
  }
  flush();
  return segments;
}

/** A single point marking where the average stands today. */
export function averageHead(points: AveragePoint[], domain: Domain, box: Box, count: number) {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    if (point.value === null) continue;
    return { x: columnX(index, count, box), y: scaleY(point.value, domain, box), value: point.value };
  }
  return null;
}

/**
 * The hatched band over a run of missing days, spanning the columns those days
 * would have occupied, half a column proud on each side so the break is
 * visible rather than implied.
 */
export function gapBands(gaps: Gap[], count: number, box: Box): Band[] {
  const half = count > 1 ? (box.right - box.left) / (count - 1) / 2 : 0;
  return gaps.map((gap) => {
    const from = columnX(gap.fromIndex, count, box) - half;
    const to = columnX(gap.toIndex, count, box) + half;
    return {
      x: Math.max(box.left, from),
      width: Math.min(box.right, to) - Math.max(box.left, from),
      from: gap.from,
      to: gap.to,
    };
  });
}

/**
 * The band from a stale source's last sample to now. Not a gap in the middle of
 * a series but the silence at the end of one, which is the failure the operator
 * said he only ever notices four days late.
 */
export function trailingBand(days: Day[], box: Box): Band | null {
  let last = -1;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index].reading) {
      last = index;
      break;
    }
  }
  if (last === -1 || last === days.length - 1) return null;
  const half = days.length > 1 ? (box.right - box.left) / (days.length - 1) / 2 : 0;
  const from = columnX(last, days.length, box) + half;
  return {
    x: from,
    width: box.right - from,
    from: days[last + 1].at,
    to: days[days.length - 1].at,
  };
}

export type GoalLine = { x1: number; y1: number; x2: number; y2: number };
export type Corridor = { points: string };

/** The trajectory across the window, and the corridor around it. */
export function goalGeometry(
  goal: Goal,
  firstDay: Date,
  lastDay: Date,
  domain: Domain,
  box: Box,
): { line: GoalLine; corridor: Corridor } | null {
  const start = goalValueOn(goal, firstDay);
  const end = goalValueOn(goal, lastDay);
  if (start === null || end === null) return null;
  const y1 = scaleY(start, domain, box);
  const y2 = scaleY(end, domain, box);
  const topLeft = scaleY(start + GOAL_CORRIDOR, domain, box);
  const topRight = scaleY(end + GOAL_CORRIDOR, domain, box);
  const lowLeft = scaleY(start - GOAL_CORRIDOR, domain, box);
  const lowRight = scaleY(end - GOAL_CORRIDOR, domain, box);
  return {
    line: { x1: box.left, y1: round(y1), x2: box.right, y2: round(y2) },
    corridor: {
      points: [
        `${box.left},${round(topLeft)}`,
        `${box.right},${round(topRight)}`,
        `${box.right},${round(lowRight)}`,
        `${box.left},${round(lowLeft)}`,
      ].join(' '),
    },
  };
}

/** A connected series with its own domain: waist, resting heart rate. */
export function linePath(days: Day[], domain: Domain, box: Box): { path: string; dots: Dot[] } {
  const dots = dotsOf(days, domain, box);
  const path = dots.length < 2 ? '' : `M${dots.map((dot) => `${round(dot.x)} ${round(dot.y)}`).join(' ')}`;
  return { path, dots };
}

export type Bar = { x: number; y: number; width: number; height: number; id: string; at: string; value: number };

/** Bars for a count per day: steps, minutes asleep. Missing days draw nothing. */
export function barsOf(days: Day[], domain: Domain, box: Box): Bar[] {
  const slot = days.length > 0 ? (box.right - box.left) / days.length : 0;
  const width = Math.max(2, slot * 0.72);
  const bars: Bar[] = [];
  days.forEach((day, index) => {
    if (!day.reading) return;
    const y = scaleY(day.reading.value, domain, box);
    bars.push({
      x: box.left + slot * index + (slot - width) / 2,
      y: round(y),
      width: round(width),
      height: round(Math.max(1, box.bottom - y)),
      id: day.reading.id,
      at: day.at,
      value: day.reading.value,
    });
  });
  return bars;
}

/** Two decimal places is more than an SVG needs and less than a diff wants. */
export function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export { AVERAGE_WINDOW };
