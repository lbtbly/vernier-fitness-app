import { expect, test } from '@playwright/test';
import { apiClient } from './api-client';
import {
  ensureScratchOwner,
  scratchQuery,
  scratchUrl,
  testStackWithDemoMode,
  waitForScratch,
} from './host';

/**
 * The launch report, on the scratch instance and nowhere else.
 *
 * WHY IT IS NOT AIMED AT THE OWNER'S INSTALL ANY MORE. This lived in
 * boundary.spec.ts, driven at the live origin, and it wrote there on every run.
 * The table it writes is the one C2 reads back as proof the owner opened
 * Vernier from his iPhone Home Screen, and on 2026-08-22 standalone_seen and
 * wake_lock_available both went true on that install at 16:13:55 from a
 * headless browser on this Mac. Two owner-blocked lines looked met by a row the
 * suite had authored. A signal any test can set is not evidence of a device, so
 * the suite stops setting it and stops pointing at the install that carries it.
 *
 * WHAT IS GRADED HERE. F12's anti-forgery clause, which is unchanged: a post
 * with no token is 403 and writes nothing. Then the new refusal: a browser
 * under WebDriver is answered 200 with `recorded: false` whatever it claims,
 * which is the shape the accident took, and the row does not move. The status
 * is 200 because this runs on every page and C9 counts a 4xx on every screen
 * the suite walks; what proves the refusal is the body and the unmoved row. Then the write path,
 * which still has to work for the one browser that matters, and the attribution
 * column that makes a written row readable back to where it came from.
 *
 * The residual is asserted rather than hidden, at the end of this file: a
 * client that is not a browser at all can still send three booleans of its own
 * choosing. No header proves a client. What the fix closes is the accident, and
 * what closes the rest is the device screenshot C2's own evidence clause names.
 */

const LAST_REPORTED = "select coalesce(max(last_reported_at)::text, 'never') from device_observation";
const SIGNALS =
  "select coalesce(string_agg(signal || '=' || observed || '@' || coalesce(reported_from, 'unattributed'), ', ' order by signal), 'none') from device_observation";

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  testStackWithDemoMode('1', 'reset');
  await waitForScratch();
  await ensureScratchOwner();
});

