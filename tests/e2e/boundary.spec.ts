import { execFileSync } from 'node:child_process';
import { expect, launchReportsHeld, test } from './fixtures';
import { appLogs, baseUrl, liveDeviceObservations, mintSignInLink, projectRoot, query } from './host';

/**
 * The boundary, which is the point of this slice: nothing reaches the app
 * without a session, and no credential value reaches the browser, an API
 * response or a log line.
 */

const CAPTURES = new URL('../../.forge/evidence/slice-2/captures/', import.meta.url).pathname;

test.describe('the route table', () => {
  test('every route answers what it should to a caller with no session', () => {
    const table = execFileSync('node', ['scripts/route-table.mjs', baseUrl()], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    console.log(table);
    expect(table).toContain('0 failing');
    expect(table).toMatch(/GET {2}\/settings\s+protected\s+307\s+refused/);
    expect(table).toMatch(/GET {2}\/healthz\s+public\s+200\s+open/);
    expect(table).toMatch(/POST \/api\/auth\/password\s+gate\s+403\s+refused/);
  });

  test('a document redirects and an API path answers 401', async ({ page }) => {
    const response = await page.goto('/settings');
    expect(page.url()).toContain('/sign-in?next=%2Fsettings');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    const api = await page.request.post('/api/settings/integrations', { data: {} });
    expect(api.status()).toBe(401);
    expect(await api.text()).toContain('Sign in first.');
  });
});

/*
 * F12 ON THE LAUNCH REPORT LIVES IN tests/e2e/launch-report.spec.ts NOW.
 *
 * It used to live here, driven at the owner's live install, and it wrote there:
 * the honest post at the end of it moved device_observation.last_reported_at on
 * every run. That is the table C2 reads back as proof the owner opened Vernier
 * from his Home Screen, and on 2026-08-22 standalone_seen and
 * wake_lock_available both went true on that install from a headless browser on
 * this Mac. A signal any test can set is not evidence of a device.
 *
 * So the whole of it moved to the scratch instance, in the chrome-scratch
 * project, and tests/unit/suite-safety.test.ts refuses any spec that posts a
 * launch report from a project pointed at the live origin.
 */

test.describe('the credential boundary', () => {
  test('settings renders state, scope and last sync, and never the credential', async ({ page }) => {
    test.skip(Number(query('select count(*) from owner')) === 0, 'no owner account on this installation yet');

    const secret = `withings-refresh-${Math.random().toString(36).slice(2)}`;
    const responses: string[] = [];
    page.on('response', async (response) => {
      if (!response.url().includes('/api/')) return;
      responses.push(await response.text().catch(() => ''));
    });

    await page.goto(mintSignInLink());
    await page.goto('/settings');

    // Start from a known state, and refuse to make one. This used to delete
    // whatever was stored for Withings, which is fine while every credential in
    // this database belongs to a test and destroys the owner's connection the
    // day he has one. Nothing here writes the owner's database now: if a
    // credential is already stored, this test says so and stops, and the
    // instance for a run that needs to write is the scratch one.
    expect(
      query("select count(*) from integration_credential where provider = 'withings'"),
      'a Withings credential is already stored on this installation and it is the owner\'s. This test writes its own and disconnects it; run it against a scratch instance instead of taking that row.',
    ).toBe('0');
    await page.reload();
    const before = query('select count(*) from integration_credential');

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
    expect(query('select count(*) from integration_credential')).toBe(before);

    /* ------------------------------------------------------------ the real save */
    await page.locator('select.input').selectOption('withings');
    await page.locator('input[type=password]').fill(secret);
    await page.getByRole('button', { name: 'Save the credential' }).click();
    await expect(page.getByText('Saved and encrypted.')).toBeVisible();

    const row = query(
      `select provider || ' | ' || state || ' | ' || scope || ' | ' || secret_ciphertext || ' | ' || key_fingerprint
       from integration_credential where provider = 'withings'`,
    );
    console.log(`stored row: ${row}`);
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
    expect(html).not.toContain(secret);
    for (const body of responses) expect(body).not.toContain(secret);

    // It still opens under the running key, and saying so does not print it.
    await page.getByRole('button', { name: 'Check it still opens' }).click();
    await expect(page.getByText('The stored credential opens under the running master key.')).toBeVisible();
    for (const body of responses) expect(body).not.toContain(secret);

    /* ---------------------------------------------------------------- clean up */
    await page.getByRole('button', { name: 'Disconnect' }).click();
    await expect(page.getByText('Disconnected. The stored credential was deleted.')).toBeVisible();
    expect(query('select count(*) from integration_credential')).toBe(before);

    // And nothing the app logged along the way holds it either.
    expect(appLogs()).not.toContain(secret);
  });
});

/**
 * C2. The accident, re-run at the owner's own install, in the engine his iPhone
 * and his Mac run, and it does not reach him.
 *
 * On 2026-08-22 standalone_seen and wake_lock_available both went true on that
 * install at 16:13:55, written by a headless browser on this Mac, and two
 * owner-blocked rubric lines read as met by a row this suite had authored. The
 * route learned to refuse a driven browser on two witnesses; the user-agent one
 * never fires for WebKit, because Playwright's WebKit sends a genuine Safari
 * user agent, so for that engine the whole refusal rested on one client-supplied
 * boolean and one `addInitScript` line put it back to false.
 *
 * So the report does not leave the machine. This drives everything the accident
 * had, in WebKit, against the live origin: a page this server rendered, a token
 * it minted, the shipped component raising the report, `navigator.webdriver`
 * overwritten before the first script and display mode claiming standalone. The
 * harness answers it, the request never goes out, and the four signals on the
 * owner's install read exactly what they read a moment earlier.
 */
test('C2. this suite cannot report a launch to the owner\'s install, whatever the page claims', async ({
  page,
}) => {
  const before = liveDeviceObservations();
  const heldBefore = launchReportsHeld();
  console.log(`the owner's device signals before: ${before}`);

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    const query = window.matchMedia.bind(window);
    window.matchMedia = (text: string) =>
      text.includes('standalone') ? ({ matches: true, media: text } as MediaQueryList) : query(text);
  });
  await page.goto('/sign-in');
  await page.waitForLoadState('networkidle');

  console.log(`navigator.webdriver in this browser: ${await page.evaluate(() => navigator.webdriver)}`);
  console.log(
    `display-mode standalone in this browser: ${await page.evaluate(() => window.matchMedia('(display-mode: standalone)').matches)}`,
  );
  expect(await page.evaluate(() => navigator.webdriver)).toBe(false);
  expect(await page.evaluate(() => window.matchMedia('(display-mode: standalone)').matches)).toBe(true);

  // The shipped component raised a report and the harness answered it here.
  const heldAfter = launchReportsHeld();
  console.log(`launch reports this worker answered itself: ${heldAfter - heldBefore}`);
  expect(heldAfter).toBeGreaterThan(heldBefore);

  // And the row C2 reads is where it was, to the microsecond.
  const after = liveDeviceObservations();
  console.log(`the owner's device signals after: ${after}`);
  expect(after).toBe(before);
});
