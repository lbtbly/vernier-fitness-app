import { dayLabel, formatNumber, longDayLabel } from '@/lib/format';
import { dayAfter } from '@/lib/local-time';
import { sleepLabel, sourceLabel } from '@/lib/display';
import { strings } from '@/lib/strings';
import {
  AVERAGE_WINDOW,
  type Day,
  type Goal,
  type SessionState,
  averageOver,
  goalValueOn,
} from '@/lib/trend';

/**
 * The week, read back. Nine sections, no score, and no colour on anything the
 * owner did or did not do.
 *
 * THE PANEL'S FINDING IS THE SPECIFICATION HERE. Two missed sessions because
 * Thursday ran late is Tuesday, not a failure state. So this module has no way
 * to express a judgement: the row type carries `tone`, `tone` has two settings
 * and neither of them is a warning, and the note beside a row carries a
 * separate `noteTone` whose warning value is reserved for DATA that is out of
 * date. A session that did not happen is a fact about a week and gets neither.
 * `tests/unit/review-copy.test.ts` walks the whole output of this module
 * against the denylist and asserts that rule over the adherence section.
 *
 * IT INVENTS NOTHING AND IT SMOOTHS NOTHING. Every figure comes from
 * `measurement`, `planned_session`, `set_log`, `meal_plan` and
 * `nutrition_target` through `src/db/weekly-review.ts`, and a figure computed
 * over a short window states the count beside it, which is DESIGN.md section
 * 5's second decision applied to prose rather than to a chart. A week with no
 * readings in it says so; it does not print a zero.
 *
 * Pure, so the whole review is assembled from a fixture in the unit suite,
 * including the two-missed-sessions week that the denylist exists for.
 */

export const REVIEW_SECTION_IDS = [
  'body',
  'adherence',
  'activity',
  'sleep',
  'training',
  'nutrition',
  'wentWell',
  'wasHard',
  'proposal',
] as const;

export type ReviewSectionId = (typeof REVIEW_SECTION_IDS)[number];

/** Nine, stated as a number, because F118 counts them. */
export const REVIEW_SECTION_COUNT = REVIEW_SECTION_IDS.length;

export type ReviewRow = {
  id: string;
  label: string;
  /** The formatted figure, or null when there is nothing to print. */
  value: string | null;
  /** What a null value means, in words. Absence is drawn, never smoothed. */
  absence: string | null;
  note: string | null;
  /**
   * `good` is a trend going the way the owner wants and nothing else. There is
   * no third setting, so no code path anywhere can colour a session.
   */
  tone: 'neutral' | 'good';
  /** `warn` means the DATA is out of date or short. Never the person. */
  noteTone: 'neutral' | 'warn';
};

export type ReviewSection = {
  id: ReviewSectionId;
  title: string;
  rows: ReviewRow[];
  paragraphs: string[];
};

export type ProposalBlockId = 'training' | 'nutrition' | 'shopping';

export type ProposalBlock = {
  id: ProposalBlockId;
  label: string;
  headline: string;
  detail: string | null;
  cause: string | null;
  state: 'proposed' | 'accepted' | 'rejected';
};

export type WeeklyReviewView = {
  weekStart: string;
  weekEnd: string;
  /** The Monday next week starts on, which the proposal is for. */
  nextWeekStart: string;
  generatedAt: string | null;
  sections: ReviewSection[];
  proposal: ProposalBlock[];
  /** The one banner, when a source is out of date. Null when nothing is. */
  fix: { title: string; body: string } | null;
};

export type ReviewSessionFact = {
  id: string;
  plannedFor: Date;
  state: SessionState;
  title: string;
  cause: string;
};

