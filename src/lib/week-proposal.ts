import { MOVEMENTS, isFullBody, movementOf } from '@/lib/catalogue';
import { dayAfter, instantOnDay, weekdayIndex } from '@/lib/local-time';
import { type LengthFact, sessionLengthFact } from '@/lib/training-rules';

/**
 * The proposed week.
 *
 * Three to five sessions, two or three of them full body, at least 48 hours
 * between two sessions that load the same muscle with resistance. Every one
 * carries the cause it was placed on, and a cause names the input it acted on:
 * "you finished a session on 3 of the last 4 Mondays" is a reason, and
 * "recommended" is a badge. The panel's second finding turns on that difference
 * and it is the difference between a plan the owner trusts and a plan he
 * overrides once and then ignores.
 *
 * NOTHING HERE WRITES AND NOTHING HERE COMMITS A WEEK. It returns rows. Each
 * one is accepted, edited or rejected on its own, and rejecting one leaves the
 * others exactly where they are, which is F72's second half and DESIGN.md
 * section 5's first decision.
 *
 * THE CAUSE IS A KEY AND ITS DATA, never a sentence. This module is in the
 * shipped tree, so a sentence written here would be product copy with no
 * catalogue key. The writer renders it from `strings.train.cause` and stores
 * the rendered line beside the row, frozen at write time, exactly the way
 * `dedup_reason` is stored in the provenance spine.
 */

/** 2 to 3 full-body sessions a week, [A] graded, ACSM 2026. */
export const SESSIONS_MIN = 3;
export const SESSIONS_MAX = 5;
export const FULL_BODY_MIN = 2;
export const FULL_BODY_MAX = 3;

/** At least 48 hours between sessions for the same muscle. [A] graded. */
export const SAME_MUSCLE_HOURS = 48;

/** At least 7,000 steps a day, [B] graded. The walk is proposed under this. */
export const STEP_FLOOR = 7000;

/** 150 minutes a week of moderate work, or 75 vigorous. Garber 2011, Table 2. */
export const WEEKLY_MODERATE_MINUTES = 150;

/** How many weeks of history the weekday preference is read over. */
export const HISTORY_WEEKS = 4;

export type SessionKind = 'strength' | 'cardio' | 'intervals' | 'walk';

export type CauseKey =
  | 'mostCompletedDay'
  | 'spacedFromPrevious'
  | 'lowSteps'
  | 'noHistoryYet'
  | 'weeklyCardio'
  | 'painDeload';

export type Cause = { key: CauseKey; params: Record<string, string | number> };

export type ProposedSession = {
  /** Position in the week, 0 first. Stable across a rejection. */
  index: number;
  dayKey: string;
  plannedFor: Date;
  durationMinutes: number;
  kind: SessionKind;
  place: 'home' | 'gym' | 'outdoors';
  movementIds: string[];
  fullBody: boolean;
  cause: Cause;
  /** The plain fact about this session's length, or null with no history. */
  length: LengthFact | null;
};

export type WeekInput = {
  /** The Monday the proposed week starts on, as a day key. */
  weekStart: string;
  timeZone: string;
  /** Sessions already completed, for the weekday preference and the length window. */
  history: Array<{ at: Date; minutes: number; completed: boolean; muscles: string[] }>;
  /** The last seven days of step readings that exist. An absent day is absent. */
  steps: Array<{ at: Date; value: number }>;
  /** The site reported twice running, or null. Deloads and never advances. */
  repeatedPainSite: string | null;
  now: Date;
};

/** The hours each kind is placed at, from screen 06's own slots. */
const SLOT = {
  strength: { hour: 18, minute: 45 },
  cardio: { hour: 19, minute: 0 },
  intervals: { hour: 7, minute: 15 },
  walk: { hour: 10, minute: 30 },
};

const PLACE: Record<SessionKind, ProposedSession['place']> = {
  strength: 'home',
  cardio: 'gym',
  intervals: 'gym',
  walk: 'outdoors',
};

/**
 * How long a session takes, computed from what is in it rather than typed.
 *
 * A rep set is counted at 40 seconds of work, which is 10 to 15 repetitions at
 * the two-counts-down-one-up tempo the cue text asks for and inside the 0.5 to
 * 8 second per repetition band Schoenfeld 2015 found neutral. Rest is the
 * movement's own, never under 60 seconds. Rounded to five minutes, because a
 * session is a slot in a day and not a stopwatch reading.
 */
const WORK_SECONDS_PER_REP_SET = 40;
const WARM_UP_MINUTES = 5;

export function durationOf(movementIds: string[]): number {
  let seconds = WARM_UP_MINUTES * 60;
  for (const id of movementIds) {
    const movement = movementOf(id);
    if (!movement) continue;
    const work =
      movement.unit === 'minute'
        ? movement.high * 60
        : movement.unit === 'second'
          ? movement.high
          : WORK_SECONDS_PER_REP_SET;
    seconds += movement.sets * work + Math.max(0, movement.sets - 1) * movement.restSeconds;
  }
  return Math.max(5, Math.round(seconds / 60 / 5) * 5);
}

