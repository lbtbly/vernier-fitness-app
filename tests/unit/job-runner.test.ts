import { describe, expect, test } from 'vitest';
import { type LedgerClaim, type LedgerRun, type RunLedger, runPeriod } from '@/lib/job-runner';

/**
 * F119 and F120, over a ledger that behaves the way the Postgres one does.
 *
 * THE CLAIM IS FIRST AND NOTHING HAPPENS BEFORE IT. Five ticks land inside one
 * Sunday evening; one takes the period and four do nothing at all. Not "four
 * read the tables and find the work already done": four do NOTHING, because
 * anything before the claim is a race with a window in it.
 *
 * WHAT WOULD MAKE THIS GO RED. Claiming after the work, which is the shape
 * somebody writes when they want the ledger row to carry a result. The `worked`
 * counter below is what catches it: it counts how many times the work function
 * was ENTERED, not how many rows exist afterwards, so a run that did the work
 * twice and wrote one row still fails. A census that compared totals rather
 * than events is a defect this project has already had.
 */

/** A ledger with the same rules the Postgres one has, in a Map. */
function memoryLedger(maxAttempts = 3) {
  const rows = new Map<string, LedgerRun>();
  let ids = 0;
  const ledger: RunLedger = {
    async claim(jobName, periodStart): Promise<LedgerClaim> {
      const key = `${jobName} ${periodStart}`;
      const held = rows.get(key);
      if (!held) {
        ids += 1;
        const run: LedgerRun = {
          id: `run-${ids}`,
          jobName,
          periodStart,
          state: 'running',
          attempt: 1,
        };
        rows.set(key, run);
        return { claimed: true, run };
      }
      if (held.state === 'done') return { claimed: false, reason: 'done', run: held };
      if (held.state === 'failed' && held.attempt < maxAttempts) {
        const run: LedgerRun = { ...held, state: 'running', attempt: held.attempt + 1 };
        rows.set(key, run);
        return { claimed: true, run };
      }
      if (held.state === 'failed') return { claimed: false, reason: 'exhausted', run: held };
      return { claimed: false, reason: 'taken', run: held };
    },
    async finish(id, state) {
      for (const [key, run] of rows) {
        if (run.id === id) rows.set(key, { ...run, state });
      }
    },
  };
  return { ledger, rows };
}

const JOB = 'weekly_review';
const PERIOD = '2026-10-25T20:00';

describe('five ticks inside one period', () => {
  test('produce one ledger row and one run of the work', async () => {
    const { ledger, rows } = memoryLedger();
    let worked = 0;
    const outcomes = [];
    for (let tick = 0; tick < 5; tick += 1) {
      outcomes.push(
        await runPeriod(ledger, JOB, PERIOD, async () => {
          worked += 1;
          return `plan ${worked}`;
        }),
      );
    }
    console.log(`five ticks: ${outcomes.map((outcome) => outcome.reason).join(', ')}`);
    console.log(`ledger rows: ${rows.size}, work entered: ${worked} time(s)`);
    expect(outcomes).toHaveLength(5);
    expect(rows.size).toBe(1);
    expect(worked).toBe(1);
    expect(outcomes.filter((outcome) => outcome.ran)).toHaveLength(1);
    expect(outcomes.slice(1).every((outcome) => outcome.reason === 'already-done')).toBe(true);
  });

  test('two periods are two rows and two runs', async () => {
    const { ledger, rows } = memoryLedger();
    let worked = 0;
    for (const period of ['2026-10-18T20:00', '2026-10-25T20:00']) {
      for (let tick = 0; tick < 3; tick += 1) {
        await runPeriod(ledger, JOB, period, async () => {
          worked += 1;
          return period;
        });
      }
    }
    console.log(`six ticks across two periods: ${rows.size} row(s), ${worked} run(s)`);
    expect(rows.size).toBe(2);
    expect(worked).toBe(2);
  });

  test('a tick that lost the claim does not touch the work at all', async () => {
    const { ledger } = memoryLedger();
    await runPeriod(ledger, JOB, PERIOD, async () => 'first');
    let entered = false;
    const outcome = await runPeriod(ledger, JOB, PERIOD, async () => {
      entered = true;
      return 'second';
    });
    expect(entered).toBe(false);
    expect(outcome.ran).toBe(false);
    expect(outcome.reason).toBe('already-done');
  });
});

describe('a container down across the window', () => {
  test('fires once on next boot and no more', async () => {
    const { ledger, rows } = memoryLedger();
    let worked = 0;
    const work = async () => {
      worked += 1;
      return 'caught up';
    };
    // The boot that owes the period.
    const first = await runPeriod(ledger, JOB, PERIOD, work);
    // Every boot after it, and every tick after those.
    const later = [];
    for (let again = 0; again < 4; again += 1) later.push(await runPeriod(ledger, JOB, PERIOD, work));
    console.log(`boot then four more: ran=${[first, ...later].map((outcome) => outcome.ran).join(',')}`);
    expect(first.ran).toBe(true);
    expect(later.every((outcome) => outcome.ran === false)).toBe(true);
    expect(worked).toBe(1);
    expect(rows.size).toBe(1);
  });
});

describe('a run that failed', () => {
  test('is written down as failed and does not hold its period', async () => {
    const { ledger, rows } = memoryLedger();
    const first = await runPeriod(ledger, JOB, PERIOD, async () => {
      throw new Error('the nutrition read timed out');
    });
    console.log(`first attempt: ran=${first.ran} reason=${first.reason} detail=${first.detail}`);
    expect(first.ran).toBe(false);
    expect(first.reason).toBe('failed');
    expect(first.detail).toBe('the nutrition read timed out');
    expect([...rows.values()][0].state).toBe('failed');

    // The next tick takes the period back, because a failed run that blocked
    // its slot forever would be a Sunday that never happens again.
    const second = await runPeriod(ledger, JOB, PERIOD, async () => 'recovered');
    expect(second.ran).toBe(true);
    expect([...rows.values()][0].state).toBe('done');
  });

  test('a period that keeps failing stops after three attempts', async () => {
    const { ledger } = memoryLedger(3);
    const outcomes = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      outcomes.push(
        await runPeriod(ledger, JOB, PERIOD, async () => {
          throw new Error('still broken');
        }),
      );
    }
    console.log(`five attempts: ${outcomes.map((outcome) => outcome.reason).join(', ')}`);
    // Three real attempts, then the row stands as the record that this period
    // did not work. A period that re-claims forever is a job pushing the same
    // broken thing at the owner every five minutes.
    expect(outcomes.filter((outcome) => outcome.reason === 'failed')).toHaveLength(3);
    expect(outcomes.filter((outcome) => outcome.reason === 'exhausted')).toHaveLength(2);
  });

  test('a run still marked running is never taken by a tick', async () => {
    const { ledger, rows } = memoryLedger();
    // A process killed mid-run: the claim happened, the finish did not.
    await ledger.claim(JOB, PERIOD);
    expect([...rows.values()][0].state).toBe('running');
    let entered = false;
    const outcome = await runPeriod(ledger, JOB, PERIOD, async () => {
      entered = true;
      return 'second';
    });
    console.log(`tick against a running row: ${outcome.reason}`);
    expect(entered).toBe(false);
    expect(outcome.reason).toBe('taken');
    // Which is why clearing it is a STARTUP step and not a tick: only a boot
    // can know that whatever was running before this process started is not
    // running now.
  });
});