export type ReviewFacts = {
  /** The Monday of the week being reviewed, as a day key. */
  weekStart: string;
  timeZone: string;
  generatedAt: Date | null;
  /** Seven days, Monday first, for the week under review. */
  weightDays: Day[];
  /** The seven days before those, so a change over the week can be stated. */
  priorWeightDays: Day[];
  waistDays: Day[];
  priorWaistDays: Day[];
  goal: Goal | null;
  sessions: ReviewSessionFact[];
  stepDays: Day[];
  sleepDays: Day[];
  sets: { movementId: string }[];
  meals: { decided: number; planned: number } | null;
  kcalTarget: number | null;
  /** Sources with nothing recent. `lastAt` null means nothing has ever arrived. */
  staleSources: Array<{ source: string; lastAt: Date | null }>;
  proposal: {
    training: { sessions: number; minutes: number; cause: string | null } | null;
    nutrition: { kcalTarget: number; cause: string | null } | null;
    shopping: { items: number; deducted: number; cause: string | null } | null;
    decisions: Record<ProposalBlockId, 'proposed' | 'accepted' | 'rejected'>;
  };
};

/** Days in a week. Named, because it is a denominator on four rows. */
const WEEK_DAYS = 7;

/** A difference under this reads as being on the line rather than beside it. */
const ON_THE_LINE = 0.05;

function readingsIn(days: Day[]): Day[] {
  return days.filter((day) => day.reading);
}

function meanOf(days: Day[]): number | null {
  const present = readingsIn(days);
  if (present.length === 0) return null;
  const total = present.reduce((sum, day) => sum + (day.reading?.value ?? 0), 0);
  return total / present.length;
}

function lastOf(days: Day[]): Day | null {
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index].reading) return days[index];
  }
  return null;
}

/**
 * A row whose figure came from fewer than seven days says so, in its own note.
 *
 * DESIGN.md: any figure computed on a short window states the count next to it.
 * The note is `warn` because the DATA is short, which is what warn is for, and
 * the figure itself keeps a neutral tone because a thin week is not a verdict.
 */
function shortWindowNote(have: number, of: number): { note: string; noteTone: 'warn' } | null {
  if (have >= of) return null;
  return { note: strings.review.shortWindow(have, of), noteTone: 'warn' };
}

function bodySection(facts: ReviewFacts): ReviewSection {
  const rows: ReviewRow[] = [];

  const average = averageOver(facts.weightDays, facts.weightDays.length - 1, AVERAGE_WINDOW);
  const priorAverage = averageOver(
    facts.priorWeightDays,
    facts.priorWeightDays.length - 1,
    AVERAGE_WINDOW,
  );
  const weightPresent = readingsIn(facts.weightDays).length;

  /*
   * `mean` and not `value`. They are two different questions and trend.ts keeps
   * them apart on purpose: `value` is what may be DRAWN, and is null under five
   * days because a line through a three-day window reads as a week. `mean` is
   * what may be COMPUTED, and is real whatever the window held, as long as the
   * count is stated beside it. This is prose, not a chart, so it is `mean` with
   * its count.
   */
  if (average?.mean !== null && average !== null) {
    const change =
      priorAverage && priorAverage.mean !== null ? average.mean - priorAverage.mean : null;
    const short = shortWindowNote(average.count, AVERAGE_WINDOW);
    rows.push({
      id: 'weight',
      label: strings.review.weightAverage,
      value: `${formatNumber(average.mean, 'kg')} kg`,
      absence: null,
      note:
        short?.note ??
        (change === null ? null : strings.review.weightChange(formatNumber(change, 'kg'))),
      // Toward the goal is the only thing that earns a colour on this screen.
      tone: change !== null && facts.goal ? toneForChange(change, facts.goal) : 'neutral',
      noteTone: short ? 'warn' : 'neutral',
    });
  } else {
    rows.push({
      id: 'weight',
      label: strings.review.weightAverage,
      value: null,
      absence: strings.review.noReading,
      note: null,
      tone: 'neutral',
      noteTone: 'neutral',
    });
  }

  if (facts.goal) {
    const line = goalValueOn(facts.goal, new Date(`${lastDayOf(facts.weekStart)}T12:00:00Z`));
    if (line !== null && average?.mean != null) {
      const delta = average.mean - line;
      rows.push({
        id: 'goal-line',
        label: strings.goal.label,
        value: `${formatNumber(facts.goal.targetValue, facts.goal.unit)} ${facts.goal.unit}`,
        absence: null,
        note: goalNote(delta, facts.goal),
        tone: 'neutral',
        noteTone: 'neutral',
      });
    }
  }

  const waist = lastOf(facts.waistDays);
  const priorWaist = lastOf(facts.priorWaistDays);
  if (waist?.reading) {
    const change =
      priorWaist?.reading ? waist.reading.value - priorWaist.reading.value : null;
    rows.push({
      id: 'waist',
      label: strings.review.waist,
      value: `${formatNumber(waist.reading.value, 'cm')} cm`,
      absence: null,
      note: strings.review.waistMeasured(longDayLabel(waist.at)),
      tone: change !== null && change < 0 ? 'good' : 'neutral',
      noteTone: 'neutral',
    });
  } else {
    rows.push({
      id: 'waist',
      label: strings.review.waist,
      value: null,
      absence: strings.review.noReading,
      note: null,
      tone: 'neutral',
      noteTone: 'neutral',
    });
  }

  const short = shortWindowNote(weightPresent, WEEK_DAYS);
  return {
    id: 'body',
    title: strings.review.sections.body,
    rows,
    paragraphs: short ? [short.note] : [],
  };
}

