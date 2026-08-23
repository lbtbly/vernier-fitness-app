import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from './fixtures';
import {
  dropScratchDatabase,
  restartScratch,
  scratchAttempt,
  scratchEncryptionBinaries,
  ensureScratchOwner,
  importExportScript,
  namedQuery,
  projectRoot,
  restoreScript,
  scratchContainerExec,
  scratchQuery,
  scratchSignInLink,
  testStack,
  testStackWithBackupDir,
  waitForScratch,
} from './host';

/**
 * Slice 13, end to end, on the scratch instance.
 *
 * WHY EVERY LINE OF THIS IS HERE AND NOT AT THE LIVE ORIGIN. This file writes an
 * archive, corrupts three copies of it, rebuilds a database from it, exports
 * everything, re-imports it, and then PERMANENTLY DELETES A CATEGORY. The
 * owner's install holds the only copy of anything real in this product and
 * `measurement` refuses DELETE, so a deletion driven there would be exactly the
 * loss this slice exists to prevent, executed by the test for it.
 *
 * The instance is started with a temporary directory as its CONFIGURED archive
 * destination, and restarted without one for the fallback state. Neither state
 * touches the owner's iCloud folder.
 *
 * F124, F125, F126, F127, F128, F130, F131, F132, F133, C16, R4.
 */

const CAPTURES = `${projectRoot}.forge/evidence/slice-13/captures`;
const DOWNLOADS = `${projectRoot}.forge/evidence/slice-13/downloads`;

/** The database a restore is rebuilt into. Never the live one, never the scratch one. */
const RESTORE_TARGET = 'vernier_restore_check';
const IMPORT_TARGET = 'vernier_import_check';

/** The host directory that stands in for the iCloud folder. */
let configured = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  mkdirSync(CAPTURES, { recursive: true });
  mkdirSync(DOWNLOADS, { recursive: true });
  configured = mkdtempSync(join(tmpdir(), 'vernier-icloud-'));
  // Demonstration mode ON, so the database has rows in it. A deletion that
  // returned zero over an empty database, or a restore that matched zero
  // against zero, would be the shape of pass this project keeps finding.
  console.log(testStackWithBackupDir(configured, 3, 'reset'));
  await waitForScratch();
  await ensureScratchOwner();
});

test.afterAll(() => {
  dropScratchDatabase(RESTORE_TARGET);
  dropScratchDatabase(IMPORT_TARGET);
  rmSync(configured, { recursive: true, force: true });
  // Put the instance back the way the rest of the suite expects it.
  testStack('reset');
});

async function signIn(page: Page) {
  await page.goto(scratchSignInLink());
  await page.waitForURL(/\/$/);
  await page.waitForLoadState('networkidle');
}

async function backUpNow(page: Page) {
  await page.goto('/settings/data');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-action="back-up-now"]').click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
}

function archivesIn(directory: string): string[] {
  return readdirSync(directory)
    .filter((name) => /^vernier-\d{8}T\d{6}Z\.archive$/.test(name))
    .sort();
}

test('F124. the archive holds a dump, the volume and a manifest, and no encryption binary exists to invoke', async ({
  page,
}) => {
  await signIn(page);
  await backUpNow(page);

  const written = archivesIn(configured);
  console.log(`configured destination ${configured}:\n${written.join('\n')}`);
  expect(written.length).toBeGreaterThan(0);

  const verified = restoreScript('verify', join(configured, written[written.length - 1]));
  console.log(verified.output);
  expect(verified.status).toBe(0);
  expect(verified.stdout).toContain('manifest.json');
  expect(verified.stdout).toContain('schema.sql');
  expect(verified.stdout).toContain('data.sql');
  expect(verified.stdout).toContain('storage.tar');
  expect(verified.stdout).toContain('every chunk authenticated and every member matched its digest');
  // The population: a manifest naming three tables would verify just as
  // happily, and would be most of a backup.
  const tables = verified.stdout.split('\n').filter((line) => /^ {2}(public|drizzle)\./.test(line));
  console.log(`the manifest names ${tables.length} tables`);
  expect(tables.length).toBeGreaterThan(60);
  expect(verified.stdout).toContain('drizzle.__drizzle_migrations');

  /*
   * THE PROCESS TRACE, AND IT IS STRONGER THAN A TRACE. A trace shows that no
   * encryption binary was invoked during one run. This shows that there is none
   * in the image to invoke, in any run, ever, and prints the population it
   * looked through so a zero over an empty PATH cannot pass.
   */
  const census = scratchEncryptionBinaries();
  console.log(
    `${census.onPath} executables on PATH in the image; encryption and dump tools present: ` +
      `${census.present.length === 0 ? 'none' : census.present.join(', ')}`,
  );
  expect(census.onPath).toBeGreaterThan(50);
  expect(census.present).toEqual([]);

  // And nothing in the archive code could spawn one even if it were there.
  const spawns = execFileSync(
    'bash',
    [
      '-c',
      `grep -rn "child_process\\|execFile\\|spawn(" ${projectRoot}src/lib/backup ${projectRoot}src/db/backup.ts || echo none`,
    ],
    { encoding: 'utf8' },
  ).trim();
  console.log(`child_process under src/lib/backup: ${spawns}`);
  expect(spawns).toBe('none');
});

