import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import {
  ensureScratchOwner,
  projectRoot,
  scratchAttempt,
  scratchEnv,
  scratchQuery,
  scratchSignInLink,
  testStack,
  testStackWithWithingsMode,
  waitForScratch,
} from './host';

/**
 * The Withings pipeline, walked along the route a shipped screen actually
 * takes: Settings, the button, the status the card comes back with, and the
 * value sheet the imported reading reaches in two taps.
 *
 * ON THE SCRATCH INSTANCE, AND ONLY THERE. Every test here WRITES: connect
 * stores a token, import lands hundreds of rows, and the answer path appends a
 * correction. `measurement` refuses DELETE by design, so none of that can be
 * taken back out, and the owner's install holds the only copy of anything real
 * in this product. The scratch instance is the same image against its own
 * database with nothing in it anybody would miss, and scripts/test-stack.sh
 * starts it with WITHINGS_MODE=demo and an empty client pair, so nothing here
 * opens a socket either.
 *
 * WHAT IT PROVES THAT THE UNIT SUITE CANNOT. The unit suite grades the
 * decisions; this grades the product. It goes through the shipped button, reads
 * the shipped card, and searches the rendered markup of the connected screen for
 * the values a credential store must never print.
 */

const CAPTURES = `${projectRoot}.forge/evidence/slice-5/captures`;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  mkdirSync(CAPTURES, { recursive: true });
  // Demonstration seed off. The rows on this screen are the ones the Withings
  // import put there and nothing else, so a count is a count of the import.
  console.log(testStack('reset'));
  await waitForScratch();
  await ensureScratchOwner();
});

test.afterAll(() => {
  testStack('reset');
});

async function signIn(page: Page) {
  await page.goto(scratchSignInLink());
  await page.waitForURL(/\/$/);
  await page.waitForLoadState('networkidle');
}

async function openSettings(page: Page) {
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');
}

/** The Withings card, by its own marker rather than by position on the screen. */
function card(page: Page) {
  return page.locator('[data-withings]');
}