/** Down towards a target below you, or up towards one above you. Nothing else. */
function toneForChange(change: number, goal: Goal): 'neutral' | 'good' {
  if (Math.abs(change) < ON_THE_LINE) return 'neutral';
  const wantsDown = goal.targetValue < goal.startValue;
  return wantsDown === change < 0 ? 'good' : 'neutral';
}

function goalNote(delta: number, goal: Goal): string {
  const target = formatNumber(goal.targetValue, goal.unit);
  const when = longDayLabel(goal.targetAt.toISOString().slice(0, 10));
  if (Math.abs(delta) < ON_THE_LINE) return strings.goal.onTheLine(target, goal.unit, when);
  const size = formatNumber(Math.abs(delta), goal.unit);
  return delta < 0
    ? strings.goal.below(size, goal.unit, target, when)
    : strings.goal.above(size, goal.unit, target, when);
}

function lastDayOf(weekStart: string): string {
  return dayAfter(weekStart, 6);
}

/**
 * Sessions, and the one section in this file where the rule about colour is not
 * a convention but a constraint: every row here is built with `tone: 'neutral'`
 * and `noteTone: 'neutral'`, written out literally so a reader can see it, and
 * a test asserts it over a week with two sessions that did not happen.
 */
function adherenceSection(facts: ReviewFacts): ReviewSection {
  const planned = facts.sessions.length;
  const completed = facts.sessions.filter((session) => session.state === 'completed').length;
  const undone = facts.sessions.filter((session) => session.state === 'missed');

  const rows: ReviewRow[] = [
    planned === 0
      ? {
          id: 'sessions',
          label: strings.review.sections.adherence,
          value: null,
          absence: strings.review.sessionsNone,
          note: null,
          tone: 'neutral',
          noteTone: 'neutral',
        }
      : {
          id: 'sessions',
          label: strings.review.sections.adherence,
          value: strings.review.sessionsCount(completed, planned),
          absence: null,
          note: null,
          tone: 'neutral',
          noteTone: 'neutral',
        },
  ];

  for (const session of undone) {
    const day = longDayLabel(session.plannedFor.toISOString().slice(0, 10));
    rows.push({
      id: `session-${session.id}`,
      label: session.title,
      value: null,
      absence:
        session.cause.trim() === ''
          ? strings.review.sessionNotDone(day)
          : strings.review.sessionNotDoneBecause(day, session.cause),
      note: null,
      tone: 'neutral',
      noteTone: 'neutral',
    });
  }

  return { id: 'adherence', title: strings.review.sections.adherence, rows, paragraphs: [] };
}

function dailyAverageSection(
  id: 'activity' | 'sleep',
  days: Day[],
  label: string,
  render: (value: number) => string,
): ReviewSection {
  const present = readingsIn(days).length;
  const mean = meanOf(days);
  const short = shortWindowNote(present, WEEK_DAYS);
  const rows: ReviewRow[] =
    mean === null
      ? [
          {
            id,
            label,
            value: null,
            absence: strings.review.nothingRecorded,
            note: null,
            tone: 'neutral',
            noteTone: 'neutral',
          },
        ]
      : [
          {
            id,
            label,
            value: render(mean),
            absence: null,
            note: short?.note ?? null,
            tone: 'neutral',
            noteTone: short ? 'warn' : 'neutral',
          },
        ];
  return { id, title: strings.review.sections[id], rows, paragraphs: [] };
}

