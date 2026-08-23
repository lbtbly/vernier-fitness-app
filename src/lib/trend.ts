/**
 * The trend rules, as arithmetic rather than as pixels.
 *
 * This is the signature of the whole product and it is deliberately pure: no
 * database, no clock of its own, no React. Every rule the panel called
 * load-bearing is decided here and graded by the unit suite, and
 * `src/lib/chart.ts` turns the result into geometry without deciding anything.
 *
 * Two rules run through all of it.
 *
 * **The trend leads and the daily number is secondary.** A body-composition
 * scale moves with hydration, so the number that gets the big type is the
 * seven-day average and never this morning's reading. That is not a preference,
 * it is the difference between a chart that tells the owner something and a
 * chart that reports water.
 *
 * **Absence is drawn, never smoothed.** Nothing here interpolates, carries a
 * value forward or fills a hole with a zero. A run of missing days is returned
 * as a gap for the chart to hatch, and a rolling average whose window is short
 * comes back with its count so the screen can state it, go dashed, or refuse to
 * draw at all. The owner's words: a flat line where data is missing is worse
 * than no line.
 */

import { compareStanding } from '@/lib/provenance';

/** A day in the app's own zone, as 'YYYY-MM-DD'. The key every series is indexed by. */
export function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(date);
}

/** The day key `back` days before `anchor`, read in the app's zone. */
export function dayKeyBefore(anchor: Date, back: number, timeZone: string): string {
  return dayKey(new Date(anchor.getTime() - back * 86_400_000), timeZone);
}

/**
 * The window a chart draws: `days` day keys ending on the anchor's own day,
 * oldest first. Whole calendar days, so a reading at 06:52 and one at 23:10
 * land on the same column.
 */
export function windowDays(anchor: Date, days: number, timeZone: string): string[] {
  const keys: string[] = [];
  for (let back = days - 1; back >= 0; back -= 1) keys.push(dayKeyBefore(anchor, back, timeZone));
  return keys;
}

/** One stored reading, reduced to what a trend needs. */
export type Reading = {
  /** The measurement id, so a point on a chart walks back to its own value sheet. */
  id: string;
  value: number;
  measuredAt: Date;
  /** Where the value came from, the shape it stands in for rather than the seed. */
  origin: string;
  /** True when the demonstration seed wrote it. */
  seed: boolean;
};

/** One column of a daily series. `reading` is null on a day with nothing in it. */
export type Day = { at: string; reading: Reading | null };

/**
 * A reading per calendar day, over the window, with the empty days kept as
 * empty days.
 *
 * The empty days are the entire point. A series that dropped them would leave
 * the chart joining 7 August to 12 August with a straight line, which is the
 * carried-forward reading this product refuses to draw.
 *
 * When a day holds more than one reading, `compareStanding` says which one
 * stands, and it is the same comparator the write layer and every other read
 * uses. This line used to be `reading.measuredAt > held.measuredAt`: latest
 * instant, rank never consulted. The seed writes weight at a fixed 06:52, so a
 * real weigh-in at 06:30 lost its own column to a fabrication, silently, and
 * every figure on the weight card is computed off the column rather than off
 * the rows. `.forge/AMENDMENTS.md` A7.
 */
export function dailySeries(readings: Reading[], keys: string[], timeZone: string): Day[] {
  const byDay = new Map<string, Reading>();
  for (const reading of readings) {
    const on = dayKey(reading.measuredAt, timeZone);
    const held = byDay.get(on);
    if (!held || compareStanding(reading, held, timeZone) < 0) byDay.set(on, reading);
  }
  return keys.map((on) => ({ at: on, reading: byDay.get(on) ?? null }));
}

/**
 * A run of days with no reading at all, three or more long.
 *
 * Three is the threshold DESIGN.md fixes and it is not arbitrary: one missed
 * morning on a daily scale is normal, three is the shape of a dead token, a
 * flat battery or a fortnight away, and it is exactly the silence the operator
 * said he only notices four days late.
 */
export type Gap = { fromIndex: number; toIndex: number; from: string; to: string };

export const GAP_DAYS = 3;

export function findGaps(days: Day[], minimum = GAP_DAYS): Gap[] {
  const gaps: Gap[] = [];
  let run = 0;
  for (let index = 0; index <= days.length; index += 1) {
    const empty = index < days.length && days[index].reading === null;
    if (empty) {
      run += 1;
      continue;
    }
    if (run >= minimum) {
      gaps.push({
        fromIndex: index - run,
        toIndex: index - 1,
        from: days[index - run].at,
        to: days[index - 1].at,
      });
    }
    run = 0;
  }
  return gaps;
}