/**
 * The muscles a session loads WITH RESISTANCE, which is what the 48-hour rule
 * is about. A bike ride uses the quadriceps and does not train them, so cardio
 * does not lock a leg day out of the following morning. Scoped here once, so
 * the proposer and the test that grades it read the same rule.
 */
export function spacingMuscles(movementIds: string[]): string[] {
  const loaded = new Set<string>();
  for (const id of movementIds) {
    const movement = movementOf(id);
    if (!movement || movement.modality !== 'resistance') continue;
    for (const muscle of movement.muscles) loaded.add(muscle);
  }
  return [...loaded];
}

function overlaps(left: string[], right: string[]): boolean {
  return left.some((muscle) => right.includes(muscle));
}

/**
 * A full-body set, rotated so two sessions in one week are not the same five
 * movements. One from each of the five patterns, which is what makes it full
 * body by construction rather than by a label.
 */
export function fullBodySet(rotation: number): string[] {
  const patterns = ['push', 'squat', 'hinge', 'back', 'core'];
  const picked: string[] = [];
  for (const pattern of patterns) {
    const inPattern = MOVEMENTS.filter(
      (movement) =>
        movement.pattern === pattern &&
        movement.modality === 'resistance' &&
        movement.equipment.every((item) => item === 'mat' || item === 'chair' || item === 'step'),
    ).sort((left, right) => left.step - right.step || left.id.localeCompare(right.id));
    if (inPattern.length === 0) continue;
    // The middle of the ladder, moved by the rotation. A beginner's first
    // session is not the easiest movement in the catalogue and not the hardest.
    const start = Math.min(1, inPattern.length - 1);
    picked.push(inPattern[(start + rotation) % inPattern.length].id);
  }
  return picked;
}

const CARDIO_SET = ['treadmill-walk'];
const INTERVAL_SET = ['treadmill-intervals'];
const WALK_SET = ['recovery-walk'];

/** How many of the last four weeks' sessions were completed on each weekday. */
export function completionsByWeekday(input: WeekInput): number[] {
  const counts = new Array(7).fill(0);
  const from = input.now.getTime() - HISTORY_WEEKS * 7 * 86_400_000;
  for (const session of input.history) {
    if (!session.completed || session.at.getTime() < from) continue;
    counts[weekdayIndex(session.at, input.timeZone)] += 1;
  }
  return counts;
}

/**
 * The week.
 *
 * Two full-body sessions and one cardio session are the floor, which is the
 * guideline's own shape: 2 to 3 full body a week [A], plus 150 minutes of
 * moderate aerobic work. A third full-body session is added when the owner has
 * been completing three a week, and a walk when his steps have been under the
 * floor, and neither is added past five.
 */