function trainingSection(facts: ReviewFacts): ReviewSection {
  const movements = new Set(facts.sets.map((set) => set.movementId)).size;
  const rows: ReviewRow[] =
    facts.sets.length === 0
      ? [
          {
            id: 'sets',
            label: strings.review.sections.training,
            value: null,
            absence: strings.review.noSets,
            note: null,
            tone: 'neutral',
            noteTone: 'neutral',
          },
        ]
      : [
          {
            id: 'sets',
            label: strings.review.sections.training,
            value: strings.review.setsLogged(facts.sets.length, movements),
            absence: null,
            note: null,
            tone: 'neutral',
            noteTone: 'neutral',
          },
        ];
  return { id: 'training', title: strings.review.sections.training, rows, paragraphs: [] };
}

function nutritionSection(facts: ReviewFacts): ReviewSection {
  const rows: ReviewRow[] = [];
  if (facts.meals === null) {
    rows.push({
      id: 'meals',
      label: strings.review.mealsDecided,
      value: null,
      absence: strings.review.noPlan,
      note: null,
      tone: 'neutral',
      noteTone: 'neutral',
    });
  } else {
    rows.push({
      id: 'meals',
      label: strings.review.mealsDecided,
      value: strings.review.mealsDecidedCount(facts.meals.decided, facts.meals.planned),
      absence: null,
      note: null,
      tone: 'neutral',
      noteTone: 'neutral',
    });
  }

  rows.push(
    facts.kcalTarget === null
      ? {
          id: 'target',
          label: strings.review.dailyTarget,
          value: null,
          absence: strings.review.noTarget,
          note: null,
          tone: 'neutral',
          noteTone: 'neutral',
        }
      : {
          id: 'target',
          label: strings.review.dailyTarget,
          value: strings.review.dailyTargetValue(formatNumber(facts.kcalTarget, 'kcal')),
          absence: null,
          note: null,
          tone: 'neutral',
          noteTone: 'neutral',
        },
  );

  return { id: 'nutrition', title: strings.review.sections.nutrition, rows, paragraphs: [] };
}

function wentWell(facts: ReviewFacts): string[] {
  const lines: string[] = [];
  const completed = facts.sessions.filter((session) => session.state === 'completed').length;
  if (completed > 0) lines.push(strings.review.wentWellSessions(completed));

  const average = averageOver(facts.weightDays, facts.weightDays.length - 1, AVERAGE_WINDOW);
  const priorAverage = averageOver(
    facts.priorWeightDays,
    facts.priorWeightDays.length - 1,
    AVERAGE_WINDOW,
  );
  if (average?.mean != null && priorAverage?.mean != null && facts.goal) {
    const change = average.mean - priorAverage.mean;
    if (toneForChange(change, facts.goal) === 'good') {
      lines.push(
        strings.review.wentWellWeightToward(
          formatNumber(Math.abs(change), 'kg'),
          formatNumber(facts.goal.targetValue, facts.goal.unit),
        ),
      );
    }
  }

  const waist = lastOf(facts.waistDays);
  if (waist) lines.push(strings.review.wentWellWaist(longDayLabel(waist.at)));
  if (facts.sets.length > 0) lines.push(strings.review.wentWellSets(facts.sets.length));

  return lines.length > 0 ? lines : [strings.review.wentWellNone];
}