test('F36. connect, import, sync and status all complete with no client id and no network', async ({
  page,
}) => {
  await signIn(page);
  await openSettings(page);

  // NO CLIENT ID AND NO SECRET, read off the running container rather than
  // claimed by the harness. Lengths are printed; the values are not, because
  // this is the shape of a check that would leak one if it ever held something.
  const clientId = scratchEnv('WITHINGS_CLIENT_ID');
  const clientSecret = scratchEnv('WITHINGS_CLIENT_SECRET');
  console.log(
    `scratch container: WITHINGS_MODE=${scratchEnv('WITHINGS_MODE')}, client id ${clientId.length} chars, client secret ${clientSecret.length} chars`,
  );
  expect(clientId).toBe('');
  expect(clientSecret).toBe('');
  expect(scratchEnv('WITHINGS_MODE')).toBe('demo');

  await expect(card(page)).toHaveAttribute('data-withings', 'disconnected');
  await page.screenshot({ path: `${CAPTURES}/f36-1-disconnected.png`, fullPage: true });

  // ---- connect
  await page.getByRole('button', { name: /connect the demonstration account/i }).click();
  await expect(card(page)).toHaveAttribute('data-withings', 'demo', { timeout: 30_000 });
  await page.screenshot({ path: `${CAPTURES}/f36-2-connected.png`, fullPage: true });
  expect(Number(scratchQuery('select count(*) from integration_credential'))).toBe(1);

  // ---- historical import
  await page.getByRole('button', { name: /import the history/i }).click();
  await expect(page.getByText(/readings stored out of/i)).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: `${CAPTURES}/f36-3-imported.png`, fullPage: true });

  const stored = Number(scratchQuery('select count(*) from measurement'));
  const bySource = scratchQuery(
    "select source || '=' || count(*) from measurement group by source order by source",
  );
  console.log(`after the historical import: ${stored} rows, sources ${bySource.replace(/\n/g, ', ')}`);
  // A zero is evidence only beside its population, so the population is the
  // assertion: hundreds of rows, every one of them source demo.
  expect(stored).toBeGreaterThan(300);
  expect(bySource).toBe(`demo=${stored}`);
  expect(Number(scratchQuery("select count(*) from measurement where source <> 'demo'"))).toBe(0);

  // Every source record stands in for a Withings sync batch and is marked seeded.
  expect(scratchQuery('select distinct source, kind, seed from source_record')).toBe(
    'withings|sync_batch|t',
  );

  // ---- the same import again.
  //
  // NOT "the same row count", which is what this asserted and what it could
  // never get. `importOnce` advances the demonstration account from its initial
  // state to its revised state after the first historical import, exactly as a
  // real Withings account does when a measure is re-weighed and re-sent, so the
  // second pass sees five revised measures and appends five corrections. The
  // assertion read 333 against 328 on every run, and because this file is
  // serial the seven tests behind it, F38, F39, both halves of F42, F43, A2 and
  // A1, never executed at all. A flat total would have meant a revision never
  // arrives, which is the opposite of what F40 asks this pipeline to do.
  //
  // WHAT A RE-IMPORT MUST NOT DO IS DUPLICATE, so that is what is asserted. No
  // second original for a measure already held, no new chain, and every row the
  // second pass added is a correction of a row that was already there. It goes
  // red the moment the importer writes a measure twice.
  const chainsBefore = Number(scratchQuery('select count(distinct root_id) from measurement'));
  const originalsBefore = Number(
    scratchQuery('select count(*) from measurement where correction_index = 0'),
  );
  const revisionsBefore = Number(
    scratchQuery('select count(*) from measurement where correction_index > 0'),
  );
  await page.getByRole('button', { name: /import the history/i }).click();
  await expect(page.getByText(/readings stored out of/i)).toBeVisible({ timeout: 60_000 });

  const afterSecond = Number(scratchQuery('select count(*) from measurement'));
  const chainsAfter = Number(scratchQuery('select count(distinct root_id) from measurement'));
  const originalsAfter = Number(
    scratchQuery('select count(*) from measurement where correction_index = 0'),
  );
  const revisionsAfter = Number(
    scratchQuery('select count(*) from measurement where correction_index > 0'),
  );
  const appended = afterSecond - stored;
  console.log(
    `the second historical import: ${stored} rows became ${afterSecond}, ` +
      `${chainsBefore} chains became ${chainsAfter}, ${originalsBefore} originals became ${originalsAfter}, ` +
      `${revisionsBefore} revision(s) became ${revisionsAfter}, so it appended ${appended} row(s) ` +
      'and every one of them is a revision of a measure already stored',
  );
  expect(chainsAfter).toBe(chainsBefore);
  expect(originalsAfter).toBe(originalsBefore);
  expect(revisionsAfter - revisionsBefore).toBe(appended);

  // ---- incremental sync
  await page.getByRole('button', { name: /^sync now$/i }).click();
  await expect(page.getByText(/synced|nothing new/i)).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: `${CAPTURES}/f36-4-synced.png`, fullPage: true });

  // The revision the demonstration account pushed after the history landed.
  const revisions = Number(
    scratchQuery('select count(*) from measurement where correction_index > 0'),
  );
  console.log(`the incremental sync appended ${revisions} revisions`);
  expect(revisions).toBeGreaterThan(0);
  expect(Number(scratchQuery("select count(*) from measurement where dedup_decision = 'correction'"))).toBe(
    revisions,
  );

  // ---- status
  const connected = scratchQuery(
    'select state || \'|\' || mode || \'|\' || (cursor is not null) from withings_connection',
  );
  console.log(`the connection row after the run: ${connected}`);
  // 'true', not 't'. psql -tA renders a bare boolean column as t/f, but this
  // query CONCATENATES with ||, and Postgres casts boolean to text as
  // true/false. Same shape as the ingest.spec assertion that hid thirteen tests
  // behind it: a test asserting how a value is printed rather than what it is.
  // GOES RED IF: the connection stops being connected, stops being demo, or
  // stops carrying a cursor.
  expect(connected).toBe('connected|demo|true');
});

