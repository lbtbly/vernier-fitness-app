import { execFileSync } from 'node:child_process';
import { expect, launchReportsHeld, test } from './fixtures';
import { baseUrl, liveDeviceObservations, mintSignInLink, projectRoot, query } from './host';

/**
 * The boundary, which is the point of this slice: nothing reaches the app
 * without a session, and no credential value reaches the browser, an API
 * response or a log line.
 */

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

    // The bytes under public/, graded by the same classifier as the routes.
    //
    // The shell answers: the worker is what an offline phone asks for before it
    // has a session to present. The movement demonstrations do not: they are
    // product content, `src/lib/routes.ts` leaves them protected, and F14 says
    // everything but the sign-in page, liveness and the shell needs a session.
    // Pinned here so a later slice that widens PUBLIC_PREFIXES to '/movements/'
    // turns this red instead of quietly opening forty-four files to anyone who
    // can reach the tailnet.
    expect(table).toMatch(/GET {2}\/sw\.js\s+public\s+200\s+open/);
    expect(table).toMatch(/GET {2}\/icons\/[^\s]+\s+public\s+200\s+open/);
    expect(table).toMatch(/GET {2}\/movements\/push-up\.svg\s+protected\s+307\s+refused/);
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

/*
 * F15 AND F16'S CREDENTIAL WALK LIVES IN tests/e2e/credential-boundary.spec.ts NOW.
 *
 * It used to live here, driven at the owner's live install. It saves a
 * credential through the shipped form and then presses Disconnect, which
 * deletes it, and it carried its own guard against doing that to a real one:
 * "a Withings credential is already stored on this installation and it is the
 * owner's ... run it against a scratch instance instead of taking that row."
 *
 * On 2026-08-23 that guard fired. Slice 5 shipped, the Withings connection was
 * made, and src/db/withings.ts:685 writes an integration_credential row for it,
 * so from that day the install has one and this test would have taken it. The
 * guard working is what moved the file; the scratch instance is the answer the
 * guard itself named.
 */

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
 * boolean and one `addInitScript` line put it back to false. Then the verifier
 * wrote the same row from a shell with no browser and no session at all.
 *
 * TWO HALVES NOW, AND THE FIRST ONE IS NEW. A page rendered for nobody raises no
 * launch report at all: the layout mints the ticket the report has to carry only
 * for a live session, so /sign-in, which is where the bare curl minted its
 * anti-forgery pair, posts nothing. Then the second half, unchanged in what it
 * proves: signed in, with everything the accident had, the report the shipped
 * component raises never leaves this machine, because the harness in
 * tests/e2e/fixtures.ts answers it.
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

  // The screen the old attack minted its token from. Nothing is raised here any
  // more: no session, no ticket, no report, and the component that would post
  // one is not rendered. Counted through the harness rather than by watching for
  // the path, because the harness catches every one of them and
  // tests/unit/suite-safety.test.ts refuses a spec at this origin that names
  // that endpoint at all.
  await page.goto('/sign-in');
  await page.waitForLoadState('networkidle');
  const heldAtTheGate = launchReportsHeld();
  console.log(`launch reports raised by the sign-in screen: ${heldAtTheGate - heldBefore}`);
  expect(heldAtTheGate, 'a page rendered for nobody raised a launch report').toBe(heldBefore);

  console.log(`navigator.webdriver in this browser: ${await page.evaluate(() => navigator.webdriver)}`);
  console.log(
    `display-mode standalone in this browser: ${await page.evaluate(() => window.matchMedia('(display-mode: standalone)').matches)}`,
  );
  expect(await page.evaluate(() => navigator.webdriver)).toBe(false);
  expect(await page.evaluate(() => window.matchMedia('(display-mode: standalone)').matches)).toBe(true);

  // And now signed in, which is the only state that raises one at all: a page
  // this server rendered, a token and a ticket it minted, the shipped component
  // posting them, and a browser claiming a Home Screen launch it never had.
  test.skip(Number(query('select count(*) from owner')) === 0, 'no owner account on this installation yet');
  await page.goto(mintSignInLink());
  await page.waitForLoadState('networkidle');

  // The shipped component raised a report and the harness answered it here.
  const heldAfter = launchReportsHeld();
  console.log(`launch reports this worker answered itself: ${heldAfter - heldBefore}`);
  expect(heldAfter).toBeGreaterThan(heldBefore);

  // And the row C2 reads is where it was, to the microsecond.
  const after = liveDeviceObservations();
  console.log(`the owner's device signals after: ${after}`);
  expect(after).toBe(before);
});