/** How a rolling average is allowed to be drawn on the window it actually had. */
export type AverageDraw = 'solid' | 'dashed' | 'undrawn';

export type AveragePoint = {
  index: number;
  at: string;
  /**
   * The mean of the days the window actually held, however few. Null only when
   * the window held nothing at all.
   *
   * This is separate from `value` on purpose, and the separation is the whole
   * of DESIGN.md's rule. What may be DRAWN and what may be COMPUTED are two
   * different questions: a line through a three-day window would read as a
   * seven-day trend and is refused, while the figure itself is real and is
   * allowed on screen as long as it carries its count. "Last week's average
   * used 3 days of 7" is that sentence, and it exists because the alternative
   * is either a silent three-day average pretending to be a week or a blank
   * where the owner has data.
   */
  mean: number | null;
  /** The drawable value: the mean, or null when the window was too short to plot. */
  value: number | null;
  /** How many of the `size` days in the window carried a reading. */
  count: number;
  size: number;
  draw: AverageDraw;
};

export const AVERAGE_WINDOW = 7;
/** Below this the average is not drawn at all. DESIGN.md, section 4. */
export const AVERAGE_MINIMUM = 5;
/** At or above this the window is whole and the line is solid. */
export const AVERAGE_WHOLE = AVERAGE_WINDOW;

/**
 * The rolling average, day by day, carrying the count it was computed on.
 *
 * Solid at 7 of 7, dashed at 5 or 6, not drawn below 5, and the count travels
 * with every point so a figure on a short window can state it on screen. No
 * missing day is filled: a window of three days is a mean of three days and it
 * says so, it does not become a mean of seven by inventing four.
 */
export function rollingAverage(
  days: Day[],
  size = AVERAGE_WINDOW,
  minimum = AVERAGE_MINIMUM,
): AveragePoint[] {
  /*
   * The days the line may not cross.
   *
   * A trailing average over the previous six days is arithmetically defined on
   * a day with no reading of its own, and drawing it there is how a line walks
   * straight through a hatched gap looking exactly like a trend. F30 is plain:
   * a gap of three days or more BREAKS the line. So a day inside such a run is
   * undrawn whatever its window held. One or two missing days are not a gap and
   * the line carries over them, which is the same threshold the hatching uses.
   */
  const inAGap = new Set<number>();
  for (const gap of findGaps(days)) {
    for (let index = gap.fromIndex; index <= gap.toIndex; index += 1) inAGap.add(index);
  }

  return days.map((day, index) => {
    let sum = 0;
    let count = 0;
    for (let back = 0; back < size; back += 1) {
      const source = days[index - back];
      if (!source || !source.reading) continue;
      sum += source.reading.value;
      count += 1;
    }
    const enough = count >= minimum && !inAGap.has(index);
    const mean = count > 0 ? sum / count : null;
    return {
      index,
      at: day.at,
      mean,
      value: enough ? mean : null,
      count,
      size,
      draw: !enough ? 'undrawn' : count >= AVERAGE_WHOLE ? 'solid' : 'dashed',
    };
  });
}

/**
 * The average over one window, straight, for a figure that is not on a chart:
 * the headline number and last week's comparison both read this.
 */
export function averageOver(days: Day[], from: number, size = AVERAGE_WINDOW): AveragePoint | null {
  const points = rollingAverage(days, size);
  return points[from] ?? null;
}

/** The goal, as the two points a straight line runs between. */
export type Goal = {
  startValue: number;
  startAt: Date;
  targetValue: number;
  targetAt: Date;
  unit: string;
};

/** Where the trajectory sits on a given day. Null when the day is outside it. */
export function goalValueOn(goal: Goal, day: Date): number | null {
  const span = goal.targetAt.getTime() - goal.startAt.getTime();
  if (span <= 0) return null;
  const through = (day.getTime() - goal.startAt.getTime()) / span;
  return goal.startValue + (goal.targetValue - goal.startValue) * through;
}

/** The corridor DESIGN.md fixes: plus or minus half a kilogram around the line. */
export const GOAL_CORRIDOR = 0.5;

/**
 * Kilograms a week, measured between two rolling averages rather than between
 * two daily readings, because two daily readings a month apart is a comparison
 * of two hydration states.
 */