test('F38. the cursor is a stored fact and it names what was committed', async () => {
  const cursor = Number(scratchQuery('select cursor from withings_connection'));
  const highest = Number(scratchQuery('select max(external_modified) from measurement'));
  console.log(`cursor ${cursor}, highest committed modification ${highest}`);
  expect(cursor).toBeGreaterThan(0);
  // The cursor never names a measure this database does not hold, which is the
  // whole reason it is derived from committed rows rather than from the
  // `updatetime` a response reported.
  expect(cursor).toBeGreaterThanOrEqual(highest);
});

test('F39. no blood pressure reached the database, over a population that carried one', async () => {
  // The demonstration account holds one blood pressure group beside the scale.
  // The drop happened at the fetch layer and the storage layer would have
  // refused it anyway; what this reads is the outcome.
  const dropped = Number(scratchQuery('select groups_dropped from withings_connection'));
  const metrics = scratchQuery('select distinct metric from measurement order by metric');
  console.log(`groups dropped whole: ${dropped}. metrics stored: ${metrics.replace(/\n/g, ', ')}`);
  expect(dropped).toBeGreaterThan(0);
  expect(metrics).not.toContain('pressure');
  expect(metrics.split('\n').sort()).toEqual([
    'body_water',
    'bone_mass',
    'fat_free_mass',
    'fat_mass',
    'fat_ratio',
    'muscle_mass',
    'standing_heart_rate',
    'weight',
  ]);

  // AND THE DATABASE REFUSES ONE DIRECTLY, with the fetch layer, the storage
  // layer and the route all bypassed. This is the third net, and the only one
  // no code path can be refactored past.
  const refused = scratchAttempt(`
    insert into measurement (
      id, metric, raw_value, raw_unit, value, unit, time_zone, source, measured_at,
      confidence, import_version, dedup_decision, dedup_reason, source_record_id, root_id
    ) select 'bp-probe', 'systolic_blood_pressure', '0', 'mmHg', 0, 'mmHg', 'Europe/Paris',
             'withings', now(), 'measured_device', '2026-08-3', 'unique', 'probe',
             id, 'bp-probe'
      from source_record limit 1
  `);
  console.log(`the database answered a direct blood pressure insert with: ${refused}`);
  /*
   * TWO NETS STAND IN FRONT OF THIS COLUMN NOW, AND THE NEWER ONE SPEAKS.
   *
   * This line was written against the CHECK constraint 0008 added. The
   * laboratory wave then put `measurement_refuses_blood_pressure` on the same
   * table, and a BEFORE ROW trigger runs before any constraint on the row is
   * evaluated, so what Postgres says is the trigger's own sentence and the
   * constraint's name is nowhere in it. Measured at a psql prompt on the
   * scratch database: 'ERROR: blood pressure is refused at extraction and has
   * no field in this database, CONTEXT: PL/pgSQL function
   * refuse_blood_pressure()'.
   *
   * So the refusal is read for either net by name, and the CHECK is asserted to
   * still exist rather than assumed to be what answered. That is stricter than
   * the single line it replaces: dropping the constraint used to be invisible
   * behind the trigger, and now it is a failure with the constraint's name in
   * it.
   */
  expect(refused).toMatch(/measurement_no_blood_pressure|refuse_blood_pressure/);
  expect(
    scratchQuery(
      "select count(*) from pg_constraint where conname = 'measurement_no_blood_pressure'",
    ),
    'the CHECK behind the trigger has been dropped, so one net refuses this now and not two',
  ).toBe('1');
  expect(Number(scratchQuery("select count(*) from measurement where id = 'bp-probe'"))).toBe(0);
});

