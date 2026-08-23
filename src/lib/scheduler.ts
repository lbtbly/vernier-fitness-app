import { sweepAlerts } from '@/db/alerts';
import { failStaleRuns, postgresLedger } from '@/db/jobs';
import { sendNotification } from '@/db/push';
import { runReminderSweep } from '@/db/reminders';
import { WEEKLY_REVIEW_JOB, readReviewFacts, recordReview } from '@/db/weekly-review';
import { getConfig } from '@/lib/config';
import { dayLabel } from '@/lib/format';
import { type RunOutcome, runPeriod } from '@/lib/job-runner';
import { buildMessage, mailSettings, sendMail } from '@/lib/mail';
import { renderReviewEmail, renderReviewText, reviewSubject } from '@/lib/review-email';
import { runArchive } from '@/lib/backup/run';
import {
  DAILY_ARCHIVE_JOB,
  DAILY_ARCHIVE_SCHEDULE,
  SWEEP_MINUTES,
  WEEKLY_REVIEW_SCHEDULE,
  dailyPeriodKey,
  missedDailyPeriods,
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

/*
 * THE FIVE-MINUTE SWEEP DOES NOT CLAIM A PERIOD, AND THAT IS DELIBERATE.
 *
 * The ledger exists so a job that must happen once per period happens once per
 * period, and the Sunday run is that job. The sweep is different: its whole
 * idempotency is the item state, because an item already marked `sent` is not
 * sent again by any tick, however many of them run. Giving it a ledger row
 * would be 288 rows a day for a mechanism it does not need, and a table that
 * grows for no reason is a table somebody prunes badly later.
 */

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
 * One claim of one archive period.
 *
 * `runArchive` never throws: it writes a `failed` row with a cause token,
 * because a rejected promise inside a cron callback is a container log nobody
 * reads. So the failure is re-raised HERE, where the ledger can see it, and the
 * message is the cause token rather than a sentence, exactly as
 * `src/db/jobs.ts` requires of `detail`. A failed period can be re-claimed
 * three times, which in practice means the next boot tries again.
 */
export async function runArchivePeriod(now: Date): Promise<RunOutcome> {
  const { timeZone } = getConfig();
  const periodStart = dailyPeriodKey(now, DAILY_ARCHIVE_SCHEDULE, timeZone);
  return runPeriod(postgresLedger(), DAILY_ARCHIVE_JOB, periodStart, async () => {
    const run = await runArchive({ kind: 'scheduled', periodStart, now });
    if (run.outcome !== 'ok') throw new Error(run.cause || 'archive_failed');
    return `${run.fileName} ${run.bytes} bytes ${run.destination}`;
  });
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

  /*
   * AND THE ARCHIVE, WHICH IS THE SAME RULE WITH A HIGHER STAKE. A container
   * that was off at 03:00 has no copy of that day, and the claim is what makes
   * the catch-up write one rather than two. One period, deliberately: a machine
   * off for a week owes seven archives of a database that has one current
   * state, and six of them would be tonight's data under yesterday's names.
   */
  const archiveSince = new Date(now.getTime() - CATCH_UP_WINDOW_DAYS * 86_400_000);
  for (const periodStart of missedDailyPeriods(
    archiveSince,
    now,
    DAILY_ARCHIVE_SCHEDULE,
    timeZone,
    CATCH_UP_PERIODS,
  )) {
    outcomes.push(
      await runPeriod(postgresLedger(), DAILY_ARCHIVE_JOB, periodStart, async () => {
        const run = await runArchive({ kind: 'scheduled', periodStart, now });
        if (run.outcome !== 'ok') throw new Error(run.cause || 'archive_failed');
        return `${run.fileName} ${run.bytes} bytes ${run.destination}`;
      }),
    );
  }
  return outcomes;
}

/**
 * Starts the two schedules, clears anything the last process left running, and
 * sets the catch-up going behind them.
 *
 * Returns the count of schedules it really registered, so the boot log states a
 * number it has rather than implying one.
 */
export async function startScheduler(): Promise<{ stale: number; schedules: number; stop: () => void }> {
  const { timeZone } = getConfig();
  const now = new Date();

  /*
   * FIRST, AND AWAITED. A period held by a process that no longer exists would
   * block the catch-up below and every tick after it, silently, forever. It is
   * two statements against one indexed row, so the boot pays for it and the
   * decision is made once, with the whole picture, rather than by whichever
   * tick happened to notice.
   */
  const stale = await failStaleRuns(now);

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
      /*
       * THE ALERT SWEEP RIDES THE SAME TICK AND CATCHES ITS OWN FAILURES. It
       * reads state rather than events, so five minutes is the longest the
       * owner can be uninformed about something that broke, and a throw in the
       * reminder sweep above must not take it down with it: the two are
       * deliberately separate promises. F133.
       */
      void sweepAlerts(new Date()).catch((error: unknown) => {
        console.error(`[vernier] alert sweep: ${(error as Error).message}`);
      });
    },
    { timezone: timeZone },
  );

  /*
   * The nightly archive at 03:00 Paris. node-cron is the tick and the ledger is
   * the correctness, exactly as it is for the Sunday run above: a container
   * that was off at 03:00 reaches the same claim on the way back up.
   */
  const archive = cron.schedule(
    `${DAILY_ARCHIVE_SCHEDULE.minute} ${DAILY_ARCHIVE_SCHEDULE.hour} * * *`,
    () => {
      void runArchivePeriod(new Date()).catch((error: unknown) => {
        console.error(`[vernier] archive tick: ${(error as Error).message}`);
      });
    },
    { timezone: timeZone },
  );

  /*
   * AND THE CATCH-UP IS NOT AWAITED, DELIBERATELY.
   *
   * It reads six tables, assembles a review and may hand a message to a mail
   * relay with a twenty-second timeout on it. `register()` runs before the
   * first request is served, so awaiting that would be a container sitting
   * silent while a relay decides whether to answer, and F1 counts the seconds
   * to healthy. Nothing is lost by letting it run behind: the claim is what
   * makes it happen exactly once, and a claim taken a second after boot is the
   * same claim.
   *
   * Its outcome is logged where it finishes rather than in the boot line,
   * because a boot line that reported a result it had not waited for would be
   * a check that passes by not checking.
   */
  void catchUpOnBoot(now)
    .then((outcomes) => {
      const named = outcomes.map((outcome) => `${outcome.periodStart}:${outcome.reason}`).join(', ');
      console.log(
        `[vernier] scheduler catch-up: ${outcomes.length} period(s)${named === '' ? '' : ` (${named})`}`,
      );
    })
    .catch((error: unknown) => {
      console.error(`[vernier] scheduler catch-up did not run: ${(error as Error).message}`);
    });

  /*
   * ONE SWEEP AT BOOT, BEHIND THE SCHEDULES. A container that has just come back
   * up is exactly the one whose owner wants to know what is broken, and waiting
   * five minutes to tell him is five minutes of the silence this whole
   * mechanism exists to end. Not awaited, for the same reason the catch-up is
   * not: `register()` runs before the first request is served.
   */
  void sweepAlerts(now)
    .then((report) => {
      console.log(
        `[vernier] alert sweep: ${report.raised.length} raised, ${report.cleared} cleared, ` +
          `${report.standing} standing, ${report.notified} notified, ${report.held} held`,
      );
    })
    .catch((error: unknown) => {
      console.error(`[vernier] alert sweep did not run: ${(error as Error).message}`);
    });

  return {
    stale: stale.length,
    schedules: 3,
    stop: () => {
      void weekly.stop();
      void sweep.stop();
      void archive.stop();
    },
  };
}
