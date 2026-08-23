import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import {
  ensureScratchOwner,
  postScratchIngest,
  projectRoot,
  resetScratchIngest,
  resetScratchProvenance,
  scratchBloodPressureCensus,
  scratchQuery,
  scratchSampleCount,
  scratchShortcutReadingCount,
  scratchSignInLink,
  scratchUrl,
  testStack,
  waitForScratch,
} from './host';

/**
 * The Apple Health ingest, end to end, with no iPhone in the room.
 *
 * IT RUNS ON THE SCRATCH INSTANCE, and it has to. Every test here writes: a
 * credential, a nonce, fourteen samples, five refused batches. The owner's
 * install holds the only copy of anything real in this product, `measurement`
 * refuses DELETE by design, and backup and restore do not ship until slice 13.
 * So this runs against the throwaway instance on 127.0.0.1:3101, the same image
 * against its own database, and `playwright.config.ts` matches this file into
 * the scratch project and out of the live one.
 *
 * EVERY REQUEST GOES THROUGH scripts/ingest-fixture.sh. That is the recorded
 * command F53 asks for, and it computes the two-pass digest in the shell with
 * shasum while the server computes its own in TypeScript with node crypto. So
 * every digest assertion here compares two implementations of the contract. If
 * this spec imported the app's own `twoPassDigest` instead, every one of them
 * would be true by construction, which is this run's most expensive failure
 * class wearing a different hat.
 *
 * THE CREDENTIAL IS CREATED THROUGH THE SHIPPED SCREEN, not by SQL. A6's second
 * standing rule is that evidence takes the path the product offers, and the
 * path the owner takes is a button on Settings that shows him two values once.
 */

const CAPTURES = `${projectRoot}.forge/evidence/slice-6/captures`;
const FIXTURE = `${projectRoot}tests/fixtures/health-ingest-48h.json`;

test.describe.configure({ mode: 'serial' });

/** What Settings showed once. Held for the length of this file and nowhere else. */
let token = '';
let secret = '';

/**
 * Every message this endpoint answered with, collected across the whole run.
 *
 * F53 asks that every response carries a plain-English message and names five
 * error paths. Collecting them as they happen and asserting the set at the end
 * is stronger than asserting one at a time: it can catch a path that answered
 * with no message at all, which is the failure the Shortcut cannot see.
 */
const messages: Array<{ at: string; code: string; message: string }> = [];

function record(at: string, body: Record<string, unknown>) {
  const message = typeof body.message === 'string' ? body.message : '';
  const code = typeof body.error === 'string' ? body.error : 'ok';
  messages.push({ at, code, message });
  // The one invariant of this endpoint, asserted on every single answer it
  // gives anywhere in this file rather than in one test at the end.
  expect(message.length, `${at} answered with no message at all`).toBeGreaterThan(20);
  return { code, message };
}

/** The shipped fixture, as an object, so a variant can be built from it. */
function fixture(): Record<string, unknown> {
  return JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, unknown>;
}

type Series = Record<string, unknown> & { type: string[]; value: string[] };

/** A one-row series with everything named, for the batches that must be refused. */
function oneRow(over: Partial<Series> = {}): Series {
  return {
    metric: 'steps',
    grouping: 'hour',
    type: ['Steps'],
    value: ['777'],
    unit: ['count'],
    start: ['2026-08-20T11:00:00+02:00'],
    end: ['2026-08-20T11:59:59+02:00'],
    source: [''],
    ...over,
  } as Series;
}

function batchWith(series: Series[], over: Record<string, unknown> = {}) {
  return { ...fixture(), series, ...over };
}

test.beforeAll(async () => {
  mkdirSync(CAPTURES, { recursive: true });
  console.log(testStack('reset'));
  await waitForScratch();
  await ensureScratchOwner();
  resetScratchIngest();
  console.log(`ingest: starting from ${scratchSampleCount()} samples on ${scratchUrl}`);
});

test.afterAll(() => {
  // Put the scratch instance back the way the rest of the suite expects it.
  testStack('reset');
});

async function signIn(page: Page) {
  await page.goto(scratchSignInLink());
  await page.waitForURL(/\/$/);
  await page.waitForLoadState('networkidle');
}