test('F42. the status screen shows the state, the last sync and a test button, and no credential', async ({
  page,
}) => {
  await signIn(page);
  await openSettings(page);

  await expect(card(page)).toHaveAttribute('data-withings', 'demo');
  await expect(page.locator('[data-withings-state]')).toHaveText(/demonstration/i);
  await expect(page.getByText(/last successful sync/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /^test$/i })).toBeVisible();

  // The test button asks and writes nothing.
  const before = Number(scratchQuery('select count(*) from measurement'));
  await page.getByRole('button', { name: /^test$/i }).click();
  await expect(page.getByText(/the connection answered/i)).toBeVisible({ timeout: 30_000 });
  expect(Number(scratchQuery('select count(*) from measurement'))).toBe(before);
  await page.screenshot({ path: `${CAPTURES}/f42-status.png`, fullPage: true });

  // NOTHING ON THIS SCREEN IS A CREDENTIAL. The stored bundle is read straight
  // out of the database and every one of its values is searched for in the
  // rendered markup of the connected screen.
  const markup = await page.content();
  const sealed = scratchQuery('select secret_ciphertext from integration_credential');
  expect(sealed.length).toBeGreaterThan(0);
  for (const secret of [sealed, 'demo-access-', 'demo-refresh-', 'demo-account']) {
    console.log(`searching the rendered settings screen for ${JSON.stringify(secret.slice(0, 24))}`);
    expect(markup).not.toContain(secret);
  }
});

test('F43. Today and Health render with the adapter unreachable, and name the cause', async ({
  page,
}) => {
  await signIn(page);

  // The adapter is taken away at the network, so a page that reached for it
  // would hang rather than fail fast. Neither screen reaches for it: both read
  // this database, which is why the rest of the app still renders.
  await page.route('**/wbsapi.withings.net/**', (route) => route.abort());
  scratchQuery(
    "update withings_connection set last_failure_kind = 'unreachable', last_sync_started_at = now()",
  );
  scratchQuery("update integration_credential set last_error = 'unreachable' where provider = 'withings'");
  // Push the scale's newest reading past the staleness threshold so the cause
  // has somewhere to be drawn.
  scratchQuery("update withings_connection set last_successful_sync_at = now() - interval '40 hours'");

  for (const [path, name] of [
    ['/', 'today'],
    ['/health', 'health'],
  ] as const) {
    const started = Date.now();
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const took = Date.now() - started;
    console.log(`${name} rendered in ${took} ms with the Withings origin blocked`);
    // No loading state for longer than three seconds. The screens do not call
    // the adapter at all, so this measures the page and not a timeout.
    expect(took).toBeLessThan(3_000);
    // The shell's route-level loading UI draws `.skel`, so this is the loading
    // state itself and not a proxy for it. The bound is on the assertion rather
    // than after it: three seconds to clear, or the line fails.
    await expect(page.locator('.skel')).toHaveCount(0, { timeout: 3_000 });
    await page.screenshot({ path: `${CAPTURES}/f43-${name}-blocked.png`, fullPage: true });
  }

  // The cause, by cause and not by age, on the settings card.
  await openSettings(page);
  await expect(page.locator('[data-withings-cause="unreachable"]')).toContainText(
    /could not reach Withings/i,
  );
  await page.screenshot({ path: `${CAPTURES}/f43-cause.png`, fullPage: true });
});