export function proposeWeek(input: WeekInput): ProposedSession[] {
  const counts = completionsByWeekday(input);
  const hasHistory = counts.some((count) => count > 0);
  // Best days first, ties broken by the earliest weekday so a week with no
  // history is Monday, Wednesday, Friday rather than an arbitrary shuffle.
  const preference = counts
    .map((count, weekday) => ({ count, weekday }))
    .sort((left, right) => right.count - left.count || left.weekday - right.weekday);

  const completedPerWeek = input.history.filter(
    (session) => session.completed && session.at.getTime() >= input.now.getTime() - HISTORY_WEEKS * 7 * 86_400_000,
  ).length / HISTORY_WEEKS;

  const lowStepDays = input.steps.filter((day) => day.value < STEP_FLOOR).length;

  const wanted: Array<{ kind: SessionKind; movementIds: string[] }> = [
    { kind: 'strength', movementIds: fullBodySet(0) },
    { kind: 'strength', movementIds: fullBodySet(1) },
    { kind: 'cardio', movementIds: CARDIO_SET },
  ];
  if (completedPerWeek >= 3 && wanted.length < SESSIONS_MAX) {
    wanted.push({ kind: 'strength', movementIds: fullBodySet(2) });
  }
  if (lowStepDays >= 3 && wanted.length < SESSIONS_MAX) {
    wanted.push({ kind: 'walk', movementIds: WALK_SET });
  }
  if (wanted.length < SESSIONS_MIN) wanted.push({ kind: 'intervals', movementIds: INTERVAL_SET });

  // The tail of last week, so Monday is not placed 12 hours after Sunday's
  // session when both load the legs.
  const placed: Array<{ at: Date; muscles: string[] }> = input.history
    .filter((session) => session.at.getTime() >= input.now.getTime() - 7 * 86_400_000)
    .map((session) => ({ at: session.at, muscles: session.muscles }));

  const used = new Set<number>();
  const proposals: ProposedSession[] = [];

  for (const want of wanted) {
    const muscles = spacingMuscles(want.movementIds);
    const slot = SLOT[want.kind];
    let chosen: { weekday: number; at: Date; spacedFrom: Date | null } | null = null;

    for (const candidate of preference) {
      if (used.has(candidate.weekday)) continue;
      const dayKey = dayAfter(input.weekStart, candidate.weekday);
      const at = instantOnDay(dayKey, slot.hour, slot.minute, input.timeZone);
      const tooClose = placed.find(
        (session) =>
          overlaps(muscles, session.muscles) &&
          Math.abs(at.getTime() - session.at.getTime()) < SAME_MUSCLE_HOURS * 3_600_000,
      );
      if (tooClose) continue;
      chosen = { weekday: candidate.weekday, at, spacedFrom: null };
      break;
    }

    // Nothing in the week is far enough from what is already placed. Take the
    // first free day that is at least 48 hours after the closest conflict and
    // say so, rather than dropping the session silently.
    if (!chosen) {
      for (const candidate of preference) {
        if (used.has(candidate.weekday)) continue;
        const dayKey = dayAfter(input.weekStart, candidate.weekday);
        const at = instantOnDay(dayKey, slot.hour, slot.minute, input.timeZone);
        const conflicts = placed.filter((session) => overlaps(muscles, session.muscles));
        const nearest = conflicts
          .slice()
          .sort(
            (left, right) =>
              Math.abs(at.getTime() - left.at.getTime()) - Math.abs(at.getTime() - right.at.getTime()),
          )[0];
        if (!nearest) continue;
        if (at.getTime() - nearest.at.getTime() >= SAME_MUSCLE_HOURS * 3_600_000) {
          chosen = { weekday: candidate.weekday, at, spacedFrom: nearest.at };
          break;
        }
      }
    }
    if (!chosen) continue;

    used.add(chosen.weekday);
    placed.push({ at: chosen.at, muscles });

    const durationMinutes = durationOf(want.movementIds);
    const cause: Cause =
      want.kind === 'walk'
        ? { key: 'lowSteps', params: { lowDays: lowStepDays, ofDays: input.steps.length, floor: STEP_FLOOR } }
        : want.kind === 'cardio' || want.kind === 'intervals'
          ? { key: 'weeklyCardio', params: { minutes: WEEKLY_MODERATE_MINUTES } }
          : chosen.spacedFrom
            ? { key: 'spacedFromPrevious', params: { hours: SAME_MUSCLE_HOURS, at: chosen.spacedFrom.toISOString() } }
            : hasHistory
              ? {
                  key: 'mostCompletedDay',
                  params: { done: counts[chosen.weekday], weeks: HISTORY_WEEKS, weekday: chosen.weekday },
                }
              : { key: 'noHistoryYet', params: { sessions: SESSIONS_MIN } };

    proposals.push({
      index: proposals.length,
      dayKey: dayAfter(input.weekStart, chosen.weekday),
      plannedFor: chosen.at,
      durationMinutes,
      kind: want.kind,
      place: PLACE[want.kind],
      movementIds: want.movementIds,
      fullBody: isFullBody(want.movementIds),
      cause: input.repeatedPainSite && want.kind === 'strength'
        ? { key: 'painDeload', params: { site: input.repeatedPainSite } }
        : cause,
      length: sessionLengthFact(
        durationMinutes,
        input.history.map((session) => ({ minutes: session.minutes, at: session.at })),
        input.now,
      ),
    });
  }

  return proposals
    .sort((left, right) => left.plannedFor.getTime() - right.plannedFor.getTime())
    .map((proposal, index) => ({ ...proposal, index }));
}

/**
 * Does a proposed week hold to the spacing rule. Written as a check rather than
 * trusted to the placement above, because the test that grades F72 has to be
 * able to walk a generated week and say which two rows are too close.
 */
export function spacingProblems(
  sessions: Array<{ plannedFor: Date; movementIds: string[] }>,
): Array<{ first: Date; second: Date; muscles: string[] }> {
  const problems: Array<{ first: Date; second: Date; muscles: string[] }> = [];
  const ordered = [...sessions].sort((left, right) => left.plannedFor.getTime() - right.plannedFor.getTime());
  for (let index = 0; index < ordered.length; index += 1) {
    for (let other = index + 1; other < ordered.length; other += 1) {
      const left = spacingMuscles(ordered[index].movementIds);
      const right = spacingMuscles(ordered[other].movementIds);
      const shared = left.filter((muscle) => right.includes(muscle));
      if (shared.length === 0) continue;
      const apart = ordered[other].plannedFor.getTime() - ordered[index].plannedFor.getTime();
      if (apart < SAME_MUSCLE_HOURS * 3_600_000) {
        problems.push({ first: ordered[index].plannedFor, second: ordered[other].plannedFor, muscles: shared });
      }
    }
  }
  return problems;
}
