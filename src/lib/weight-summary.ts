import {
  AVERAGE_WINDOW,
  type AveragePoint,
  type Day,
  type Gap,
  type Goal,
  type Reading,
  findGaps,
  goalValueOn,
  pacePerWeek,
  rollingAverage,
} from '@/lib/trend';

/**
 * Everything the weight card says, computed once.
 *
 * Pure, so the unit suite grades the arithmetic the screens read out loud
 * rather than a screenshot of it. Every figure here is either a real number or
 * null, and null means the app does not know: nothing in this file returns a
 * zero, a last-known value or a guess to fill a hole.
 */

export const PACE_DAYS = 28;

export type WeightSummary = {
  /** The last daily reading. Deliberately not the headline. */
  latest: Reading | null;
  latestAt: string | null;
  /** The seven-day average, which is the headline. */
  average: AveragePoint | null;
  /** The same average one week back, so the week's change is average to average. */
  lastWeek: AveragePoint | null;
  weekChange: number | null;
  /** Kilograms a week over four weeks, average to average. */
  pace: number | null;
  /** Where the trajectory sits today, and how far the average is from it. */
  goalToday: number | null;
  /** Negative is under the line, which is the side the owner wants to be on. */
  goalDelta: number | null;
  gaps: Gap[];
  /**
   * Set when last week's average was computed on a short window. The count is
   * on screen whenever this is not null, because a figure on a short window
   * that does not say so is the smoothing this product refuses.
   */
  shortWindow: { count: number; size: number } | null;
  /** The same, for the headline itself when today's window is short. */
  headlineWindow: { count: number; size: number } | null;
};

export function weightSummary(days: Day[], goal: Goal | null, anchorDay: Date): WeightSummary {
  const points = rollingAverage(days);
  const last = points.length - 1;
  const average = points[last] ?? null;
  const lastWeek = points[last - AVERAGE_WINDOW] ?? null;
  const fourWeeks = points[last - PACE_DAYS] ?? null;

  let latest: Reading | null = null;
  let latestAt: string | null = null;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index].reading) {
      latest = days[index].reading;
      latestAt = days[index].at;
      break;
    }
  }

  const goalToday = goal ? goalValueOn(goal, anchorDay) : null;

  return {
    latest,
    latestAt,
    average,
    lastWeek,
    weekChange:
      average?.mean != null && lastWeek?.mean != null ? average.mean - lastWeek.mean : null,
    pace: pacePerWeek(average, fourWeeks, PACE_DAYS),
    goalToday,
    goalDelta: average?.mean != null && goalToday !== null ? average.mean - goalToday : null,
    gaps: findGaps(days),
    shortWindow:
      lastWeek && lastWeek.mean !== null && lastWeek.count < lastWeek.size
        ? { count: lastWeek.count, size: lastWeek.size }
        : null,
    headlineWindow:
      average && average.mean !== null && average.count < average.size
        ? { count: average.count, size: average.size }
        : null,
  };
}