test('F125. a truncated, a reordered and a byte-flipped archive each exit non-zero with a named error', async () => {
  const latest = archivesIn(configured).at(-1)!;
  const source = join(configured, latest);
  const damaged = mkdtempSync(join(tmpdir(), 'vernier-damaged-'));
  const lines: string[] = [];

  try {
    // The whole one first, so the three failures below are read against a run
    // that is known to pass on the same file.
    const good = restoreScript('verify', source);
    lines.push(`whole      exit ${good.status}`);
    expect(good.status).toBe(0);

    // The population beside the three failures: how many chunks this archive
    // actually holds. The swap used to be guarded by a rule that it needs four
    // of them, this instance writes two or three, and the guard refused before
    // one verification ran. A run that prints the count cannot hide that again.
    const layout = restoreScript('frames', source);
    console.log(layout.output.trim());
    expect(layout.status).toBe(0);
    const chunks = Number(/^chunks\s+(\d+)$/m.exec(layout.stdout)?.[1] ?? 0);
    expect(chunks).toBeGreaterThanOrEqual(2);

    for (const mode of ['truncate', 'reorder', 'flip'] as const) {
      const out = join(damaged, `${mode}.archive`);
      const made = restoreScript('corrupt', source, '--mode', mode, '--out', out);
      console.log(made.output.trim());
      expect(made.status, `making the ${mode} copy`).toBe(0);
      // The tool says which code it expects the reader to raise. Asserting the
      // two agree is what stops a damaged file failing for a reason nobody
      // chose: bytes cut at the wrong offset still fail, and would still be
      // read as proof of something they do not prove.
      const expected = /^expect\s+(\S+)$/m.exec(made.stdout)?.[1] ?? '';
      expect(expected, `the ${mode} copy names the code it expects`).toMatch(
        /^archive_(truncated|chunk_unauthenticated)$/,
      );

      const verified = restoreScript('verify', out);
      const named = verified.stderr.trim().split('\n').at(-1) ?? '';
      lines.push(`${mode.padEnd(10)} exit ${verified.status}  ${named}`);
      expect(verified.status).not.toBe(0);
      expect(named).toMatch(/archive_(truncated|chunk_unauthenticated)/);
      expect(named, `the ${mode} copy failed for the reason it was broken in`).toContain(expected);
    }
    console.log(lines.join('\n'));
    expect(lines[1]).toContain('archive_truncated');
    expect(lines[2]).toContain('archive_chunk_unauthenticated');
    expect(lines[3]).toContain('archive_chunk_unauthenticated');
    writeFileSync(`${CAPTURES}/f125-corruption.txt`, lines.join('\n'));
  } finally {
    rmSync(damaged, { recursive: true, force: true });
  }
});

test('F126. a restore rebuilds a database whose row counts match the archive exactly', async () => {
  const latest = archivesIn(configured).at(-1)!;
  const restored = restoreScript(
    'restore',
    join(configured, latest),
    '--into',
    RESTORE_TARGET,
    // The check is recorded on the SCRATCH instance, never on the owner's.
    // Without this the drill would write a row into his database on every run.
    '--record-into',
    'vernier_scratch',
  );
  console.log(restored.output);
  expect(restored.status).toBe(0);
  expect(restored.stdout).toContain('every table came back with the count the archive recorded');

  /*
   * AND THE COMPARISON IS MADE AGAIN HERE, against the SOURCE database rather
   * than against the archive's own manifest. The script compares the manifest
   * to the restored database, and a dump that wrote the same wrong number in
   * both would pass that. This asks the two databases the same question.
   */
  const counted = (database: string) =>
    Number(
      namedQuery(
        database,
        `select (select count(*) from measurement) + (select count(*) from source_record)
              + (select count(*) from health_sample) + (select count(*) from movement)`,
      ),
    );
  const source = counted('vernier_scratch');
  const target = counted(RESTORE_TARGET);
  console.log(`four tables: ${source} rows in vernier_scratch, ${target} rows in ${RESTORE_TARGET}`);
  expect(source).toBeGreaterThan(0);
  expect(target).toBe(source);

  // The restore check is on the record, which is what the screen reads.
  const recorded = scratchQuery(
    "select outcome || ' ' || tables_compared from restore_check order by checked_at desc limit 1",
  );
  console.log(`restore_check: ${recorded}`);
  expect(recorded).toContain('matched');
});

