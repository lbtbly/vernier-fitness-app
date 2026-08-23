import { failStaleRuns, postgresLedger } from '@/db/jobs';
import { sendNotification } from '@/db/push';
import { runReminderSweep } from '@/db/reminders';
import { WEEKLY_REVIEW_JOB, readReviewFacts, recordReview } from '@/db/weekly-review';
import { getConfig } from '@/lib/config';
import { dayLabel } from '@/lib/format';
import { type RunOutcome, runPeriod } from '@/lib/job-runner';
import { buildMessage, mailSettings, sendMail } from '@/lib/mail';
import { renderReviewEmail, renderReviewText, reviewSubject } from '@/lib/review-email';
import {
  SWEEP_MINUTES,
  WEEKLY_REVIEW_SCHEDULE,
  missedPeriods,
  reviewedWeekStart,
  weeklyPeriodKey,
} from '@/lib/schedule';
import { strings } from '@/lib/strings';
import { assembleReview } from '@/lib/weekly-review';

/**
 * The Sunday run, the five-minute sweep, and the startup sweep that clears a
 * run nobody is doing any more.
 *
 * NODE-CRON IS THE TICK AND NEVER THE CORRECTNESS. A cron expression fires or
 * it does not; what makes the work happen once is the ledger claim in
 * src/lib/job-runner.ts, which is why the catch-up at boot and the tick at
 * 20:00 call exactly the same function with exactly the same period key. A
 * container that was off across Sunday reaches the same claim on the way back
 * up and takes it; a container that was on takes it at 20:00; and whichever
 * happened first, the other finds the period done.
 *
 * THE SCHEDULE CARRIES ITS ZONE. node-cron takes `{ timezone }`, and without it
 * a container whose TZ drifted would tick at 20:00 of something else. It is
 * belt to the ledger's braces: the key is computed in Paris whatever hour the
 * tick arrived at, so a tick at the wrong hour claims the right period or none.
 */

/** The five-minute sweep's name in the ledger, for the operator console. */
export const REMINDER_SWEEP_JOB = 'reminder_sweep';

/** How far back a boot will look for a period it owes. One, and F120 says why. */
const CATCH_UP_PERIODS = 1;

/** How far back `missedPeriods` is allowed to look at all. Eight days covers one Sunday. */
const CATCH_UP_WINDOW_DAYS = 8;

/**
 * Prepares one week's review, records the ledger row and tells the phone.
 *
 * The review itself is not stored: it is computed on every read from the tables
 * that hold the week. What this writes is the row saying the period produced
 * one, which `week_start` makes unique, so five ticks that all somehow got past
 * the claim would still produce one plan.
 */
export async function runWeeklyReview(periodStart: string): Promise<string> {
  const { timeZone, appUrl } = getConfig();
  const weekStart = reviewedWeekStart(periodStart, timeZone);
  const facts = await readReviewFacts(weekStart);
  const review = assembleReview(facts);

  /*
   * THE PREVIEW IS THE PRODUCT AND THE SEND IS THE EXTRA. With no mail host on
   * this machine the review is prepared, the ledger row says `preview`, and the
   * screen says in words that nothing was sent. That is F118 working rather
   * than F118 waiting: the bytes a relay would carry are the bytes the preview
   * route serves, so there is one renderer and nothing to keep in step.
   */
  const settings = mailSettings();
  let emailState: 'preview' | 'sent' | 'failed' = 'preview';
  let emailDetail = settings ? '' : 'no-transport';
  if (settings) {
    const sent = await sendMail(
      settings,
      buildMessage({
        from: settings.from,
        to: settings.to,
        subject: reviewSubject(review),
        text: renderReviewText(review, appUrl),
        html: renderReviewEmail(review, appUrl),
        at: new Date(),
      }),
    );
    emailState = sent.ok ? 'sent' : 'failed';
    emailDetail = sent.detail;
  }

  const { row, created } = await recordReview({
    weekStart,
    periodStart,
    emailState,
    emailDetail,
  });

  /*
   * One notification, carrying a real title and a real body, so this can never
   * be a send that would show nothing. A machine with no subscribed device
   * refuses at the source and the review is still prepared: the screen is the
   * product and the push is the nudge.
   */
  await sendNotification(
    {
      title: strings.review.title,
      body: strings.review.weekOf(dayLabel(review.weekStart), dayLabel(review.weekEnd)),
      tag: `vernier-review-${weekStart}`,
      route: '/review',
      itemIds: [],
      badge: 1,
    },
    'review',
  ).catch(() => undefined);

  return `${row.weekStart} ${created ? 'created' : 'existing'} ${emailState}`;
}