export function pacePerWeek(now: AveragePoint | null, then: AveragePoint | null, days: number): number | null {
  if (now?.mean == null || then?.mean == null || days <= 0) return null;
  return ((now.mean - then.mean) / days) * 7;
}

/**
 * Adherence: a count over its denominator, never a percentage.
 *
 * A percentage hides the denominator, and the denominator is the honest part.
 * Two of three reads as a week with one still to come; 67 percent reads as a
 * grade. The panel was explicit that two missed sessions in a month is Tuesday
 * and not a failure state, so this returns numbers and the screen colours none
 * of them.
 */
export type SessionState = 'planned' | 'completed' | 'missed';

export type PlannedSession = {
  id: string;
  plannedFor: Date;
  state: SessionState;
};

export type Adherence = { completed: number; planned: number; days: number };

export function adherence(sessions: PlannedSession[], anchor: Date, days: number, timeZone: string): Adherence {
  const keys = new Set(windowDays(anchor, days, timeZone));
  const inWindow = sessions.filter((session) => keys.has(dayKey(session.plannedFor, timeZone)));
  return {
    completed: inWindow.filter((session) => session.state === 'completed').length,
    planned: inWindow.length,
    days,
  };
}

/**
 * How old a source's newest sample is, in whole hours.
 *
 * F34's threshold is 36 hours and this is what it is measured against. Hours
 * rather than calendar days, because 36 hours falls inside a day boundary and a
 * chip that rounds it to "1 day old" cannot be checked at 35 and at 37.
 */
export const STALE_HOURS = 36;

export type Freshness = {
  source: string;
  /** The newest sample this source has delivered, or null if it never has. */
  lastAt: Date | null;
  hours: number | null;
  stale: boolean;
};

export function freshnessOf(source: string, lastAt: Date | null, now: Date): Freshness {
  if (!lastAt) return { source, lastAt: null, hours: null, stale: false };
  const hours = Math.floor((now.getTime() - lastAt.getTime()) / 3_600_000);
  return { source, lastAt, hours, stale: hours >= STALE_HOURS };
}

/** What one source has landed, split by the column Postgres computes from it. */
export type SourceSamples = {
  /** The newest sample this source really delivered. */
  measuredAt: Date | null;
  /** The newest sample the demonstration seed wrote in this source's shape. */
  seededAt: Date | null;
};

export type SourceFreshness = Freshness & {
  /** The integration's own state, when there is a credential row for it. */
  state: string | null;
  lastError: string | null;
};

/**
 * How old a source's newest sample is, with the demonstration yielding to
 * measurement exactly as it does everywhere else. `.forge/AMENDMENTS.md` A7.
 *
 * THE DEFECT THIS CLOSES, WHICH IS F43'S. Freshness was `max(measured_at)`
 * grouped by `source_record.source`, and the seed writes a Withings-shaped
 * source record every morning: `source: 'withings'`, `kind: 'sync_batch'`,
 * marked `seed`. So on a demonstration install Withings read fresh every day
 * the seed ran, whether or not a scale existed, and "name the stale Withings
 * data by cause with the adapter unreachable" could not be produced at all. The
 * fix is the cause and not the string: a seeded row is not a delivery, so once
 * a source has delivered anything real, only its real samples answer for it.
 *
 * WHY THE SEEDED SAMPLE IS NOT SIMPLY IGNORED. Until a source has delivered
 * once, the demonstration is the only story there is, and the story includes
 * the phone that stopped four days ago, which is where the stale chip F34 is
 * ticked on can actually be seen. The demonstration fills absence and yields to
 * measurement. That is one rule, and this is its third layer.
 *
 * The integration's own last successful sync still counts beside the sample,
 * because a sync that returned nothing new is still a sync, and the fresher of
 * the two is the truth.
 */
export function freshnessOfSource(
  source: string,
  samples: SourceSamples,
  credential: { lastSuccessfulSyncAt: Date | null; state: string | null; lastError: string | null } | null,
  now: Date,
): SourceFreshness {
  const delivered = samples.measuredAt ?? samples.seededAt;
  const candidates = [delivered, credential?.lastSuccessfulSyncAt ?? null].filter(
    (date): date is Date => date instanceof Date,
  );
  const lastAt = candidates.length === 0 ? null : new Date(Math.max(...candidates.map((at) => at.getTime())));
  return {
    ...freshnessOf(source, lastAt, now),
    state: credential?.state ?? null,
    lastError: credential?.lastError ?? null,
  };
}