test('F128. with retention set to 3, a fourth run leaves exactly three archives', async ({ page }) => {
  await signIn(page);
  const listings: string[] = [];
  for (let run = 1; run <= 4; run += 1) {
    await backUpNow(page);
    const listing = archivesIn(configured);
    listings.push(`after run ${run}: ${listing.length} archive(s)\n  ${listing.join('\n  ')}`);
  }
  console.log(listings.join('\n'));
  writeFileSync(`${CAPTURES}/f128-retention.txt`, listings.join('\n'));
  const left = archivesIn(configured);
  expect(left).toHaveLength(3);
  // The three NEWEST, which is what retention means.
  expect(left).toEqual([...left].sort());
  const kept = Number(scratchQuery('select kept from backup_run order by started_at desc limit 1'));
  const removed = Number(scratchQuery('select removed from backup_run order by started_at desc limit 1'));
  console.log(`the run recorded kept=${kept} removed=${removed}`);
  expect(kept).toBe(3);
  expect(removed).toBeGreaterThan(0);
});

test('F130 and R4. both exports download from the screen, re-import with matching counts, and the report is readable', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/settings/data');
  await page.waitForLoadState('networkidle');

  const files: Record<string, string> = {};
  for (const kind of ['json', 'csv', 'pdf'] as const) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator(`[data-export="${kind}"]`).click(),
    ]);
    const path = join(DOWNLOADS, download.suggestedFilename());
    await download.saveAs(path);
    files[kind] = path;
    console.log(`${kind}: ${download.suggestedFilename()}, ${readFileSync(path).length} bytes`);
  }
  await page.screenshot({ path: `${CAPTURES}/r4-export.png`, fullPage: true });

  // The structured export, back into a scratch database.
  const json = JSON.parse(readFileSync(files.json, 'utf8')) as {
    meta: { tables: string[]; excluded: Array<{ table: string; reason: string }> };
    tables: Record<string, unknown[]>;
  };
  console.log(
    `the JSON carries ${json.meta.tables.length} tables and names ${json.meta.excluded.length} exclusions`,
  );
  expect(json.meta.tables.length).toBeGreaterThan(30);
  expect(Object.values(json.tables).some((rows) => rows.length > 0)).toBe(true);
  // No credential table is in it, and the file says why each one is out.
  for (const table of ['owner', 'session', 'integration_credential', 'webauthn_credential']) {
    expect(json.tables[table]).toBeUndefined();
    expect(json.meta.excluded.some((entry) => entry.table === table)).toBe(true);
  }

  namedQuery('vernier_scratch', 'select 1');
  dropScratchDatabase(IMPORT_TARGET);
  // The target carries the schema and the reference data: it is a copy of the
  // scratch instance's own database, made the way a restore makes one.
  const rebuilt = restoreScript(
    'restore',
    join(configured, archivesIn(configured).at(-1)!),
    '--into',
    IMPORT_TARGET,
  );
  expect(rebuilt.status).toBe(0);

  for (const kind of ['json', 'csv'] as const) {
    const imported = importExportScript(files[kind], '--into', IMPORT_TARGET, '--truncate');
    console.log(imported.output);
    expect(imported.status).toBe(0);
    expect(imported.stdout).toContain('every table holds exactly what the file carried');
  }

  // The PDF, read by a parser rather than looked at.
  const { extractText, getDocumentProxy } = await import('unpdf');
  const document = await getDocumentProxy(new Uint8Array(readFileSync(files.pdf)));
  const { totalPages, text } = await extractText(document, { mergePages: true });
  console.log(`the report is ${totalPages} page(s):\n${text.slice(0, 400)}`);
  expect(totalPages).toBeGreaterThanOrEqual(1);
  expect(text).toContain('Vernier health report');
  expect(text).toContain('not a medical document');
});