/** One claim of one period, whether it came from a tick or from a boot. */
export async function runWeeklyReviewPeriod(now: Date): Promise<RunOutcome> {
  const { timeZone } = getConfig();
  const periodStart = weeklyPeriodKey(now, WEEKLY_REVIEW_SCHEDULE, timeZone);
  return runPeriod(postgresLedger(), WEEKLY_REVIEW_JOB, periodStart, () =>
    runWeeklyReview(periodStart),
  );
}

/**
 * What a boot owes.
 *
 * At most one period, deliberately. A machine off for a month has four missed
 * Sundays behind it, and firing four reviews at the owner on the way back up
 * would be four notifications about weeks he has already lived. F120 says
 * exactly once on next boot and no more, so the catch-up takes the most recent
 * period and the older ones stand unclaimed, which is the honest record: they
 * did not happen.
 */
export async function catchUpOnBoot(now: Date): Promise<RunOutcome[]> {
  const { timeZone } = getConfig();
  const since = new Date(now.getTime() - CATCH_UP_WINDOW_DAYS * 86_400_000);
  const periods = missedPeriods(since, now, WEEKLY_REVIEW_SCHEDULE, timeZone, CATCH_UP_PERIODS);
  const outcomes: RunOutcome[] = [];
  for (const periodStart of periods) {
    outcomes.push(
      await runPeriod(postgresLedger(), WEEKLY_REVIEW_JOB, periodStart, () =>
        runWeeklyReview(periodStart),
      ),
    );
  }
  return outcomes;
}

/**
 * Starts the two schedules, and clears anything the last process left running.
 *
 * Returns the tasks so a caller can stop them, and so the boot log can say how
 * many are actually scheduled rather than implying it.
 */
export async function startScheduler(): Promise<{
  stale: number;
  caughtUp: RunOutcome[];
  stop: () => void;
}> {
  const { timeZone } = getConfig();
  const now = new Date();

  // FIRST, because a period held by a process that no longer exists would block
  // the catch-up below and every tick after it, silently, forever.
  const stale = await failStaleRuns(now);
  const caughtUp = await catchUpOnBoot(now);

  const cron = (await import('node-cron')).default;
  // cron counts Sunday as 0; this app counts Monday as 0, the same index
  // `weekdayIndex` returns everywhere else. One translation, here.
  const cronWeekday = (WEEKLY_REVIEW_SCHEDULE.weekday + 1) % 7;
  const weekly = cron.schedule(
    `${WEEKLY_REVIEW_SCHEDULE.minute} ${WEEKLY_REVIEW_SCHEDULE.hour} * * ${cronWeekday}`,
    () => {
      void runWeeklyReviewPeriod(new Date()).catch((error: unknown) => {
        console.error(`[vernier] weekly review tick: ${(error as Error).message}`);
      });
    },
    { timezone: timeZone },
  );

  const sweep = cron.schedule(
    `*/${SWEEP_MINUTES} * * * *`,
    () => {
      void runReminderSweep(new Date()).catch((error: unknown) => {
        console.error(`[vernier] reminder sweep: ${(error as Error).message}`);
      });
    },
    { timezone: timeZone },
  );

  return {
    stale: stale.length,
    caughtUp,
    stop: () => {
      void weekly.stop();
      void sweep.stop();
    },
  };
}
