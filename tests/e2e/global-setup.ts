import { RUN_STAMP } from './host';

/**
 * One clock for the whole run.
 *
 * The destructive helper in host.ts truncates the owner's live tables, and the
 * only thing that tells a row this run wrote from a row the owner owns is when
 * it arrived. So the moment is taken once, here, in the process that spawns the
 * workers, and the workers inherit it. A per-worker stamp would move every time
 * Playwright replaced a worker, and the answer to "was this row already here"
 * would move with it.
 *
 * It is never overwritten. A caller that sets it deliberately, to sweep residue
 * from an interrupted run, keeps the value it chose.
 */
export default function globalSetup(): void {
  process.env[RUN_STAMP] = process.env[RUN_STAMP] ?? new Date().toISOString();
}