function wasHard(facts: ReviewFacts): string[] {
  const lines: string[] = [];

  for (const session of facts.sessions.filter((entry) => entry.state === 'missed')) {
    const day = longDayLabel(session.plannedFor.toISOString().slice(0, 10));
    lines.push(
      session.cause.trim() === ''
        ? strings.review.wasHardSessionNoCause(day)
        : strings.review.wasHardSession(day, session.cause),
    );
  }

  for (const stale of facts.staleSources) {
    lines.push(
      strings.review.wasHardStale(
        sourceLabel(stale.source),
        stale.lastAt ? longDayLabel(stale.lastAt.toISOString().slice(0, 10)) : strings.review.noReading,
      ),
    );
  }

  const steps = readingsIn(facts.stepDays).length;
  if (steps > 0 && steps < WEEK_DAYS) {
    lines.push(strings.review.wasHardShortWindow(strings.review.steps, steps, WEEK_DAYS));
  }
  const sleep = readingsIn(facts.sleepDays).length;
  if (sleep > 0 && sleep < WEEK_DAYS) {
    lines.push(strings.review.wasHardShortWindow(strings.review.sleepNightly, sleep, WEEK_DAYS));
  }
  if (facts.meals === null) lines.push(strings.review.wasHardNoMenu);

  return lines.length > 0 ? lines : [strings.review.wasHardNone];
}

function proposalBlocks(facts: ReviewFacts): ProposalBlock[] {
  const { training, nutrition, shopping, decisions } = facts.proposal;
  return [
    {
      id: 'training',
      label: strings.review.blocks.training,
      headline: training
        ? strings.review.proposalTraining(training.sessions, training.minutes)
        : strings.review.proposalTrainingNone,
      detail: null,
      cause: training?.cause ?? null,
      state: decisions.training,
    },
    {
      id: 'nutrition',
      label: strings.review.blocks.nutrition,
      headline: nutrition
        ? strings.review.proposalNutrition(formatNumber(nutrition.kcalTarget, 'kcal'))
        : strings.review.proposalNutritionNone,
      detail: null,
      cause: nutrition?.cause ?? null,
      state: decisions.nutrition,
    },
    {
      id: 'shopping',
      label: strings.review.blocks.shopping,
      headline: shopping
        ? strings.review.proposalShopping(shopping.items, shopping.deducted)
        : strings.review.proposalShoppingNone,
      detail: null,
      cause: shopping?.cause ?? null,
      state: decisions.shopping,
    },
  ];
}

/**
 * The one banner, and it is about data rather than about the owner.
 *
 * The stalest source, named, with the one action that clears it. Null when
 * nothing is stale, because a banner that is always there is furniture.
 */
function fixBanner(facts: ReviewFacts): { title: string; body: string } | null {
  const [worst] = [...facts.staleSources].sort((left, right) => {
    const leftAt = left.lastAt?.getTime() ?? 0;
    const rightAt = right.lastAt?.getTime() ?? 0;
    return leftAt - rightAt;
  });
  if (!worst) return null;
  return {
    title: strings.review.fixTitle,
    body: strings.review.fixStale(
      sourceLabel(worst.source),
      worst.lastAt ? longDayLabel(worst.lastAt.toISOString().slice(0, 10)) : strings.review.noReading,
    ),
  };
}

export function assembleReview(facts: ReviewFacts): WeeklyReviewView {
  const sections: ReviewSection[] = [
    bodySection(facts),
    adherenceSection(facts),
    dailyAverageSection(
      'activity',
      facts.stepDays,
      strings.review.steps,
      (value) => strings.review.stepsDaily(formatNumber(value, 'step')),
    ),
    dailyAverageSection('sleep', facts.sleepDays, strings.review.sleepNightly, sleepLabel),
    trainingSection(facts),
    nutritionSection(facts),
    {
      id: 'wentWell',
      title: strings.review.sections.wentWell,
      rows: [],
      paragraphs: wentWell(facts),
    },
    { id: 'wasHard', title: strings.review.sections.wasHard, rows: [], paragraphs: wasHard(facts) },
    {
      id: 'proposal',
      title: strings.review.sections.proposal,
      rows: [],
      paragraphs: [strings.review.proposalNote],
    },
  ];

  return {
    weekStart: facts.weekStart,
    weekEnd: lastDayOf(facts.weekStart),
    nextWeekStart: dayAfter(facts.weekStart, 7),
    generatedAt: facts.generatedAt?.toISOString() ?? null,
    sections,
    proposal: proposalBlocks(facts),
    fix: fixBanner(facts),
  };
}

/** The week label a screen and an email both put at the top. */
export function weekLabel(review: WeeklyReviewView): string {
  return strings.review.weekOf(dayLabel(review.weekStart), dayLabel(review.weekEnd));
}
