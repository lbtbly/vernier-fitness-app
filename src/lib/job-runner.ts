/**
 * Claim, then work, then finish. Over a ledger that is an argument.
 *
 * The ordering is four lines long and it is the whole of F119 and F120, so it
 * is graded in the unit suite over a memory ledger: five ticks inside one
 * period, a container that comes back after an outage, a run killed halfway
 * through. None of those needs Postgres to be a real test, and all of them need
 * to be real tests.
 *
 * `src/db/idempotency.ts` draws the same line in this repository and this
 * follows it. `src/db/jobs.ts` holds the Postgres ledger, which is where the
 * claim is arbitrated for real by a unique index rather than by a promise.
 */

export type LedgerRun = {
  id: string;
  jobName: string;
  periodStart: string;
  state: 'running' | 'done' | 'failed';
  attempt: number;
};

export type LedgerClaim =
  | { claimed: true; run: LedgerRun }
  | { claimed: false; reason: 'taken' | 'done' | 'exhausted'; run: LedgerRun | null };

export type RunLedger = {
  /** Takes the period, or says who has it. Must be one atomic statement. */
  claim(jobName: string, periodStart: string): Promise<LedgerClaim>;
  finish(id: string, state: 'done' | 'failed', detail: string): Promise<void>;
};

export type RunOutcome = {
  jobName: string;
  periodStart: string;
  /** True when this call did the work. Exactly one of five ticks says true. */
  ran: boolean;
  reason: 'done' | 'taken' | 'already-done' | 'exhausted' | 'failed';
  detail: string;
};

/**
 * Runs the work for one period, at most once, ever.
 *
 * THE CLAIM IS FIRST AND NOTHING HAPPENS BEFORE IT. Not a read of the tables
 * the work will use, not a check of whether there is anything to do, not a log
 * line. A tick that loses the claim did nothing at all, which is what makes
 * five ticks inside one period cost one row and one plan rather than five reads
 * and a race.
 *
 * A throw inside the work is caught and finished as `failed` with the message,
 * rather than escaping into a cron callback where nothing would catch it and
 * the row would stay `running` until the next boot swept it. Both outcomes are
 * written down; neither is a process that vanished.
 */
export async function runPeriod(
  ledger: RunLedger,
  jobName: string,
  periodStart: string,
  work: () => Promise<string>,
): Promise<RunOutcome> {
  const claim = await ledger.claim(jobName, periodStart);
  if (!claim.claimed) {
    return {
      jobName,
      periodStart,
      ran: false,
      reason:
        claim.reason === 'done' ? 'already-done' : claim.reason === 'exhausted' ? 'exhausted' : 'taken',
      detail: '',
    };
  }

  try {
    const detail = await work();
    await ledger.finish(claim.run.id, 'done', detail);
    return { jobName, periodStart, ran: true, reason: 'done', detail };
  } catch (error) {
    const detail = (error as Error).message;
    await ledger.finish(claim.run.id, 'failed', detail);
    return { jobName, periodStart, ran: false, reason: 'failed', detail };
  }
}