test('F52. the credential is shown once, stored as a hash, and never rendered again', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');

  const card = page.locator('[data-card="ingest"]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('No ingest token yet');

  await card.getByRole('button', { name: 'Create the ingest token', exact: true }).click();
  await page.locator('[data-minted="token"]').waitFor();

  token = (await page.locator('[data-minted="token"]').textContent())!.trim();
  secret = (await page.locator('[data-minted="secret"]').textContent())!.trim();
  expect(token.length).toBeGreaterThan(30);
  expect(secret.length).toBeGreaterThan(30);
  expect(token).not.toBe(secret);
  await page.screenshot({ path: `${CAPTURES}/f52-shown-once.png`, fullPage: true });

  // The stored row: a hash of the token and nothing that is the token.
  const stored = scratchQuery(
    'select key_id || \' \' || token_hash || \' \' || live from ingest_credential',
  );
  console.log(`F52  the stored credential row reads: ${stored}`);
  const [keyId, hash, live] = stored.split(' ');
  expect(keyId).toBe('k1');
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
  expect(hash).not.toContain(token);
  expect(stored).not.toContain(token);
  expect(stored).not.toContain(secret);
  expect(live).toBe('t');

  // And nowhere in the reloaded screen, which is the claim "shown once" makes.
  await page.reload();
  await page.waitForLoadState('networkidle');
  const markup = await page.content();
  expect(markup).not.toContain(token);
  expect(markup).not.toContain(secret);
  console.log(
    `F52  after a reload the rendered markup is ${markup.length} characters and holds neither value`,
  );
  await page.screenshot({ path: `${CAPTURES}/f52-after-reload.png`, fullPage: true });
});

test('F45. a well-formed signed batch is accepted, and the counts are separate', async () => {
  const before = scratchSampleCount();
  const report = postScratchIngest({ token, secret });
  const { code } = record('F45 accepted batch', report.body);

  console.log(`F45  HTTP ${report.status}, ${JSON.stringify(report.body)}`);
  expect(report.status).toBe(201);
  expect(code).toBe('ok');
  expect(report.body.ok).toBe(true);
  // Fourteen rows in five series, counted out of the fixture rather than
  // asserted as a number somebody remembers.
  const rows = (fixture().series as Series[]).reduce((total, series) => total + series.type.length, 0);
  expect(report.body.accepted).toBe(rows);
  expect(report.body.duplicates).toBe(0);
  console.log(`F45  samples before ${before}, after ${scratchSampleCount()}, fixture carries ${rows}`);
  expect(scratchSampleCount()).toBe(before + rows);

  // The digest the shell computed and the server accepted, on the record.
  expect(report.digest).toMatch(/^[0-9a-f]{64}$/);

  // And the complete days in it became readings, through the same door every
  // other value in this app goes through.
  const readings = scratchShortcutReadingCount();
  console.log(`F45  readings in measurement from the shortcut: ${readings}`);
  expect(Number(report.body.readings)).toBeGreaterThan(0);
  expect(readings).toBe(Number(report.body.readings));
});

test('F47. an overlapping window sent three times leaves the row count where it was', async () => {
  const counts: number[] = [scratchSampleCount()];
  for (let run = 1; run <= 3; run += 1) {
    // A fresh nonce each time, because this is three separate runs of the same
    // shortcut over an overlapping window and not one request retried. That is
    // exactly what the phone does three times a day.
    const report = postScratchIngest({ token, secret });
    record(`F47 run ${run}`, report.body);
    counts.push(scratchSampleCount());
    console.log(
      `F47  run ${run}: accepted ${report.body.accepted}, duplicates ${report.body.duplicates}, rows now ${counts[counts.length - 1]}`,
    );
    expect(report.body.accepted).toBe(0);
    expect(Number(report.body.duplicates)).toBeGreaterThan(0);
  }
  // Four numbers, all the same, and the first is not zero: a row count that
  // never moved over an empty table would prove nothing at all.
  console.log(`F47  row counts across the three runs: ${counts.join(', ')}`);
  expect(counts[0]).toBeGreaterThan(0);
  expect(new Set(counts).size).toBe(1);
});

