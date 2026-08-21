import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { baseUrl, mintSignInLink, projectRoot, query } from './host';

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

    // Start from a known state: whatever a previous run or the owner left
    // connected for Withings is removed first, so the counts below mean what
    // they say.
    query("delete from integration_credential where provider = 'withings'");
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
    await expect(withings.locator('.chip')).toHaveText('connected');
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
    const logs = execFileSync('docker', ['compose', 'logs', 'app', '--tail', '400'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    expect(logs).not.toContain(secret);
  });
});
