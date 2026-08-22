import { resetProvenance, rowsOlderThanThisRun } from './host';

/**
 * The suite leaves this database as it found it.
 *
 * These tests write real rows through the product: a waist measurement logged
 * from the quick log is as un-seeded as a Withings import, and the append-only
 * trigger means nothing here can delete one afterwards. Left behind, those rows
 * are indistinguishable from the owner's own the next time the suite runs, and
 * the guard in host.ts would then refuse for the rest of the machine's life.
 *
 * So the run sweeps its own writes, through the same guarded helper, which
 * still refuses to take anything older than the run. If it refuses here, the
 * message is printed and the run's verdict is left alone: a teardown is not a
 * place to fail a green suite, and rows nobody can account for are exactly what
 * should be left for a person to look at.
 */
export default function globalTeardown(): void {
  try {
    if (rowsOlderThanThisRun() > 0) {
      console.log('teardown: rows older than this run are here, so nothing was swept.');
      return;
    }
    resetProvenance();
    console.log('teardown: the rows this run wrote are gone and the seed is back.');
  } catch (error) {
    console.log(`teardown: ${(error as Error).message}`);
  }
}
