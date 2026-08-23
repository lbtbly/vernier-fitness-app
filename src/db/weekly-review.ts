import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { getDb } from './client';
import { ensureDemoIsToday } from './demo';
import { readGoal } from './goal';
import { readPlan, readPlanMeals, readTarget, tallyMeals } from './nutrition';
import { reviewDecision, sessionRun, setLog, weeklyReview } from './schema';
import { readSessionsBetween } from './sessions';
import { readListForPlan } from './shopping';
import { readProposals } from './training';
import { readFreshness, readTrends } from './trends';
import { getConfig } from '@/lib/config';
import { dayAfter, instantOnDay, localDayKey, mondayOf } from '@/lib/local-time';
import { dailySeries } from '@/lib/trend';
import {
  type ProposalBlockId,
  type ReviewFacts,
  type WeeklyReviewView,
  assembleReview,
} from '@/lib/weekly-review';

/**
 * The review, read back off the tables that already hold the week.
 *
 * NOTHING ABOUT A WEEK IS STORED TWICE. `weekly_review` is a ledger row saying
 * the period produced a review and what became of its email; every figure on
 * the screen is computed here, on every read, from `measurement`,
 * `planned_session`, `set_log`, `meal_plan`, `nutrition_target` and
 * `session_proposal`. A summary model would be a second copy of the same facts
 * that could disagree with Health about the same morning, and it would take a
 * migration to correct a number that a correction has already corrected.
 *
 * Slices 5, 6, 8 and 9 own those tables. This reads them and adds none of its
 * own.
 */

export const WEEKLY_REVIEW_JOB = 'weekly_review';

export type WeeklyReviewRow = typeof weeklyReview.$inferSelect;

/** The Monday of the week a Sunday-evening review looks back at. */
export function reviewedWeekOf(now: Date, timeZone: string): string {
  return mondayOf(localDayKey(now, timeZone), timeZone);
}

/** Seven day keys, Monday first. */
function weekKeys(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => dayAfter(weekStart, index));
}

/**
 * The facts the assembler works from, read in one pass.
 *
 * The window is fourteen days rather than seven because the week's own change
 * is stated against the week before it, and a seven-day read has nothing to
 * compare against. `boundsOf` inside `readTrends` widens by a day at each end
 * so a reading taken at 23:50 in a zone ahead of UTC lands inside its own
 * calendar day, which is the same care `dailySeries` takes.
 */
export async function readReviewFacts(weekStart: string): Promise<ReviewFacts> {
  const { timeZone } = getConfig();
  // A demonstration install extends its own series before anything reads it,
  // the same call every trend screen makes for the same reason.
  await ensureDemoIsToday(timeZone);

  const keys = weekKeys(weekStart);
  const priorKeys = weekKeys(dayAfter(weekStart, -7));
  const weekEndInstant = instantOnDay(dayAfter(weekStart, 6), 23, 59, timeZone);
  const weekStartInstant = instantOnDay(weekStart, 0, 0, timeZone);
  const nextWeekStart = dayAfter(weekStart, 7);

  const [trends, goal, sessions, freshness, target] = await Promise.all([
    readTrends(['weight', 'waist', 'steps', 'sleep_minutes'], weekEndInstant, 14),
    readGoal(),
    readSessionsBetween(weekStartInstant, weekEndInstant),
    readFreshness(new Date()),
    readTarget(),
  ]);

  const db = getDb();
  // Sets logged inside the week, through the run that logged them, so a set
  // recorded late still counts against the session it belonged to.
  const sets = await db
    .select({ movementId: setLog.movementId })
    .from(setLog)
    .innerJoin(sessionRun, eq(sessionRun.id, setLog.runId))
    .where(and(gte(setLog.completedAt, weekStartInstant), lte(setLog.completedAt, weekEndInstant)))
    .orderBy(asc(setLog.completedAt));

  const plan = await readPlan(weekStartInstant);
  const planMeals = plan ? await readPlanMeals(plan.id) : [];
  const tally = tallyMeals(planMeals);

  const nextPlan = await readPlan(instantOnDay(nextWeekStart, 0, 0, timeZone));
  const nextProposals = await readProposals(nextWeekStart);
  const nextList = nextPlan ? await readListForPlan(nextPlan.id) : null;
  const decisions = await readDecisions(nextWeekStart);

  const accepted = nextProposals.filter((proposal) => proposal.state !== 'rejected');

  return {
    weekStart,
    timeZone,
    generatedAt: null,
    weightDays: dailySeries(trends.get('weight') ?? [], keys, timeZone),
    priorWeightDays: dailySeries(trends.get('weight') ?? [], priorKeys, timeZone),
    waistDays: dailySeries(trends.get('waist') ?? [], keys, timeZone),
    priorWaistDays: dailySeries(trends.get('waist') ?? [], priorKeys, timeZone),
    goal,
    sessions: sessions.map((session) => ({
      id: session.id,
      plannedFor: session.plannedFor,
      state: session.state,
      title: session.title,
      cause: session.cause,
    })),
    stepDays: dailySeries(trends.get('steps') ?? [], keys, timeZone),
    sleepDays: dailySeries(trends.get('sleep_minutes') ?? [], keys, timeZone),
    sets,
    meals: plan ? { decided: tally.accepted + tally.edited, planned: planMeals.length } : null,
    kcalTarget: target?.kcalTarget ?? null,
    staleSources: freshness
      .filter((source) => source.stale)
      .map((source) => ({ source: source.source, lastAt: source.lastAt })),
    proposal: {
      training:
        accepted.length === 0
          ? null
          : {
              sessions: accepted.length,
              minutes: accepted.reduce((sum, proposal) => sum + proposal.durationMinutes, 0),
              cause: accepted[0]?.cause ?? null,
            },
      nutrition: nextPlan ? { kcalTarget: nextPlan.kcalTarget, cause: null } : null,
      shopping: nextList
        ? {
            items: nextList.items.filter((item) => !item.removed).length,
            deducted: nextList.items.filter((item) => item.deduction !== 'none').length,
            cause: null,
          }
        : null,
      decisions,
    },
  };
}