test('F42. the four states the status screen has to show, each captured', async ({ page }) => {
  // Connected and expiring are unreachable in demonstration mode by design:
  // `stateOf` calls a demonstration connection a demonstration one whatever the
  // token underneath is doing. The live branch renders from the connection row
  // and needs no credential, so this restarts the instance in live mode with an
  // empty client pair and writes the row each state is a photograph of.
  console.log(testStackWithWithingsMode('live', 'up'));
  await waitForScratch();
  await signIn(page);

  const states: Array<[string, string, string]> = [
    ['connected', "state = 'connected', refresh_rotated_at = now()", 'Connected'],
    [
      'expiring',
      "state = 'connected', refresh_rotated_at = now() - interval '350 days'",
      'Expiring',
    ],
    ['revoked', "state = 'revoked', last_failure_kind = 'reconnect'", 'Revoked'],
  ];

  for (const [name, patch, word] of states) {
    // The sync instant is set on every state so the two places the screen
    // prints it can be compared. It is the same column the importer writes.
    scratchQuery(
      `update withings_connection set mode = 'live', last_successful_sync_at = timestamptz '2026-08-23 14:01:30+02', ${patch}`,
    );
    await openSettings(page);
    await expect(card(page)).toHaveAttribute('data-withings', name);
    await expect(page.locator('[data-withings-state]')).toHaveText(new RegExp(word, 'i'));
    await expect(page.getByText(/last successful sync/i)).toBeVisible();
    console.log(`state ${name} rendered as ${await page.locator('[data-withings-state]').innerText()}`);

    /*
     * A TEST BUTTON, IN EVERY STATE. F42 names one as part of what the status
     * screen shows, and `revoked` rendered Reconnect alone: zero of them, on
     * the one card where "token or network" is the whole question.
     *
     * It counts rather than asserting visibility, because the defect was a
     * count of zero against a screen where three other states had one.
     */
    const tests = await page.locator('[data-withings] button', { hasText: /^Test$/ }).count();
    console.log(`state ${name} renders ${tests} test button(s)`);
    expect(tests).toBe(1);

    /*
     * ONE FACT, ONE ANSWER. The card and the integrations list are on the same
     * screen and used to read different columns, so this installation showed
     * "23 Aug, 14:01" on one and "No successful sync yet" on the other. Both
     * strings are read and compared here rather than each being checked for
     * plausibility on its own.
     */
    const onCard = (await page.locator('[data-withings-last-sync]').innerText()).trim();
    const inList = (
      await page.locator('[data-integration="withings"] [data-integration-last-sync]').innerText()
    ).trim();
    console.log(`state ${name}: card says "${onCard}", list says "${inList}"`);
    expect(onCard).not.toMatch(/no successful sync/i);
    expect(inList).toContain(onCard);

    await page.screenshot({ path: `${CAPTURES}/f42-${name}.png`, fullPage: true });
  }

  // The revoked card names the cause and not a status code.
  await expect(page.locator('[data-withings-cause="reconnect"]')).toContainText(/refused the stored token/i);

  // And back to demonstration, which is the fourth.
  console.log(testStackWithWithingsMode('demo', 'up'));
  await waitForScratch();
  await signIn(page);
  await openSettings(page);
  await expect(card(page)).toHaveAttribute('data-withings', 'demo');
  await page.screenshot({ path: `${CAPTURES}/f42-demonstration.png`, fullPage: true });
});

