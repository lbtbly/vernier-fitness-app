import { ensureSuiteRole, liveProvenanceCensus } from './host';

/** What the run must find again at the end. Read once, before a spec runs. */
export const LIVE_CENSUS = 'VERNIER_LIVE_CENSUS_AT_START';

/**
 * One reading of the owner's database, taken before anything runs.
 *
 * There used to be a clock here instead, stamping when the run began, because
 * the destructive helper truncated the owner's live tables and the only thing
 * telling a row this run wrote from a row the owner owns was when it arrived.
 * That is gone. Nothing in this suite writes the live provenance tables and
 * nothing in it may, so what is taken here is not a licence to delete anything:
 * it is the number the teardown checks the owner still has.
 *
 * The grants come first, because the census itself is read through them. Every
 * path this suite has to the owner's database connects as `vernier_suite`, and
 * scripts/suite-role.sh is what says what that role may do. Running it here
 * means the run cannot start against a database where the refusal was never
 * installed: no role, no census, no suite.
 */
export default function globalSetup(): void {
  console.log(ensureSuiteRole());
  const census = liveProvenanceCensus();
  process.env[LIVE_CENSUS] = census;
  console.log(`setup: the owner's database holds ${census}. Nothing in this run may lower it.`);
}