/** The three block decisions for a week, defaulting to undecided. */
export async function readDecisions(
  weekStart: string,
): Promise<Record<ProposalBlockId, 'proposed' | 'accepted' | 'rejected'>> {
  const db = getDb();
  const rows = await db
    .select()
    .from(reviewDecision)
    .where(eq(reviewDecision.weekStart, weekStart));
  const decisions: Record<ProposalBlockId, 'proposed' | 'accepted' | 'rejected'> = {
    training: 'proposed',
    nutrition: 'proposed',
    shopping: 'proposed',
  };
  for (const row of rows) {
    if (row.block === 'training' || row.block === 'nutrition' || row.block === 'shopping') {
      decisions[row.block] = row.state as 'proposed' | 'accepted' | 'rejected';
    }
  }
  return decisions;
}

/**
 * One block, decided on its own. There is no route that decides three, which is
 * DESIGN.md section 5's first decision and the reason this takes one id.
 */
export async function decideBlock(
  weekStart: string,
  block: ProposalBlockId,
  state: 'accepted' | 'rejected',
): Promise<Record<ProposalBlockId, 'proposed' | 'accepted' | 'rejected'>> {
  const db = getDb();
  await db
    .insert(reviewDecision)
    .values({ id: crypto.randomUUID(), weekStart, block, state, decidedAt: new Date() })
    .onConflictDoUpdate({
      target: [reviewDecision.weekStart, reviewDecision.block],
      set: { state, decidedAt: new Date() },
    });
  return readDecisions(weekStart);
}

/** The ledger row for a week, when the Sunday run has made one. */
export async function readReviewRow(weekStart: string): Promise<WeeklyReviewRow | null> {
  const db = getDb();
  const [row] = await db.select().from(weeklyReview).where(eq(weeklyReview.weekStart, weekStart));
  return row ?? null;
}

export async function readLatestReviewRow(): Promise<WeeklyReviewRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(weeklyReview)
    .orderBy(desc(weeklyReview.generatedAt))
    .limit(1);
  return row ?? null;
}

/**
 * Writes the ledger row for a week, once.
 *
 * `weekStart` is unique, so "one plan per period" is enforced by Postgres. A
 * second call for the same week returns the row that is already there and
 * writes nothing, which is what makes the whole Sunday run safe to retry.
 */
export async function recordReview(input: {
  weekStart: string;
  periodStart: string;
  emailState: 'preview' | 'sent' | 'failed';
  emailDetail: string;
}): Promise<{ row: WeeklyReviewRow; created: boolean }> {
  const db = getDb();
  const [written] = await db
    .insert(weeklyReview)
    .values({
      id: crypto.randomUUID(),
      weekStart: input.weekStart,
      periodStart: input.periodStart,
      emailState: input.emailState,
      emailAt: input.emailState === 'sent' ? new Date() : null,
      emailDetail: input.emailDetail,
    })
    .onConflictDoNothing({ target: weeklyReview.weekStart })
    .returning();
  if (written) return { row: written, created: true };
  const existing = await readReviewRow(input.weekStart);
  return { row: existing!, created: false };
}

/** The whole review for a week: the facts, assembled, with the ledger's date on it. */
export async function readWeeklyReview(weekStart: string): Promise<WeeklyReviewView> {
  const [facts, row] = await Promise.all([readReviewFacts(weekStart), readReviewRow(weekStart)]);
  return assembleReview({ ...facts, generatedAt: row?.generatedAt ?? null });
}