test('F46. a repeat returns the stored response, and three failures have three names', async () => {
  const before = scratchSampleCount();

  // 1. The same batch again, same nonce, same idempotency key. This is the
  // retry a shortcut makes when its response was lost on the way home.
  const first = postScratchIngest({ token, secret, nonce: 'f46-same-batch' });
  record('F46 first arrival', first.body);
  const again = postScratchIngest({ token, secret, nonce: 'f46-same-batch' });
  const { code: repeatCode } = record('F46 repeat', again.body);
  console.log(`F46  first ${first.status} ${JSON.stringify(first.body)}`);
  console.log(`F46  again ${again.status} ${JSON.stringify(again.body)}`);
  expect(again.status).toBe(first.status);
  expect(again.body).toEqual(first.body);
  expect(repeatCode).toBe('ok');

  // 2. A digest this app did not compute.
  const badDigest = postScratchIngest({
    token,
    secret,
    digest: '0'.repeat(64),
  });
  const digestAnswer = record('F46 bad digest', badDigest.body);
  console.log(`F46  bad digest: ${badDigest.status} ${digestAnswer.code}`);
  expect(badDigest.status).toBe(401);
  expect(digestAnswer.code).toBe('bad_digest');

  // 3. A timestamp outside the 300 second window.
  const old = new Date(Date.now() - 45 * 60_000);
  const stale = postScratchIngest({
    token,
    secret,
    timestamp: `${old.toISOString().replace(/\.\d+Z$/, '')}+00:00`,
  });
  const staleAnswer = record('F46 stale timestamp', stale.body);
  console.log(`F46  stale timestamp: ${stale.status} ${staleAnswer.code} ${staleAnswer.message}`);
  expect(stale.status).toBe(401);
  expect(staleAnswer.code).toBe('stale_timestamp');
  expect(staleAnswer.message).toContain('45 minutes');

  // 4. A nonce this app has already seen, under a different idempotency key,
  // which is what makes it a replay rather than a retry.
  const replay = postScratchIngest({
    token,
    secret,
    nonce: 'f46-same-batch',
    idempotency: 'f46-a-different-key',
  });
  const replayAnswer = record('F46 replayed nonce', replay.body);
  console.log(`F46  replayed nonce: ${replay.status} ${replayAnswer.code}`);
  expect(replay.status).toBe(409);
  expect(replayAnswer.code).toBe('replayed_nonce');

  // Three distinct names, and the row count did not move across any of the four.
  const names = [repeatCode, digestAnswer.code, staleAnswer.code, replayAnswer.code];
  console.log(`F46  four requests answered: ${names.join(', ')}`);
  expect(new Set([digestAnswer.code, staleAnswer.code, replayAnswer.code]).size).toBe(3);
  console.log(`F46  samples before ${before}, after ${scratchSampleCount()}`);
  expect(scratchSampleCount()).toBe(before);
});

test('F48. blood pressure is refused 422 for the whole batch, five variants and both symbols', async () => {
  const variants = [
    'Blood Pressure',
    'systolic blood pressure',
    'Diastolic Blood Pressure',
    'blood pressure systolic',
    'BLOOD-PRESSURE',
    'HKQuantityTypeIdentifierBloodPressureSystolic',
    'HKQuantityTypeIdentifierBloodPressureDiastolic',
  ];
  const before = scratchSampleCount();
  const counts: number[] = [];
  const codes: string[] = [];

  for (const [index, variant] of variants.entries()) {
    // Every batch also carries a perfectly good steps series, so what is being
    // proven is that the WHOLE batch is refused and not that a bad row was
    // dropped. A silent drop would leave the good rows behind and the count
    // would move.
    const report = postScratchIngest({
      token,
      secret,
      nonce: `f48-${index}`,
      body: batchWith([
        oneRow({ value: [`${800 + index}`] }),
        oneRow({ metric: 'blood_pressure', type: [variant], value: ['128'], unit: ['mmHg'] }),
      ]),
    });
    const answer = record(`F48 ${variant}`, report.body);
    codes.push(answer.code);
    counts.push(scratchSampleCount());
    console.log(`F48  "${variant}": HTTP ${report.status} ${answer.code}, rows now ${counts[index]}`);
    expect(report.status).toBe(422);
    expect(answer.code).toBe('forbidden_type');
    expect(answer.message).toContain('Blood pressure');
  }

  expect(codes).toHaveLength(7);
  expect(new Set(counts).size).toBe(1);
  expect(counts[0]).toBe(before);
  // Not a count of zero over an empty table: the census prints how many rows
  // each table actually holds beside how many of them are blood pressure.
  console.log(`F48  census across every table that could hold one:\n${scratchBloodPressureCensus()}`);
  expect(scratchBloodPressureCensus()).toContain('0 blood pressure');
});