test('F131 and R4. a category is deleted behind a typed phrase, and the query afterwards returns zero', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/settings/data');
  await page.waitForLoadState('networkidle');

  /*
   * THE POPULATION FIRST. A zero afterwards is evidence only beside what was
   * there before, and a category that was empty to begin with would report the
   * same zero. `phone_health` is chosen because the demonstration seed fills it
   * and because deleting it leaves the weight series alone, so the screens the
   * rest of this suite grades still have something on them.
   */
  const before = Number(scratchQuery('select count(*) from health_sample'));
  const batches = Number(scratchQuery('select count(*) from ingest_batch'));
  console.log(`before: ${before} health_sample rows, ${batches} ingest_batch rows`);
  expect(before).toBeGreaterThan(0);

  await page.locator('[data-delete-category]').selectOption('phone_health');
  await page.waitForTimeout(200);
  const shown = await page.locator('[data-delete-rows]').innerText();
  console.log(`the screen offers: ${shown}`);

  const button = page.locator('[data-action="delete-category"]');
  await expect(button).toBeDisabled();

  // TYPED, never filled. `fill()` sets a whole value in one input event and has
  // passed for four rounds in this project over a field that could not be typed
  // into at all. The phrase is typed character by character, which is what the
  // owner does.
  const field = page.locator('[data-delete-phrase]');
  await field.click();
  await field.pressSequentially('delete phone health', { delay: 25 });
  expect(await field.inputValue()).toBe('delete phone health');
  await expect(button).toBeEnabled();

  await page.screenshot({ path: `${CAPTURES}/f131-before.png`, fullPage: true });
  await button.click();
  await expect(page.locator('[data-delete-notice]')).toBeVisible();
  const notice = await page.locator('[data-delete-notice]').innerText();
  console.log(`the screen says: ${notice}`);
  await page.screenshot({ path: `${CAPTURES}/f131-after.png`, fullPage: true });

  const after = Number(scratchQuery('select count(*) from health_sample'));
  const afterBatches = Number(scratchQuery('select count(*) from ingest_batch'));
  console.log(`after: ${after} health_sample rows, ${afterBatches} ingest_batch rows`);
  expect(after).toBe(0);
  expect(afterBatches).toBe(0);

  // The deletion is on the record, and the record survives what it describes.
  const recorded = scratchQuery(
    "select category || ' ' || outcome || ' ' || (before::jsonb ->> 'health_sample') from deletion_run order by requested_at desc limit 1",
  );
  console.log(`deletion_run: ${recorded}`);
  expect(recorded).toContain('phone_health done');
  expect(recorded).toContain(String(before));

  /*
   * AND THE PHRASE IS CHECKED BY THE DATABASE, NOT ONLY BY THE SCREEN.
   *
   * The same door, called directly with a phrase that belongs to a different
   * category, on a table that still has rows in it. `scratchAttempt` keeps the
   * refusal rather than throwing it, because the refusal IS the result. A
   * handler that stopped checking, a script that called the function itself, or
   * a hand at a psql prompt all meet this.
   */
  const measurements = Number(scratchQuery('select count(*) from measurement'));
  const refused = scratchAttempt(
    "select vernier_delete_category('body', 'delete everything', array['measurement'])::text",
  );
  console.log(`${measurements} measurement rows; the door answered: ${refused}`);
  expect(measurements).toBeGreaterThan(0);
  expect(refused).toContain('does not match');
  expect(Number(scratchQuery('select count(*) from measurement'))).toBe(measurements);

  // And it can never reach the account, whatever a caller asks it for.
  const denied = scratchAttempt(
    "select vernier_delete_category('body', 'delete body', array['owner'])::text",
  );
  console.log(`asked for the owner table, the door answered: ${denied}`);
  expect(denied).toContain('never deletable');
});

