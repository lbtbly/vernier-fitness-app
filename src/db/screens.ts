import { ensureDemoIsToday } from './demo';
import { readGoal, type GoalView } from './goal';
import { readSessionsBetween, type SessionView } from './sessions';
import { readFreshness, readTrends, type SourceFreshness } from './trends';
import { getConfig } from '@/lib/config';
import {
  type Adherence,
  type Day,
  adherence,
  dailySeries,
  windowDays,
} from '@/lib/trend';
import { type WeightSummary, weightSummary } from '@/lib/weight-summary';

/**
 * One read for the two screens that draw trends.
 *
 * Today and Health answer different questions off the same facts, so they share
 * the read rather than each assembling its own and drifting apart on what
 * "this week" means. Everything below is computed from the same anchor instant
 * in the same zone, which is what stops Today saying 86.4 while Health says
 * 86.5 on the same morning.
 */

/** The four windows the range control on Health offers, plus Today's own. */
export const RANGES = [7, 30, 182, 365] as const;
export const DEFAULT_RANGE = 30;
/** What Today draws. Wide enough to hold a four-day gap and still read at 393 px. */
export const TODAY_RANGE = 30;
/** What adherence is counted over. Both windows are on screen, both with denominators. */
export const ADHERENCE_WINDOWS = [7, 28] as const;

export type BodyScreen = {
  now: Date;
  timeZone: string;
  days: number;
  weightDays: Day[];
  waistDays: Day[];
  goal: GoalView | null;
  summary: WeightSummary;
  freshness: SourceFreshness[];
};

export async function readBodyScreen(days: number): Promise<BodyScreen> {
  const { timeZone } = getConfig();
  // A demonstration install extends its own series to today before it is read.
  // A container does not reboot at midnight, so a seed that only catches up at
  // boot is a seed that goes stale under a machine that stays up.
  await ensureDemoIsToday(timeZone);
  const now = new Date();
  const keys = windowDays(now, days, timeZone);
  const [trends, goal, freshness] = await Promise.all([
    readTrends(['weight', 'waist'], now, days),
    readGoal(),
    readFreshness(now),
  ]);
  const weightDays = dailySeries(trends.get('weight') ?? [], keys, timeZone);
  const waistDays = dailySeries(trends.get('waist') ?? [], keys, timeZone);
  return {
    now,
    timeZone,
    days,
    weightDays,
    waistDays,
    goal,
    summary: weightSummary(weightDays, goal, now),
    freshness,
  };
}

/** The five body signals, each as its own daily series over the window. */
export const SIGNAL_METRICS = ['steps', 'sleep_minutes', 'resting_heart_rate', 'hrv', 'vo2_max'] as const;

export type SignalScreen = {
  timeZone: string;
  days: number;
  series: Map<string, Day[]>;
};

export async function readSignalScreen(days: number): Promise<SignalScreen> {
  const { timeZone } = getConfig();
  await ensureDemoIsToday(timeZone);
  const now = new Date();
  const keys = windowDays(now, days, timeZone);
  const trends = await readTrends([...SIGNAL_METRICS], now, days);
  const series = new Map<string, Day[]>();
  for (const metric of SIGNAL_METRICS) {
    series.set(metric, dailySeries(trends.get(metric) ?? [], keys, timeZone));
  }
  return { timeZone, days, series };
}

export type AdherenceScreen = {
  today: SessionView | null;
  windows: Adherence[];
  /** The last seven days, one entry a day, for the row of pills on Today. */
  week: Array<{ at: string; state: 'completed' | 'missed' | 'planned' | null }>;
};

export async function readAdherenceScreen(): Promise<AdherenceScreen> {
  const { timeZone } = getConfig();
  await ensureDemoIsToday(timeZone);
  const now = new Date();
  const longest = Math.max(...ADHERENCE_WINDOWS);
  const from = new Date(now.getTime() - (longest + 1) * 86_400_000);
  const to = new Date(now.getTime() + 86_400_000);
  const sessions = await readSessionsBetween(from, to);

  const todayKey = windowDays(now, 1, timeZone)[0];
  const dayOf = (session: SessionView) => windowDays(session.plannedFor, 1, timeZone)[0];
  const today = sessions.find((session) => dayOf(session) === todayKey) ?? null;

  const week = windowDays(now, 7, timeZone).map((at) => {
    const session = sessions.find((entry) => dayOf(entry) === at);
    return { at, state: session ? session.state : null };
  });

  return {
    today,
    windows: ADHERENCE_WINDOWS.map((days) => adherence(sessions, now, days, timeZone)),
    week,
  };
}
