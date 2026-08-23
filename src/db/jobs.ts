import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { getDb } from './client';
import { jobRun } from './schema';
import type { RunLedger } from '@/lib/job-runner';

/**
 * The run ledger. A period is claimed before any work is done, and the claim is
 * an insert that either wins or does nothing.
 *
 * THIS IS THE SAME MECHANISM AS src/db/idempotency.ts AND FOR THE SAME REASON.
 * There, the phone's outbox retries and two arrivals of one key must not both
 * write. Here, five cron ticks land inside one Sunday evening and two of them
 * must not both plan the week. In both cases the fix is that the claim is a
 * single statement Postgres arbitrates, taken BEFORE the work, rather than a
 * read followed by a write with a race in the middle.
 *
 * `periodStart` is a Paris local key such as `2026-10-25T20:00`, computed by
 * src/lib/schedule.ts and shaped by a CHECK constraint in
 * drizzle/pending/12-push.sql. A key derived from arithmetic on an instant
 * would not match that pattern and would be refused by the database rather
 * than quietly claiming a second period for one Sunday evening.
 */

export type JobRunRow = typeof jobRun.$inferSelect;

export type JobRunView = {
  id: string;
  jobName: string;
  periodStart: string;
  state: 'running' | 'done' | 'failed';
  attempt: number;
  claimedAt: string;
  finishedAt: string | null;
  detail: string;
};

export function toJobRunView(row: JobRunRow): JobRunView {
  return {
    id: row.id,
    jobName: row.jobName,
    periodStart: row.periodStart,
    state: row.state as JobRunView['state'],
    attempt: row.attempt,
    claimedAt: row.claimedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    detail: row.detail,
  };
}

/**
 * How long a run may hold its period before the next startup calls it failed.
 *
 * Twenty minutes. The Sunday run reads six tables, assembles a review, proposes
 * a week and sends one notification; anything past twenty minutes is a process
 * that is not coming back, and the container it was in has usually already been
 * restarted by then. It is deliberately generous: calling a slow run failed is
 * a second run of the same period, and doing nothing at all is a slot that is
 * wedged until somebody notices, which is worse.
 */
export const RUN_TIMEOUT_MINUTES = 20;

/**
 * How many times a period may be attempted after a failure.
 *
 * Three. A failed run does not block its period, which is F120's second half,
 * but a period that re-claims forever is a job that pushes the same broken
 * thing at the owner every five minutes. Three attempts, then the row stands as
 * the record that this period did not work, and the operator console reads it.
 */
export const MAX_ATTEMPTS = 3;

export type Claim =
  | { claimed: true; run: JobRunView }
  | { claimed: false; reason: 'taken' | 'done' | 'exhausted'; run: JobRunView | null };

/**
 * Takes the period, or says who has it.
 *
 * One statement. The insert wins on a period nobody has touched; the conflict
 * path takes it back only from a row that is already `failed` and has attempts
 * left, and `setWhere` is what makes that a condition Postgres evaluates rather
 * than a read this process did a moment ago and hopes is still true.
 *
 * A row in `running` is never taken, whatever its age. Stale runs are cleared
 * by `failStaleRuns` at startup, deliberately in a separate step, so "this run
 * has been going twenty minutes" is a decision made once at boot with the whole
 * picture rather than by whichever tick happened to notice.
 */
export async function claimPeriod(jobName: string, periodStart: string): Promise<Claim> {
  const db = getDb();
  const [claimed] = await db
    .insert(jobRun)
    .values({ id: crypto.randomUUID(), jobName, periodStart, state: 'running', attempt: 1 })
    .onConflictDoUpdate({
      target: [jobRun.jobName, jobRun.periodStart],
      set: {
        state: 'running',
        attempt: sql`${jobRun.attempt} + 1`,
        claimedAt: new Date(),
        finishedAt: null,
        detail: '',
      },
      setWhere: and(eq(jobRun.state, 'failed'), lt(jobRun.attempt, MAX_ATTEMPTS)),
    })
    .returning();

  if (claimed) return { claimed: true, run: toJobRunView(claimed) };

  const existing = await readPeriod(jobName, periodStart);
  if (!existing) return { claimed: false, reason: 'taken', run: null };
  if (existing.state === 'done') return { claimed: false, reason: 'done', run: existing };
  if (existing.state === 'failed') return { claimed: false, reason: 'exhausted', run: existing };
  return { claimed: false, reason: 'taken', run: existing };
}