test('F132. the machine screen shows both states, warns at its thresholds and renders no credential', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/settings/data');
  await page.waitForLoadState('networkidle');

  // Healthy: an archive that verified minutes ago, both containers up.
  await expect(page.locator('[data-card="machine"]')).toBeVisible();
  await expect(page.locator('[data-container="app"]')).toBeVisible();
  await expect(page.locator('[data-container="database"]')).toBeVisible();
  await expect(page.locator('[data-disk="storage"]')).toBeVisible();
  await expect(page.locator('[data-machine-archive]')).toBeVisible();
  const thresholds = await page.locator('[data-thresholds]').innerText();
  console.log(`stated thresholds: ${thresholds}`);
  expect(thresholds).toMatch(/\d+ hours/);
  await page.screenshot({ path: `${CAPTURES}/f132-healthy.png`, fullPage: true });

  /*
   * NO CREDENTIAL, SEARCHED FOR RATHER THAN ASSERTED. A value is seeded into
   * the credential store and the rendered markup is searched for it. A screen
   * that printed one would be caught by the string itself rather than by
   * somebody reading the page.
   */
  const planted = 'seeded-secret-value-8f2c41';
  scratchQuery(
    `insert into integration_credential (provider, state, scope, secret_ciphertext, secret_nonce, secret_tag, key_fingerprint)
     values ('withings', 'connected', 'user.metrics', '${planted}', '${planted}-nonce', '${planted}-tag', '${planted}-fp')
     on conflict (provider) do update set secret_ciphertext = '${planted}',
       secret_nonce = '${planted}-nonce', secret_tag = '${planted}-tag', key_fingerprint = '${planted}-fp'`,
  );
  await page.reload();
  await page.waitForLoadState('networkidle');
  const markup = await page.content();
  console.log(`the rendered markup is ${markup.length} characters; searching it for the seeded value`);
  expect(markup.length).toBeGreaterThan(5000);
  expect(markup).not.toContain(planted);

  // Degraded: an archive that failed, an old restore check, a source gone quiet.
  scratchQuery(
    `update backup_run set outcome = 'failed', integrity = 'unchecked', cause = 'not_writable',
       detail = '{"errno":"EACCES"}'::jsonb, finished_at = now()
     where id = (select id from backup_run order by started_at desc limit 1)`,
  );
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-archive-integrity]')).toBeVisible();
  await page.screenshot({ path: `${CAPTURES}/f132-degraded.png`, fullPage: true });
  const degraded = await page.locator('[data-card="archive"]').innerText();
  console.log(`the archive card in its degraded state:\n${degraded}`);
});

test('F133. three seeded failures each raise one alert naming the surface, the cause and one action', async ({
  page,
}) => {
  /*
   * ONE FAILURE PER CLASS, SEEDED AT ITS SOURCE rather than by writing an alert
   * row directly. The sweep derives alerts from the state three different
   * subsystems keep for their own reasons, so seeding the state is what proves
   * the derivation; seeding the alert would prove only that a banner renders.
   */
  scratchQuery('delete from operator_alert');
  scratchQuery(
    `update backup_run set outcome = 'failed', cause = 'not_writable',
       detail = '{"errno":"EACCES","directory":"/Users/owner/Library/Mobile Documents/com~apple~CloudDocs/Vernier"}'::jsonb
     where id = (select id from backup_run order by started_at desc limit 1)`,
  );
  scratchQuery(
    `insert into job_run (id, job_name, period_start, state, attempt, detail, finished_at)
     values ('seeded-failure', 'weekly_review', '2026-08-23T20:00', 'failed', 2, 'stale-timeout', now())
     on conflict (job_name, period_start) do update set state = 'failed', detail = 'stale-timeout'`,
  );
  scratchQuery(
    `update integration_credential set state = 'error', last_error = 'invalid_grant' where provider = 'withings'`,
  );

  // A device to send to, so the send path is taken and its outcome recorded.
  // Nothing arrives: no push service on this machine can be reached, exactly as
  // tests/e2e/push.spec.ts says. What is proven here is ONE send per alert.
  scratchQuery(
    `insert into push_subscription (id, endpoint, p256dh, auth, application_server_key)
     values ('seeded-device', 'http://127.0.0.1:9/push/seeded', 'BJxV', 'auth', 'key')
     on conflict (endpoint) do nothing`,
  );

  // The boot sweep, which is the product's own path: a container that comes
  // back up reads the state and says what is wrong without waiting five minutes.
  restartScratch();
  await waitForScratch();

  const raised = scratchQuery(
    "select key || ' | ' || surface || ' | ' || cause || ' | ' || route from operator_alert where cleared_at is null order by key",
  );
  console.log(`open alerts:\n${raised}`);
  const keys = raised.split('\n').filter(Boolean);
  expect(keys.length).toBeGreaterThanOrEqual(3);
  expect(raised).toContain('backup');
  expect(raised).toContain('job:weekly_review');
  expect(raised).toContain('integration:withings');

  // One row per failing thing, and one send attempt per row.
  const perKey = scratchQuery(
    "select key || '=' || count(*) from operator_alert group by key order by key",
  );
  console.log(`alerts per key: ${perKey}`);
  for (const line of perKey.split('\n').filter(Boolean)) {
    expect(line.endsWith('=1')).toBe(true);
  }
  const sends = scratchQuery(
    "select count(*) || ' operator send(s), statuses ' || coalesce(string_agg(distinct status::text, ','), 'none') from push_delivery where kind = 'operator'",
  );
  console.log(`push: ${sends}`);

  await signIn(page);
  await page.goto('/settings/data');
  await page.waitForLoadState('networkidle');
  const banner = page.locator('[data-operator-alerts]');
  await expect(banner).toBeVisible();
  const text = await banner.innerText();
  console.log(`the banner reads:\n${text}`);
  // The surface, the cause and one action, for each of the three.
  expect(text).toContain('The nightly backup');
  expect(text).toContain('The Sunday review');
  expect(text).toContain('Open');
  await page.screenshot({ path: `${CAPTURES}/f133-banner.png`, fullPage: true });

  // And the same banner on Settings, which is the screen he opens first.
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-operator-alerts]')).toBeVisible();
  await page.screenshot({ path: `${CAPTURES}/f133-settings.png`, fullPage: true });

  // It clears itself when the cause goes. Nobody dismisses anything.
  scratchQuery(
    `update integration_credential set state = 'connected', last_error = null where provider = 'withings'`,
  );
  restartScratch();
  await waitForScratch();
  const cleared = scratchQuery(
    "select count(*) from operator_alert where key = 'integration:withings' and cleared_at is not null",
  );
  console.log(`the integration alert cleared: ${cleared}`);
  expect(Number(cleared)).toBeGreaterThan(0);
});