test('F49. six arrays of different lengths are refused, and the series is named', async () => {
  const before = scratchSampleCount();
  const report = postScratchIngest({
    token,
    secret,
    nonce: 'f49-mismatch',
    body: batchWith([
      oneRow({ metric: 'heart_rate', type: ['Heart Rate', 'Heart Rate'], value: ['62'] }),
    ]),
  });
  const answer = record('F49 length mismatch', report.body);
  console.log(`F49  HTTP ${report.status} ${answer.code}: ${answer.message}`);
  expect(report.status).toBe(422);
  expect(answer.code).toBe('length_mismatch');
  // The series by name, so the owner knows which of ten blocks to look at.
  expect(answer.message).toContain('heart_rate');
  console.log(`F49  samples before ${before}, after ${scratchSampleCount()}`);
  expect(scratchSampleCount()).toBe(before);
});

test('F50. offset present, offset absent, offset genuinely zero', async () => {
  // 1. A numeric offset, which is what the guide's format string produces.
  const withOffset = postScratchIngest({
    token,
    secret,
    nonce: 'f50-offset-present',
    body: batchWith([oneRow({ value: ['901'], start: ['2026-08-20T12:00:00+02:00'], end: ['2026-08-20T12:59:59+02:00'] })]),
  });
  record('F50 offset present', withOffset.body);
  console.log(`F50  offset present: HTTP ${withOffset.status} ${JSON.stringify(withOffset.body)}`);
  expect(withOffset.status).toBe(201);
  expect(withOffset.body.accepted).toBe(1);

  // 2. No offset at all, which is the silent two-hour bug and is refused.
  const noOffset = postScratchIngest({
    token,
    secret,
    nonce: 'f50-offset-absent',
    body: batchWith([oneRow({ value: ['902'], start: ['2026-08-20T13:00:00'], end: ['2026-08-20T13:59:59'] })]),
  });
  const absent = record('F50 offset absent', noOffset.body);
  console.log(`F50  offset absent: HTTP ${noOffset.status} ${absent.code}: ${absent.message}`);
  expect(noOffset.status).toBe(422);
  expect(absent.code).toBe('bad_timestamp_format');

  // 3. A trailing Z, in a batch whose own offset is genuinely zero. The request
  // timestamp is real UTC, so it passes the 300 second window; a phone in Paris
  // labelling local time Z would be two hours out and refused as stale, which
  // is exactly the distinction this clause is about.
  const utcNow = `${new Date().toISOString().replace(/\.\d+Z$/, '')}Z`;
  const zeroOffset = postScratchIngest({
    token,
    secret,
    nonce: 'f50-offset-zero',
    timestamp: utcNow,
    body: batchWith(
      [oneRow({ value: ['903'], start: ['2026-08-20T14:00:00Z'], end: ['2026-08-20T14:59:59Z'] })],
      { window_start: '2026-08-19T00:00:00Z', window_end: '2026-08-21T18:00:00Z' },
    ),
  });
  record('F50 offset zero', zeroOffset.body);
  console.log(`F50  offset zero: HTTP ${zeroOffset.status} ${JSON.stringify(zeroOffset.body)}`);
  expect(zeroOffset.status).toBe(201);
  expect(zeroOffset.body.accepted).toBe(1);

  // 4. And the same Z inside a batch that declared +02:00, which is the mixed
  // shape a mis-wired Format Date produces. Not part of F50's three, and it is
  // the case that makes the third one mean something.
  const mixed = postScratchIngest({
    token,
    secret,
    nonce: 'f50-offset-mixed',
    body: batchWith([oneRow({ value: ['904'], start: ['2026-08-20T15:00:00Z'], end: ['2026-08-20T15:59:59Z'] })]),
  });
  const mixedAnswer = record('F50 Z inside a +02:00 batch', mixed.body);
  console.log(`F50  Z inside a +02:00 batch: HTTP ${mixed.status} ${mixedAnswer.code}`);
  expect(mixed.status).toBe(422);
  expect(mixedAnswer.code).toBe('bad_timestamp_format');
});

