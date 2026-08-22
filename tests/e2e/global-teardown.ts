import { liveProvenanceCensus, testStack } from './host';
import { LIVE_CENSUS } from './global-setup';

/**
 * The suite leaves the owner's database exactly as it found it, and says so.
 *
 * There used to be a sweep here: the run's own rows were truncated out of the
 * live tables through a guarded helper. Nothing writes those tables from a test
 * any more, so there is nothing to sweep, and the helper that could have swept
 * them cannot reach that database at all.
 *
 * What is left is the check. The census read at setup is read again here, and a
 * number that fell means a row the owner had is gone: no spec can delete one,
 * the append-only trigger refuses row deletes outright, and no TRUNCATE in this
 * repository names that database. So a fall is not a tidy-up, it is a fault,
 * and it fails the run rather than printing a note nobody reads.
 *
 * The scratch instance is stopped on the way out. Its database is left in
 * place: the next run resets it, and a stopped container holding a finished
 * run's rows is the cheapest thing there is to look at afterwards.
 */
export default function globalTeardown(): void {
  const before = process.env[LIVE_CENSUS];
  const after = liveProvenanceCensus();
  console.log(`teardown: the owner's database holds ${after}.`);

  try {
    console.log(`teardown: ${testStack('down')}`);
  } catch (error) {
    console.log(`teardown: the scratch instance would not stop: ${(error as Error).message}`);
  }

  if (before === undefined) return;
  const fell = counts(after).some((count, index) => count < counts(before)[index]);
  if (fell) {
    throw new Error(
      `the owner's database lost rows during this run: it held ${before} and now holds ${after}. ` +
        'No spec may write that database and none may delete from it. Find out what did.',
    );
  }
  console.log(`teardown: it held ${before} before the run, so nothing of the owner's was taken.`);
}

function counts(census: string): number[] {
  return census.split(',').map((part) => Number(part.trim().split(' ')[0]));
}
