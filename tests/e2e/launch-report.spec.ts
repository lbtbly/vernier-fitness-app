import { expect, newGuardedContext, test } from './fixtures';
import { apiClient, type ApiResponse } from './api-client';
import {
  ensureScratchOwner,
  scratchQuery,
  scratchSignInLink,
  scratchUrl,
  testStackWithDemoMode,
  waitForScratch,
} from './host';

/**
 * The launch report, on the scratch instance and nowhere else.
 *
 * WHY IT IS NOT AIMED AT THE OWNER'S INSTALL. This lived in boundary.spec.ts,
 * driven at the live origin, and it wrote there on every run. The table it
 * writes is the one C2 reads back as proof the owner opened Vernier from his
 * iPhone Home Screen, and on 2026-08-22 standalone_seen and wake_lock_available
 * both went true on that install at 16:13:55 from a headless browser on this
 * Mac. Two owner-blocked rubric lines read as met by a row the suite had
 * authored. A signal any test can set is not evidence of a device, so the suite
 * stops setting it and stops pointing at the install that carries it.
 *
 * AND THEN THE SAME ROW WENT TRUE AGAIN, WITH NO BROWSER AT ALL. The verifier
 * minted an anti-forgery pair with one unauthenticated GET of /sign-in, posted
 * three booleans with an iPhone user agent, and got 204 and two rows: no
 * browser, no session, no automation, on an image byte for byte identical to
 * the live app. Every witness the route held asked who was calling, and nothing
 * on the wire answers that question.
 *
 * WHAT IS GRADED HERE, IN THE ORDER THE ROUTE ASKS IT.
 *
 * The door, which is the fix: no session, no write, whatever the caller puts in
 * a header. That is the first test and it is the exact four lines of curl that
 * wrote the row.
 *
 * F12's anti-forgery clause, unchanged, now asked of a caller who holds a
 * session: no token is 403 and writes nothing.
 *
 * The ticket: a value the root layout mints into the document it renders for a
 * live session, keyed with MASTER_KEY. A caller cannot compute one and cannot
 * lift one off /sign-in, because a page rendered for no session carries none.
 *
 * Then the three witnesses, which are about the accident rather than about
 * identity, and then the write path, which still has to work for the one
 * browser that matters.
 *
 * The residual is asserted rather than hidden, at the end of this file: anything
 * holding the owner's session cookie can load a page, read the ticket out of it
 * and post whatever it likes. That is the honest floor. The cookie is HttpOnly,
 * Secure and SameSite=Strict, so holding one means holding the owner's device,
 * and what closes the rest is the device screenshot C2's own evidence clause
 * names.
 */

const LAST_REPORTED = "select coalesce(max(last_reported_at)::text, 'never') from device_observation";
const SIGNALS =
  "select coalesce(string_agg(signal || '=' || observed || '@' || coalesce(reported_from, 'unattributed'), ', ' order by signal), 'none') from device_observation";

/** What a browser on an iPhone sends. Four words, and the old witnesses believed all of them. */
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

/** A value of the right shape that nobody minted. */
const INVENTED_TICKET = '1.1787420000.dGhpcy1pcy1ub3QtYS10aWNrZXQtaXQtaXMtYS1ndWVzcw';

const REPORT = { standalone: true, wakeLock: true, webdriver: false };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  testStackWithDemoMode('1', 'reset');
  await waitForScratch();
  await ensureScratchOwner();
});

/**
 * A caller holding the scratch owner's session, taken the way the owner takes
 * one: a one-time link minted on the machine, through the shipped route.
 */
async function signedIn() {
  const client = apiClient(scratchUrl);
  await client.get('/sign-in');
  const link = new URL(scratchSignInLink());
  await client.get(`${link.pathname}${link.search}`);
  expect(client.cookie('vernier_session'), 'the one-time link did not hand out a session').toBeTruthy();
  return client;
}

/**
 * The ticket, read off the document the way anything holding the session could
 * read it: it travels to the client as a prop on the component that raises the
 * report, so it is in the flight payload of the page this server rendered.
 */