test('A2. an import question can be answered, and answering it closes it', async ({ page }) => {
  await signIn(page);

  // The owner corrects the newest weight by hand, through the shipped value
  // sheet, and then the scale sends a different number for the same measure.
  const newest = scratchQuery(`
    select id from measurement where metric = 'weight' and correction_index = 0
    order by measured_at desc limit 1
  `);
  await page.goto(`/value/${newest}`);
  await page.waitForLoadState('networkidle');

  const field = page.locator('#correction-value');
  await field.click();
  await field.press('Control+a');
  // TYPED, NEVER FILLED. `fill()` sets a whole value in one input event and
  // passed for four rounds over a field that could not be typed into at all.
  await field.pressSequentially('84.1', { delay: 20 });
  await page.locator('#correction-reason').pressSequentially('read on the other scale', { delay: 5 });
  await page.getByRole('button', { name: /save the correction/i }).click();
  await expect(page.getByText(/append only/i).first()).toBeVisible({ timeout: 20_000 });

  // Make the account disagree: rewind the cursor so the revised group comes
  // back on the next sync.
  scratchQuery("update withings_connection set cursor = cursor - 100000, demo_stage = 'revised'");
  await openSettings(page);
  await page.getByRole('button', { name: /^sync now$/i }).click();
  await expect(page.getByText(/waiting on you/i)).toBeVisible({ timeout: 60_000 });

  const open = Number(scratchQuery("select count(*) from import_question where state = 'open'"));
  console.log(`open import questions after the disagreeing sync: ${open}`);
  expect(open).toBe(1);

  // The answer path, on the value sheet the notice points at.
  const held = scratchQuery("select measurement_id from import_question where state = 'open'");
  await page.goto(`/value/${held}`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${CAPTURES}/a2-question.png`, fullPage: true });

  // Both values with their provenance, before any choice is made.
  await expect(page.locator('[data-choice="stored"]')).toContainText('84.1');
  await expect(page.locator('[data-choice="stored"]')).toContainText(/manual/i);
  await expect(page.locator('[data-choice="incoming"]')).toContainText(/demo/i);
  // Nothing is preselected: two numbers that disagree, and defaulting to
  // either would be the app choosing for him.
  await expect(page.locator('[data-choice="stored"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-choice="incoming"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: /answer and close this question/i })).toBeDisabled();

  await page.locator('[data-choice="incoming"]').click();
  await page.locator('#answer-reason').pressSequentially('the scale re-read it', { delay: 5 });
  await page.getByRole('button', { name: /answer and close this question/i }).click();
  await expect(page.getByText(/this question is closed/i)).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `${CAPTURES}/a2-answered.png`, fullPage: true });

  const closed = scratchQuery(`
    select state || '|' || coalesce(answer, 'none') || '|' || (answered_at is not null)
    from import_question limit 1
  `);
  console.log(`the question after answering: ${closed}`);
  expect(closed).toMatch(/^answered\|/);
  expect(closed).toContain('|t');
  expect(Number(scratchQuery("select count(*) from import_question where state = 'open'"))).toBe(0);

  // The choice wrote a correction naming the question, and the chain grew.
  const naming = scratchQuery(`
    select count(*) from measurement
    where correction_reason like '%' || (select id from import_question limit 1) || '%'
  `);
  expect(Number(naming)).toBe(1);

  // And the warning is gone from Today.
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(/imports are waiting on you|1 import is waiting/i)).toHaveCount(0);
  await page.screenshot({ path: `${CAPTURES}/a2-today-clear.png`, fullPage: true });
});

test('A1. the append-only table refuses an upsert, which is why the importer inserts', async () => {
  // A1's ruling, read back off the running database rather than quoted. An
  // `ON CONFLICT DO UPDATE` fires the same trigger a bare UPDATE fires, so the
  // plan's original word "upserts" was impossible to execute.
  const existing = scratchQuery(`
    select id || '|' || source || '|' || coalesce(external_key, '')
    from measurement where external_key is not null limit 1
  `);
  const [id, source, key] = existing.split('|');
  expect(key.length).toBeGreaterThan(0);

  const upsert = scratchAttempt(`
    insert into measurement (
      id, metric, raw_value, raw_unit, value, unit, time_zone, source, measured_at,
      confidence, import_version, dedup_decision, dedup_reason, source_record_id, root_id,
      external_key, external_modified
    ) select '${id}-upsert', metric, '1.0', raw_unit, 1.0, unit, time_zone, '${source}', measured_at,
             confidence, import_version, 'unique', 'probe', source_record_id, '${id}-upsert',
             '${key}', external_modified
      from measurement where id = '${id}'
      on conflict (source, external_key) do update set raw_value = '1.0'
  `);
  console.log(`the database answered an upsert on (source, external_key) with: ${upsert}`);
  expect(upsert).toMatch(/append only|restrict_violation/i);
  expect(scratchQuery(`select raw_value from measurement where id = '${id}'`)).not.toBe('1.0');

  // And a plain ON CONFLICT DO NOTHING, which is what the importer uses, is
  // accepted and writes nothing. The difference between the two is the whole
  // of A1.
  const doNothing = scratchAttempt(`
    insert into measurement (
      id, metric, raw_value, raw_unit, value, unit, time_zone, source, measured_at,
      confidence, import_version, dedup_decision, dedup_reason, source_record_id, root_id,
      external_key, external_modified
    ) select '${id}-nothing', metric, '1.0', raw_unit, 1.0, unit, time_zone, '${source}', measured_at,
             confidence, import_version, 'unique', 'probe', source_record_id, '${id}-nothing',
             '${key}', external_modified
      from measurement where id = '${id}'
      on conflict (source, external_key) do nothing
  `);
  console.log(`the same insert with DO NOTHING answered: ${doNothing}`);
  expect(doNothing).toBe('INSERT 0 0');
});