test('F127. with the configured destination gone, the archive lands in the fallback and the screen names both', async ({
  page,
}) => {
  // The same instance, restarted with NO configured destination, which is what
  // an unavailable iCloud folder looks like from inside the container.
  console.log(testStackWithBackupDir(null, 3, 'up'));
  await waitForScratch();

  await signIn(page);
  await backUpNow(page);

  const inside = scratchContainerExec('ls -1 /app/storage/backups');
  console.log(`the local fallback holds:\n${inside}`);
  expect(inside).toMatch(/vernier-\d{8}T\d{6}Z\.archive/);

  const row = scratchQuery(
    "select destination || ' | ' || cause || ' | ' || outcome || ' | ' || integrity from backup_run order by started_at desc limit 1",
  );
  console.log(`the run recorded: ${row}`);
  expect(row).toContain('fallback');

  await page.goto('/settings/data');
  await page.waitForLoadState('networkidle');
  const alerts = page.locator('[data-operator-alerts]');
  await expect(alerts).toBeVisible();
  const text = await alerts.innerText();
  console.log(`the alert reads:\n${text}`);
  expect(text).toContain('The nightly backup');
  await page.screenshot({ path: `${CAPTURES}/f127-fallback.png`, fullPage: true });

  const destination = await page.locator('[data-archive-destination]').getAttribute('data-archive-destination');
  expect(destination).toBe('fallback');

  // And the archive in the fallback is a real one: the same verifier opens it
  // out of the container, which is the path an operator takes when the
  // configured destination is the thing that failed.
  const name = inside.split('\n').filter(Boolean).at(-1)!;
  const verified = restoreScript('verify', name);
  console.log(verified.output.slice(0, 900));
  expect(verified.status).toBe(0);
});

test('C16. settings and data at three viewports', async ({ page }) => {
  await signIn(page);
  for (const width of [393, 768, 1280]) {
    await page.setViewportSize({ width, height: width === 393 ? 852 : 1024 });
    for (const [name, path] of [
      ['settings', '/settings'],
      ['data', '/settings/data'],
    ] as const) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${CAPTURES}/c16-${name}-${width}.png`, fullPage: true });
      // Nothing overflows sideways at any of the three.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      console.log(`${path} at ${width}: horizontal overflow ${overflow}px`);
      expect(overflow).toBeLessThanOrEqual(0);
    }
  }

  // The screen carries what C16 names: integration status with its last sync and
  // a test control, the AI consent switches, export, permanent delete, archive
  // status and machine state.
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-integration-last-sync]').first()).toBeVisible();
  await expect(page.locator('[data-card="ai-consent"]')).toBeVisible();
  await expect(page.locator('[data-card="data-and-backups"]')).toBeVisible();
  await page.goto('/settings/data');
  await page.waitForLoadState('networkidle');
  for (const card of ['archive', 'export', 'machine', 'delete', 'no-credential', 'restore']) {
    await expect(page.locator(`[data-card="${card}"]`)).toBeVisible();
  }
});