async function ticketFrom(client: ReturnType<typeof apiClient>): Promise<string> {
  const page = await client.get('/');
  const found = page.text.match(/launchTicket\\?":\\?"([\w.-]+)/);
  expect(found, 'no launch ticket in the document the server rendered').not.toBeNull();
  return found![1];
}

function print(label: string, response: ApiResponse) {
  console.log(`${label}: ${response.status} ${response.text}`);
}

test.describe('the launch report', () => {
  /**
   * THE HOLE, RE-RUN. Four lines of curl, no browser, no session, no
   * automation: an anti-forgery pair minted by one unauthenticated GET of
   * /sign-in, then three booleans with an iPhone user agent. This answered 204
   * and wrote both signals on 2026-08-22.
   */
  test('refuses a bare fetch with no session, whatever it puts in a header', async () => {
    const before = scratchQuery(SIGNALS);
    console.log(`signals before: ${before}`);

    const stranger = apiClient(scratchUrl);
    await stranger.get('/sign-in');
    expect(stranger.cookie('vernier_csrf'), 'the pair the attack was minted with').toBeTruthy();

    const iphone = await stranger.post('/api/diagnostics/launch', REPORT, { userAgent: IPHONE });
    print('an iPhone user agent, no browser, no session', iphone);
    expect(iphone.status).toBe(401);
    expect(String(iphone.body.error)).toBe('Sign in first.');

    // And the same caller trying every other shape it could reach for.
    const withTicket = await stranger.post(
      '/api/diagnostics/launch',
      { ...REPORT, ticket: INVENTED_TICKET },
      { userAgent: IPHONE },
    );
    print('the same with a ticket it made up', withTicket);
    expect(withTicket.status).toBe(401);

    const noAgent = await stranger.post('/api/diagnostics/launch', REPORT);
    print('the same with no user agent at all', noAgent);
    expect(noAgent.status).toBe(401);

    // Nothing moved. This is the row C2 reads back, and a caller who is nobody
    // no longer reaches it.
    expect(scratchQuery(SIGNALS)).toBe(before);
  });

  test('refuses a post with no anti-forgery token and writes nothing', async () => {
    const before = scratchQuery(LAST_REPORTED);
    console.log(`last_reported_at before: ${before}`);

    // F12, asked of a caller who is past the door: a session, and no header.
    const client = await signedIn();
    const ticket = await ticketFrom(client);

    const noHeader = await client.post(
      '/api/diagnostics/launch',
      { ...REPORT, ticket },
      { csrf: false, userAgent: IPHONE },
    );
    print('a session, a real ticket, and no anti-forgery header', noHeader);
    expect(noHeader.status).toBe(403);
    expect(String(noHeader.body.error)).toContain('Anti-forgery check failed.');
    expect(scratchQuery(LAST_REPORTED)).toBe(before);

    // A wrong token is no better than none.
    const wrongToken = await client.post(
      '/api/diagnostics/launch',
      { ...REPORT, ticket },
      { csrfValue: 'not-the-token-this-browser-was-given', userAgent: IPHONE },
    );
    print('a token that does not match', wrongToken);
    expect(wrongToken.status).toBe(403);
    expect(scratchQuery(LAST_REPORTED)).toBe(before);
  });

  test('refuses a report that is not the shape the shipped client sends', async () => {
    const before = scratchQuery(LAST_REPORTED);
    const client = await signedIn();

    // The shape a curl sends: booleans it chose, and none of the ticket the
    // page it never loaded would have carried.
    const twoBooleans = await client.post(
      '/api/diagnostics/launch',
      { standalone: true, wakeLock: true },
      { userAgent: IPHONE },
    );
    print('two booleans and nothing else', twoBooleans);
    expect(twoBooleans.status).toBe(400);
    expect(String(twoBooleans.body.error)).toBe('That is not a launch report.');

    const noTicket = await client.post('/api/diagnostics/launch', REPORT, { userAgent: IPHONE });
    print('three booleans and no ticket', noTicket);
    expect(noTicket.status).toBe(400);

    expect(scratchQuery(LAST_REPORTED)).toBe(before);
  });

  /**
   * The check that closes the door the curl walked through, asked of a caller
   * who is already past the session. A ticket is a keyed hash of the session it
   * was minted for and the minute it was minted, and the key never leaves the
   * container.
   */
  test('refuses a ticket this server did not mint, and one minted for another session', async () => {
    const before = scratchQuery(SIGNALS);
    const client = await signedIn();

    const invented = await client.post(
      '/api/diagnostics/launch',
      { ...REPORT, ticket: INVENTED_TICKET },
      { userAgent: IPHONE },
    );
    print('a ticket of the right shape that nobody minted', invented);
    expect(invented.status).toBe(200);
    expect(invented.body.recorded).toBe(false);
    expect(String(invented.body.reason)).toBe('That launch report did not come from a launch of Vernier.');

    // A second session, and its ticket handed to the first. Each is bound to
    // the session it was rendered for, so neither is currency for the other.
    const second = await signedIn();
    const theirs = await ticketFrom(second);
    const borrowed = await client.post(
      '/api/diagnostics/launch',
      { ...REPORT, ticket: theirs },
      { userAgent: IPHONE },
    );
    print('another session\'s ticket', borrowed);
    expect(borrowed.status).toBe(200);
    expect(borrowed.body.recorded).toBe(false);

    expect(scratchQuery(SIGNALS)).toBe(before);
  });

  test('refuses this suite\'s own browser and leaves the signals where they were', async ({ page }) => {
    const before = scratchQuery(SIGNALS);
    console.log(`signals before: ${before}`);

    // The real thing: a page this server rendered for a live session, holding a
    // token and a ticket this server minted, raising the report the shipped
    // component raises. Everything the accident had, and everything the fix
    // added. The browser is under the DevTools protocol, it says so, and the
    // server turns it away.
    const reported = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/diagnostics/launch') && response.request().method() === 'POST',
    );
    await page.goto(scratchSignInLink());
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

    expect(scratchQuery(SIGNALS)).toBe(before);
  });

  test('refuses a headless user agent even when the body claims otherwise', async () => {
    const before = scratchQuery(LAST_REPORTED);
    const client = await signedIn();
    const ticket = await ticketFrom(client);

    const lying = await client.post(
      '/api/diagnostics/launch',
      { ...REPORT, ticket },
      { userAgent: 'Mozilla/5.0 (Macintosh) HeadlessChrome/141.0.0.0 Safari/537.36' },
    );
    print('a headless agent claiming it is not driven', lying);
    expect(lying.status).toBe(200);
    expect(lying.body.recorded).toBe(false);
    expect(String(lying.body.reason)).toBe('A driven browser cannot report a launch.');
    expect(scratchQuery(LAST_REPORTED)).toBe(before);
  });

  /**
   * The witness that fires for WebKit, at the server, with the exact pair the
   * verifier got a 204 out of: a genuine Safari user agent and webdriver false.
   *
   * Playwright's WebKit sends that user agent because it IS WebKit, so no header
   * says it is automated and `navigator.webdriver` is one addInitScript line
   * from reading false. What is refused here is the claim rather than the
   * caller: a Macintosh has no Home Screen to put an icon on.
   */
  test('refuses a Home Screen launch reported from a desktop, Safari user agent and all', async () => {
    const before = scratchQuery(SIGNALS);
    const client = await signedIn();
    const ticket = await ticketFrom(client);

    const fromAMac = await client.post(
      '/api/diagnostics/launch',
      { ...REPORT, ticket },
      {
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
      },
    );
    print('a Safari user agent claiming a Home Screen launch', fromAMac);
    expect(fromAMac.status).toBe(200);
    expect(fromAMac.body.recorded).toBe(false);
    expect(String(fromAMac.body.reason)).toBe('A Home Screen launch cannot be reported from a desktop.');
    expect(scratchQuery(SIGNALS)).toBe(before);
  });

  /**
   * And the whole accident re-run: a real browser this server rendered a page
   * for, signed in, with `navigator.webdriver` overwritten before the first
   * script, which is the one line that reopened it. Chrome here because this
   * instance answers on loopback http; the user agent it sends is a real Chrome
   * one on a Mac, which is the same shape WebKit's is.
   */
  test('refuses a driven browser that has overwritten the flag it tells on itself with', async ({
    browser,
  }) => {
    const before = scratchQuery(SIGNALS);
    const context = await newGuardedContext(browser, {
      baseURL: scratchUrl,
      viewport: { width: 393, height: 852 },
    });
    // The accident, both halves of it. `navigator.webdriver` is the flag the
    // client tells on itself with, and display-mode standalone is the claim
    // that made two rubric lines read as met. A driven browser can assert both.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      const query = window.matchMedia.bind(window);
      window.matchMedia = (text: string) =>
        text.includes('standalone') ? ({ matches: true, media: text } as MediaQueryList) : query(text);
    });
    const page = await context.newPage();
    const reported = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/diagnostics/launch') && response.request().method() === 'POST',
    );
    await page.goto(scratchSignInLink());
    const response = await reported;
    const body = await response.text();
    console.log(`navigator.webdriver in this browser: ${await page.evaluate(() => navigator.webdriver)}`);
    console.log(`the launch it raised: ${response.status()} ${body}`);
    expect(await page.evaluate(() => navigator.webdriver)).toBe(false);
    expect(
      await page.evaluate(() => window.matchMedia('(display-mode: standalone)').matches),
      'the page did not claim a standalone launch, so nothing was being attacked',
    ).toBe(true);
    expect(response.status()).toBe(200);
    expect(JSON.parse(body).recorded).toBe(false);
    expect(String(JSON.parse(body).reason)).toBe('A Home Screen launch cannot be reported from a desktop.');
    expect(scratchQuery(SIGNALS)).toBe(before);
  });

  test('writes an honest report and says what the row reads afterwards', async () => {
    const client = await signedIn();
    const ticket = await ticketFrom(client);

    // THE RESIDUAL, STATED OUT LOUD. This is not a browser. It is node, holding
    // the owner's session, a token out of its own cookie jar and a ticket it
    // scraped off the page that session was served. Nothing at this layer can
    // tell it from a phone, which is why C2's evidence clause names a device
    // screenshot and why this suite is pointed at an instance whose
    // device_observation row nobody will ever read as proof of anything.
    const honest = await client.post(
      '/api/diagnostics/launch',
      { standalone: false, wakeLock: false, webdriver: false, ticket },
      { userAgent: IPHONE },
    );
    print('an honest report', honest);
    expect(honest.status).toBe(200);
    expect(honest.body.recorded).toBe(true);

    // And the answer is about the row rather than about the request: what it
    // names is what the next reader of device_observation will see. The 204
    // this used to send said nothing at all, which is how an attack log came to
    // read "HTTP 204" beside two rows that had just moved.
    console.log(`what the endpoint says it stored: ${JSON.stringify(honest.body.signals)}`);
    expect(honest.body.signals).toEqual({ standalone_seen: false });

    // The row it wrote, and what it says about where it came from. The scratch
    // instance answers on plain loopback with no Tailscale proxy in front of
    // it, so there is no forwarded address to believe. Next fills
    // x-forwarded-for from the socket regardless, and on this machine that is
    // the container bridge gateway, so the column reads null: unattributed,
    // rather than attributed to a machine the report did not come from.
    const row = scratchQuery(SIGNALS);
    console.log(`signals after: ${row}`);
    expect(row).toContain('standalone_seen=false@unattributed');
    expect(honest.body.reportedFrom).toBeNull();
    // standalone was false, so wake lock was not believed and no row was
    // written for it. That rule is older than this file and it still holds.
    expect(row).not.toContain('wake_lock_available');
  });
});