export async function readPeriod(jobName: string, periodStart: string): Promise<JobRunView | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(jobRun)
    .where(and(eq(jobRun.jobName, jobName), eq(jobRun.periodStart, periodStart)));
  return row ? toJobRunView(row) : null;
}

export async function finishPeriod(
  id: string,
  state: 'done' | 'failed',
  detail: string,
): Promise<JobRunView | null> {
  const db = getDb();
  const [row] = await db
    .update(jobRun)
    .set({ state, finishedAt: new Date(), detail })
    .where(eq(jobRun.id, id))
    .returning();
  return row ? toJobRunView(row) : null;
}

/**
 * At startup: every run still marked running past its timeout becomes failed.
 *
 * WHY THIS IS A STARTUP STEP AND NOT A TICK. A process that was killed mid-run
 * left a `running` row and no process. Nothing in the running system can tell
 * that row from a run that is genuinely still going, because the only
 * difference is a process that no longer exists. A boot can: whatever was
 * running before this process started is not running now, because this is a
 * single-container install and the container is what restarted.
 *
 * The timeout is still applied on top of that, so a second app process inside
 * the same container cannot mark its sibling's live run as failed.
 */
/**
 * The reason a stale run carries, and it is a TOKEN rather than a sentence.
 *
 * `detail` is a machine field. Nothing renders it: a screen that needs to say
 * why a run failed reads this token and looks the words up in the catalogue,
 * the same way `integration.state` is a token and `src/lib/display.ts` chooses
 * the words for it. A sentence written into a column here would be a database
 * value speaking to a person with no key behind it, which is the defect C6 has
 * already caught twice in this repository.
 */
export const STALE_DETAIL = 'stale-timeout';

export async function failStaleRuns(
  now: Date,
  timeoutMinutes = RUN_TIMEOUT_MINUTES,
): Promise<JobRunView[]> {
  const db = getDb();
  const cutoff = new Date(now.getTime() - timeoutMinutes * 60_000);
  const rows = await db
    .update(jobRun)
    .set({ state: 'failed', finishedAt: now, detail: STALE_DETAIL })
    .where(and(eq(jobRun.state, 'running'), lt(jobRun.claimedAt, cutoff)))
    .returning();
  return rows.map(toJobRunView);
}

/** The ledger, newest first. What the operator console and the evidence read. */
export async function readRuns(jobName: string, limit = 20): Promise<JobRunView[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(jobRun)
    .where(eq(jobRun.jobName, jobName))
    .orderBy(desc(jobRun.claimedAt))
    .limit(limit);
  return rows.map(toJobRunView);
}

/** Every row, newest first, across every job. */
export async function readAllRuns(limit = 40): Promise<JobRunView[]> {
  const db = getDb();
  const rows = await db.select().from(jobRun).orderBy(desc(jobRun.claimedAt)).limit(limit);
  return rows.map(toJobRunView);
}

/**
 * The ledger `runPeriod` runs over, which is these two functions and nothing
 * else. Thin on purpose: what decides is in src/lib/job-runner.ts and is graded
 * with no database, and this is the part Postgres arbitrates.
 */
export function postgresLedger(): RunLedger {
  return {
    async claim(jobName, periodStart) {
      const claim = await claimPeriod(jobName, periodStart);
      if (claim.claimed) return { claimed: true, run: claim.run };
      return { claimed: false, reason: claim.reason, run: claim.run };
    },
    async finish(id, state, detail) {
      await finishPeriod(id, state, detail);
    },
  };
}