test.describe('the launch report', () => {
  test('refuses a post with no anti-forgery token and writes nothing', async () => {
    const before = scratchQuery(LAST_REPORTED);
    console.log(`last_reported_at before: ${before}`);

    // The bare case the verifier found: no cookie, no header, nothing but a
    // body. This is what curl sends.
    const stranger = apiClient(scratchUrl);
    const bare = await stranger.post(
      '/api/diagnostics/launch',
      { standalone: true, wakeLock: true, webdriver: false },
      { csrf: false },
    );
    console.log(`no cookie and no header: ${bare.status} ${bare.text}`);
    expect(bare.status).toBe(403);
    expect(scratchQuery(LAST_REPORTED)).toBe(before);

    // And the forgery shape: a caller holding the cookie, unable to read it,
    // so unable to put its value in the header.
    const client = apiClient(scratchUrl);
    await client.get('/sign-in');
    expect(client.cookie('vernier_csrf')).toBeTruthy();
    const noHeader = await client.post(
      '/api/diagnostics/launch',
      { standalone: true, wakeLock: true, webdriver: false },
      { csrf: false },
    );
    console.log(`cookie but no header: ${noHeader.status} ${noHeader.text}`);
    expect(noHeader.status).toBe(403);
    expect(String(noHeader.body.error)).toContain('Anti-forgery check failed.');
    expect(scratchQuery(LAST_REPORTED)).toBe(before);

    // A wrong token is no better than none.
    const wrongToken = await client.post(
      '/api/diagnostics/launch',
      { standalone: true, wakeLock: true, webdriver: false },
      { csrfValue: 'not-the-token-this-browser-was-given' },
    );
    console.log(`a token that does not match: ${wrongToken.status} ${wrongToken.text}`);
    expect(wrongToken.status).toBe(403);
    expect(scratchQuery(LAST_REPORTED)).toBe(before);
  });

  test('refuses a report that omits whether the browser is being driven', async () => {
    const before = scratchQuery(LAST_REPORTED);
    const client = apiClient(scratchUrl);
    await client.get('/sign-in');

    // The shape boundary.spec.ts used to send, and the shape a curl still
    // sends: two booleans and no third. The shipped client always sends three,
    // so this is not the shipped client and it is refused as malformed.
    const twoBooleans = await client.post('/api/diagnostics/launch', {
      standalone: true,
      wakeLock: true,
    });
    console.log(`two booleans and no third: ${twoBooleans.status} ${twoBooleans.text}`);
    expect(twoBooleans.status).toBe(400);
    expect(String(twoBooleans.body.error)).toBe('That is not a launch report.');
    expect(scratchQuery(LAST_REPORTED)).toBe(before);
  });

  test('refuses this suite\'s own browser and leaves the signals where they were', async ({ page }) => {
    const before = scratchQuery(SIGNALS);
    console.log(`signals before: ${before}`);

    // The real thing: a page this server rendered, holding a token this server
    // minted, raising the report the shipped component raises. Everything the
    // accident had. The browser is under the DevTools protocol, it says so, and
    // the server turns it away.
    const reported = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/diagnostics/launch') && response.request().method() === 'POST',
    );
    await page.goto('/sign-in');
    const response = await reported;
    const body = await response.text();
    console.log(`the launch this suite's browser raised: ${response.status()} ${body}`);
    // 200 and `recorded: false`, not a 4xx: this fires on every page and C9
    // counts console errors and responses of 400 or worse on every screen.
    expect(response.status()).toBe(200);
    expect(JSON.parse(body).recorded).toBe(false);
    expect(body).toContain('A driven browser cannot report a launch.');

    // navigator.webdriver is what the browser told on itself with, printed so
    // the refusal is readable rather than asserted.
    console.log(`navigator.webdriver in this browser: ${await page.evaluate(() => navigator.webdriver)}`);
    expect(await page.evaluate(() => navigator.webdriver)).toBe(true);

    // Nothing moved. This is the assertion the live install needed and did not
    // have: the suite drove the shipped report and the row is where it was.
    expect(scratchQuery(SIGNALS)).toBe(before);
  });

  test('refuses a headless user agent even when the body claims otherwise', async () => {
    const before = scratchQuery(LAST_REPORTED);
    const client = apiClient(scratchUrl);
    await client.get('/sign-in');

    const lying = await client.post(
      '/api/diagnostics/launch',
      { standalone: true, wakeLock: true, webdriver: false },
      { userAgent: 'Mozilla/5.0 (Macintosh) HeadlessChrome/141.0.0.0 Safari/537.36' },
    );
    console.log(`a headless agent claiming it is not driven: ${lying.status} ${lying.text}`);
    expect(lying.status).toBe(200);
    expect(lying.body.recorded).toBe(false);
    expect(String(lying.body.reason)).toBe('A driven browser cannot report a launch.');
    expect(scratchQuery(LAST_REPORTED)).toBe(before);
  });

  test('writes an honest report and records the address it arrived from', async () => {
    const client = apiClient(scratchUrl);
    await client.get('/sign-in');

    // THE RESIDUAL, STATED OUT LOUD. This is not a browser. It is node, holding
    // a token it read out of its own cookie jar, sending three booleans it
    // chose. Nothing at this layer can tell it from a phone, which is why C2's
    // evidence clause names a device screenshot and why this suite is pointed
    // at an instance whose device_observation row nobody will ever read as
    // proof of anything.
    const honest = await client.post('/api/diagnostics/launch', {
      standalone: false,
      wakeLock: false,
      webdriver: false,
    });
    console.log(`an honest report: ${honest.status}`);
    expect(honest.status).toBe(204);

    // The row it wrote, and what it says about where it came from. The scratch
    // instance answers on plain loopback with no Tailscale proxy in front of
    // it, so there is no forwarded address and the column is null: unattributed
    // rather than attributed to a machine it did not come from.
    const row = scratchQuery(SIGNALS);
    console.log(`signals after: ${row}`);
    expect(row).toContain('standalone_seen=f@unattributed');
    // standalone was false, so wake lock was not believed and no row was
    // written for it. That rule is older than this file and it still holds.
    expect(row).not.toContain('wake_lock_available');
  });
});
