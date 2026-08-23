import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import {
  ensureScratchOwner,
  projectRoot,
  scratchLogs,
  scratchQuery,
  scratchSignInLink,
  scratchUrl,
  testStack,
  testStackWithDemoMode,
  waitForScratch,
} from './host';

/**
 * F15 and F16, on an installation this test is allowed to disconnect.
 *
 * WHY IT MOVED. This was the second describe block in boundary.spec.ts, driven
 * at the owner's live origin. It saves a credential through the shipped form,
 * reads the stored row back, and then presses Disconnect, which deletes it. It
 * carried its own guard against doing that to a real one:
 *
 *   "a Withings credential is already stored on this installation and it is the
 *    owner's. This test writes its own and disconnects it; run it against a
 *    scratch instance instead of taking that row."
 *
 * On 2026-08-23 that guard fired, correctly. Slice 5 shipped, the Withings
 * connection was made, `src/db/withings.ts:685` writes an `integration_credential`
 * row for it, and from that day the owner's install has one. The guard is the
 * test working, and the answer it names is this file: the scratch instance, the
 * same image, its own database, a credential nobody will miss.
 *
 * The route table and C2 stay at the live origin in boundary.spec.ts, because
 * what they prove is about that installation. What is proven here is about the
 * build: a credential entered through the shipped form is unreadable in the
 * database, absent from the rendered HTML, absent from every API response the
 * run recorded, and absent from the log of the container that took it.
 *
 * THE INSTANCE IS RESET FIRST, and that is not tidiness. Nineteen files share
 * this instance and several of them connect Withings, so "Last successful sync:
 * No successful sync yet" is only a fact about a database that has not synced.
 * `reset` drops and recreates it, with demonstration mode off so nothing is
 * seeded underneath the assertions.
 */

const CAPTURES = `${projectRoot}.forge/evidence/slice-2/captures/`;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  mkdirSync(CAPTURES, { recursive: true });
  console.log(testStackWithDemoMode('0', 'reset'));
  await waitForScratch();
  await ensureScratchOwner();
});

test.afterAll(() => {
  // Put the instance back the way the rest of the suite expects to find it.
  testStack('reset');
});

async function signIn(page: Page) {
  await page.goto(scratchSignInLink());
  await page.waitForURL(/\/$/);
  await page.waitForLoadState('networkidle');
}

test('F15 and F16. settings renders state, scope and last sync, and never the credential', async ({
  page,
}) => {
  const secret = `withings-refresh-${Math.random().toString(36).slice(2)}`;
  const responses: string[] = [];
  page.on('response', async (response) => {
    if (!response.url().includes('/api/')) return;
    responses.push(await response.text().catch(() => ''));
  });

  await signIn(page);
  await page.goto('/settings');

  // The state this starts from, printed. A reset instance holds no credential
  // at all, and a run that found one would be a run whose "before" is somebody
  // else's row.
  const before = scratchQuery('select count(*) from integration_credential');
  console.log(`the scratch instance holds ${before} credential row(s) before this test writes one`);
  expect(before, 'the reset instance is not empty, so nothing below starts from a known state').toBe('0');

  /* --------------------------------------------------- the anti-forgery gate */
  const forged = await page.evaluate(async (value) => {
    const response = await fetch('/api/settings/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'withings', secret: value, action: 'save' }),
    });
    return { status: response.status, body: await response.text() };
  }, secret);
  console.log(`no anti-forgery header: ${forged.status} ${forged.body}`);
  expect(forged.status).toBe(403);
  expect(scratchQuery('select count(*) from integration_credential')).toBe(before);

  /* ------------------------------------------------------------ the real save */
  await page.locator('select.input').selectOption('withings');
  await page.locator('input[type=password]').fill(secret);
  await page.getByRole('button', { name: 'Save the credential' }).click();
  await expect(page.getByText('Saved and encrypted.')).toBeVisible();

  const row = scratchQuery(
    `select provider || ' | ' || state || ' | ' || scope || ' | ' || secret_ciphertext || ' | ' || key_fingerprint
     from integration_credential where provider = 'withings'`,
  );
  console.log(`stored row: ${row}`);
  expect(row.length, 'no row came back, so the assertion below covers nothing').toBeGreaterThan(20);
  expect(row).not.toContain(secret);
  expect(row).toContain('connected');

  // The screen: state, scope, last successful sync. Nothing else.
  const withings = page.locator('.row').filter({ hasText: 'Withings' });
  await expect(withings.getByText('Scope: user.metrics')).toBeVisible();
  await expect(withings.getByText('Last successful sync: No successful sync yet')).toBeVisible();
  // The chip reads words from the catalogue. The column still holds the token
  // `connected`, asserted on the stored row above; the screen never prints it.
  await expect(withings.locator('.chip')).toHaveText('Connected');
  await page.screenshot({ path: `${CAPTURES}f15-settings-connected.png`, fullPage: true });

  const html = await page.content();
  expect(html.length, 'an empty document holds no secret and proves nothing').toBeGreaterThan(1000);
  expect(html).not.toContain(secret);
  console.log(`${responses.length} API response bodies recorded, and none holds the value`);
  expect(responses.length, 'no API response was recorded, so searching them proves nothing').toBeGreaterThan(0);
  for (const body of responses) expect(body).not.toContain(secret);

  // It still opens under the running key, and saying so does not print it.
  await page.getByRole('button', { name: 'Check it still opens' }).click();
  await expect(page.getByText('The stored credential opens under the running master key.')).toBeVisible();
  for (const body of responses) expect(body).not.toContain(secret);

  /* ---------------------------------------------------------------- clean up */
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByText('Disconnected. The stored credential was deleted.')).toBeVisible();
  expect(scratchQuery('select count(*) from integration_credential')).toBe(before);

  // And nothing the container logged along the way holds it either. The log of
  // the instance that took the credential, which is this one: the live origin
  // never saw this value and searching its log would be searching for something
  // that was never sent there.
  const logs = scratchLogs();
  console.log(`searched ${logs.split('\n').length} log line(s) from ${scratchUrl}`);
  expect(logs.length, 'the container returned no log, so the search covered nothing').toBeGreaterThan(200);
  expect(logs).not.toContain(secret);
});