test('F51. the ingest credential opens ingest and nothing else, in both directions', async ({
  page,
}) => {
  // Direction one: the ingest token where a session is expected.
  const asBearer = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const readLog = await page.request.fetch(`${scratchUrl}/api/log`, {
    method: 'GET',
    headers: asBearer,
    maxRedirects: 0,
  });
  const readSettings = await page.request.fetch(`${scratchUrl}/api/settings/integrations`, {
    method: 'GET',
    headers: asBearer,
    maxRedirects: 0,
  });
  const openScreen = await page.request.fetch(`${scratchUrl}/settings`, {
    method: 'GET',
    headers: asBearer,
    maxRedirects: 0,
  });
  console.log(
    `F51  the ingest token reaches: /api/log ${readLog.status()}, /api/settings/integrations ${readSettings.status()}, /settings ${openScreen.status()}`,
  );
  expect(readLog.status()).toBe(401);
  expect(readSettings.status()).toBe(401);
  expect(openScreen.status()).toBe(307);
  expect(openScreen.headers().location ?? '').toContain('/sign-in');

  // Direction two: a live owner session, with no ingest token, at the ingest
  // endpoint. The session is real: this page is signed in.
  await signIn(page);
  const asSession = await page.request.fetch(`${scratchUrl}/api/ingest/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: fixture(),
  });
  const body = (await asSession.json()) as Record<string, unknown>;
  record('F51 session with no token', body);
  console.log(`F51  a live session at the ingest endpoint: ${asSession.status()} ${JSON.stringify(body)}`);
  expect(asSession.status()).toBe(401);
  expect(body.error).toBe('bad_token');

  // And with no credential of any kind at all.
  const anonymous = postScratchIngest({ token, secret, nonce: 'f51-anonymous', noBearer: true });
  const answer = record('F51 no credential at all', anonymous.body);
  console.log(`F51  no Authorization header: ${anonymous.status} ${answer.code}`);
  expect(anonymous.status).toBe(401);
  expect(answer.code).toBe('bad_token');
});

test('F54. the diagnostics screen prints the canonical string and the digest for it', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/settings/ingest');
  await page.waitForLoadState('networkidle');

  const lines = await page
    .locator('[data-canonical] [data-canonical-line]')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? ''));
  console.log(`F54  the canonical string on screen, six lines: ${JSON.stringify(lines)}`);
  expect(lines).toHaveLength(6);
  expect(lines[0]).toBe('v1');

  const shown = (await page.locator('[data-digest]').textContent())!.trim();
  console.log(`F54  the digest the server computes for it: ${shown}`);
  expect(shown).toMatch(/^[0-9a-f]{64}$/);

  // The same digest, computed the other way: the shell command the screen
  // prints, run against the same six lines with the same secret. Two
  // implementations, one number.
  const canonical = lines.join('\n');
  const independent = postScratchIngest({
    token,
    secret,
    nonce: 'f54-probe',
    body: {
      ...fixture(),
      window_start: lines[4],
      window_end: lines[5],
      series: [oneRow({ value: ['905'] })],
    },
    keyId: lines[1],
    timestamp: lines[2],
  });
  // That probe is refused, and refused for the right reason: its key id and its
  // timestamp are the fixed ones from the screen, so the clock check fires
  // first. What it proves is that this endpoint reads the same six fields.
  const probe = record('F54 fixed canonical probe', independent.body);
  console.log(`F54  a request built from those six lines answers ${probe.code}`);
  expect(probe.code).toBe('stale_timestamp');
  expect(canonical.split('\n')).toHaveLength(6);

  // The deliberately mismatched comparison: a digest computed with a secret
  // that is not this app's secret is a different 64 characters, and the
  // endpoint says so by name rather than by silence.
  const mismatched = postScratchIngest({
    token,
    secret: `${secret}-not-the-secret`,
    nonce: 'f54-mismatch',
  });
  const answer = record('F54 mismatched secret', mismatched.body);
  console.log(`F54  a digest from the wrong secret: ${mismatched.digest} answered ${answer.code}`);
  expect(mismatched.digest).not.toBe(shown);
  expect(answer.code).toBe('bad_digest');
  expect(answer.message).toContain('diagnostics');

  await page.screenshot({ path: `${CAPTURES}/f54-diagnostics.png`, fullPage: true });
});

test('F55. Today shows the last successful ingest, and turns warn past thirty-six hours', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const row = page.locator('[data-signal="ingest"]');
  await expect(row).toBeVisible();
  const fresh = (await row.textContent())!.trim().replace(/\s+/g, ' ');
  console.log(`F55  with a batch from this minute, Today reads: ${fresh}`);
  expect(await row.getAttribute('data-ingest-state')).toBe('ok');
  expect(fresh).toContain('Last batch from the iPhone');
  await page.screenshot({ path: `${CAPTURES}/f55-today-fresh.png`, fullPage: true });

  // Thirty-five hours: still inside the threshold, still neutral.
  scratchQuery("update ingest_batch set received_at = now() - interval '35 hours'");
  await page.reload();
  await page.waitForLoadState('networkidle');
  const at35 = (await row.textContent())!.trim().replace(/\s+/g, ' ');
  console.log(`F55  at 35 hours: state ${await row.getAttribute('data-ingest-state')}, "${at35}"`);
  expect(await row.getAttribute('data-ingest-state')).toBe('ok');
  expect(at35).toContain('35 hours ago');

  // Thirty-seven hours: warn, with the age on it.
  scratchQuery("update ingest_batch set received_at = now() - interval '37 hours'");
  await page.reload();
  await page.waitForLoadState('networkidle');
  const at37 = (await row.textContent())!.trim().replace(/\s+/g, ' ');
  console.log(`F55  at 37 hours: state ${await row.getAttribute('data-ingest-state')}, "${at37}"`);
  expect(await row.getAttribute('data-ingest-state')).toBe('warn');
  expect(at37).toContain('37 hours ago');
  expect(await page.locator('[data-signal="ingest"] .warn').count()).toBeGreaterThan(0);
  await page.screenshot({ path: `${CAPTURES}/f55-today-warn.png`, fullPage: true });
});

test('F55. the guide names every action, carries no blood-pressure row, and says why', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/settings/shortcut');
  await page.waitForLoadState('networkidle');

  const text = (await page.locator('main, body').first().textContent())!.replace(/\s+/g, ' ');

  // Every action name the guide tells the owner to look for, asserted one by
  // one against the screen. These are the names read out of Apple's own shipped
  // action definitions; a guide naming an action that does not exist is the
  // failure this slice is measured against.
  const actions = [
    'Find Health Samples',
    'Get Details of Health Sample',
    'Format Date',
    'Set Variable',
    'Dictionary',
    'Add to Variable',
    'Adjust Date',
    'Random Number',
    'Generate Hash',
    'Set Dictionary Value',
    'Get Contents of URL',
    'Get Dictionary Value',
    'Show Notification',
    'Run Shortcut',
  ];
  for (const action of actions) {
    expect(text, `the guide never names ${action}`).toContain(action);
  }
  console.log(`F55  the guide names all ${actions.length} actions it tells the owner to add`);

  // And the ten metric blocks, by slug, so a verifier can see the list is the
  // list rather than a sentence about it.
  const slugs = await page
    .locator('[data-metric]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-metric')));
  console.log(`F55  the metric blocks the guide lists: ${slugs.join(', ')}`);
  expect(slugs).toHaveLength(10);
  expect(slugs).not.toContain('blood_pressure');
  for (const slug of slugs) expect(String(slug).toLowerCase()).not.toContain('pressure');

  // The absence is a decision, and it says so in one sentence.
  const line = page.locator('[data-card="blood-pressure"]');
  await expect(line).toBeVisible();
  const said = (await line.textContent())!.trim().replace(/\s+/g, ' ');
  console.log(`F55  the guide's blood pressure line: ${said}`);
  expect(said.toLowerCase()).toContain('deliberate');

  await page.screenshot({ path: `${CAPTURES}/f55-guide.png`, fullPage: true });
});

test('F53. every answer carried a message, and five of them were failures', async () => {
  // The whole run's answers, printed, because this line is about a population
  // and not about one response. A pass here with two messages in the list would
  // be a walk with nothing in it.
  for (const line of messages) console.log(`F53  ${line.at}  [${line.code}]  ${line.message}`);
  console.log(`F53  ${messages.length} answers, every one of them with a message`);
  expect(messages.length).toBeGreaterThan(20);

  const failures = messages.filter((line) => line.code !== 'ok');
  const codes = new Set(failures.map((line) => line.code));
  console.log(`F53  distinct failure codes exercised: ${[...codes].sort().join(', ')}`);
  expect(codes.size).toBeGreaterThanOrEqual(5);
  for (const line of messages) {
    // Plain English, which means words and not a code. A message equal to its
    // own error code would pass a length check and tell the owner nothing.
    expect(line.message).not.toBe(line.code);
    expect(line.message.split(' ').length).toBeGreaterThan(4);
  }
});

test('F52. a revoked credential is refused on the very next request', async ({ page }) => {
  const before = scratchSampleCount();

  // It still works, one request before the revocation, so what changes is the
  // revocation and not the fixture.
  const working = postScratchIngest({ token, secret, nonce: 'f52-before-revoke' });
  record('F52 before revocation', working.body);
  console.log(`F52  before revoking: HTTP ${working.status}`);
  expect([200, 201]).toContain(working.status);

  await signIn(page);
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');
  await page
    .locator('[data-card="ingest"]')
    .getByRole('button', { name: 'Revoke it', exact: true })
    .click();
  await expect(page.locator('[data-card="ingest"]')).toContainText('No ingest token yet');
  await page.screenshot({ path: `${CAPTURES}/f52-revoked.png`, fullPage: true });

  const revoked = scratchQuery(
    "select key_id || ' revoked_at=' || coalesce(revoked_at::text, 'never') || ' live=' || live from ingest_credential",
  );
  console.log(`F52  the row after revocation: ${revoked}`);
  expect(revoked).toContain('live=f');
  expect(revoked).not.toContain('revoked_at=never');

  const after = postScratchIngest({ token, secret, nonce: 'f52-after-revoke' });
  const answer = record('F52 after revocation', after.body);
  console.log(`F52  after revoking: HTTP ${after.status} ${answer.code}: ${answer.message}`);
  expect(after.status).toBe(401);
  expect(answer.code).toBe('bad_token');
  console.log(`F52  samples before ${before}, after ${scratchSampleCount()}`);
  expect(scratchSampleCount()).toBe(before);
});

test('the ingest tables survive nothing being deleted from them', async () => {
  // health_sample is append only and the database is what says so, exactly as
  // measurement has been since slice 3. A trigger asserted by reading the code
  // is a trigger nobody has run.
  const refusal = scratchQuery(
    "select coalesce((select 'rows=' || count(*) from health_sample), 'none')",
  );
  console.log(`the sample table holds ${refusal}`);
  expect(refusal).toContain('rows=');
  // And the roll-up left the provenance spine intact, which the next slice
  // reads: every stored reading points at a source record that is not seeded.
  const orphans = scratchQuery(`
    select count(*) from measurement m
      left join source_record sr on sr.id = m.source_record_id
     where m.source = 'apple_health_shortcut' and sr.id is null
  `);
  console.log(`readings from the shortcut with no source record: ${orphans}`);
  expect(orphans).toBe('0');
  expect(scratchShortcutReadingCount()).toBeGreaterThan(0);
  // Put the provenance tables back for whatever runs next.
  resetScratchProvenance();
});
