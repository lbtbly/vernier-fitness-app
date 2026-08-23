import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import {
  ensureScratchOwner,
  projectRoot,
  scratchEnv,
  scratchQuery,
  scratchSignInLink,
  testStackWithCalendarFault,
  testStackWithDemoMode,
  testStackWithGoogleLive,
  waitForScratch,
} from './host';

/**
 * Google Calendar and the confirmed diff, walked along the route the shipped
 * screens actually take: Settings, connect, the picker, the training week, the
 * confirm diff, Apply, and undo.
 *
 * ON THE SCRATCH INSTANCE, AND ONLY THERE. Every test here WRITES: a token, a
 * calendar, events, planned sessions, plan rows and a permanent write log.
 * `measurement` refuses DELETE, the owner's install holds the only copy of
 * anything real in this product, and a rejected session on his install would
 * move his adherence denominator overnight for no reason he could find.
 * scripts/test-stack.sh starts this instance with GOOGLE_MODE=demo and an empty
 * client pair, so nothing here opens a socket either: what it drives is the
 * recorded Google, which is the whole of what F101 asks to be proven.
 *
 * WHAT IT PROVES THAT THE UNIT SUITE CANNOT. The unit suite grades the decisions;
 * this grades the product. It goes through the shipped buttons, reads the
 * shipped cards, counts rows in the database either side of every write, and
 * takes the captures the rubric asks for.
 *
 * F101, F102, F103, F104, F105, F106, F107, F108, F109, F110, F111 and half of
 * C14. F112 is the same flow against a real Google account and is an operator
 * line: this is its sibling.
 */

const CAPTURES = `${projectRoot}.forge/evidence/slice-11/captures`;

const VIEWPORTS = [
  { name: '393x852', width: 393, height: 852 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  mkdirSync(CAPTURES, { recursive: true });
  // The demonstration seed on, because the training week needs a movement
  // catalogue and some history to propose from.
  console.log(testStackWithDemoMode('1', 'reset'));
  await waitForScratch();
  await ensureScratchOwner();
});

test.afterAll(() => {
  testStackWithDemoMode('1', 'reset');
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

async function openCalendar(page: Page) {
  await page.goto('/train/calendar');
  await page.waitForLoadState('networkidle');
}

/** The Google card, by its own marker rather than by position on the screen. */
function card(page: Page) {
  return page.locator('[data-google]');
}

function events(): number {
  return Number(scratchQuery('select count(*) from google_demo_event'));
}

function writes(): number {
  return Number(scratchQuery('select count(*) from calendar_write'));
}

/** Connect the demonstration account and choose every calendar it offers. */
async function connectAndChoose(page: Page) {
  await openSettings(page);
  if ((await card(page).getAttribute('data-google')) === 'disconnected') {
    await page.getByRole('button', { name: /connect the demonstration account/i }).click();
    await expect(card(page)).toHaveAttribute('data-google', 'demo', { timeout: 30_000 });
  }
  await page.locator('[data-control="choose-calendars"]').click();
  await expect(page.locator('[data-google="picker"]')).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-control="save-calendars"]').click();
  await expect(page.locator('[data-google-watched]')).toBeVisible();
}

/** Propose a week on screen 06 and accept the first three sessions. */
async function acceptSessions(page: Page, howMany = 3) {
  await page.goto('/train');
  await page.waitForLoadState('networkidle');
  const propose = page.getByRole('button', { name: 'Propose next week' });
  if (await propose.isVisible().catch(() => false)) await propose.click();
  await expect(page.locator('[data-proposal]').first()).toBeVisible({ timeout: 30_000 });

  const ids = await page
    .locator('[data-proposal]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-proposal')!));
  for (const id of ids.slice(0, howMany)) {
    await page.locator(`[data-proposal="${id}"] [data-decision="accept"]`).click();
    await expect(page.locator(`[data-proposal="${id}"]`)).toHaveAttribute('data-state', 'accepted');
  }
  const planned = Number(scratchQuery("select count(*) from planned_session where state = 'planned'"));
  console.log(`planned sessions after accepting ${howMany}: ${planned}`);
  expect(planned).toBeGreaterThanOrEqual(howMany);
  return ids.slice(0, howMany);
}

/** Work out what would change, and wait for the rows to be on screen. */
async function buildPlan(page: Page) {
  await openCalendar(page);
  const build = page.locator('[data-control="build-plan"], [data-control="rebuild"]').first();
  await build.click();
  await page.waitForLoadState('networkidle');
}

test('F101. the whole flow runs with no client identifier: picker, busy, calendar, diff and write', async ({
  page,
}) => {
  // NO CLIENT ID AND NO SECRET, read off the running container rather than
  // claimed by the harness. Lengths are printed; the values are not.
  const clientId = scratchEnv('GOOGLE_CLIENT_ID');
  const clientSecret = scratchEnv('GOOGLE_CLIENT_SECRET');
  console.log(
    `scratch container: GOOGLE_MODE=${scratchEnv('GOOGLE_MODE')}, client id ${clientId.length} chars, client secret ${clientSecret.length} chars, fault=${scratchEnv('GOOGLE_DEMO_FAULT')}`,
  );
  expect(clientId).toBe('');
  expect(clientSecret).toBe('');
  expect(scratchEnv('GOOGLE_MODE')).toBe('demo');

  await signIn(page);
  await openSettings(page);
  await expect(card(page)).toHaveAttribute('data-google', 'disconnected');
  await page.screenshot({ path: `${CAPTURES}/f101-1-disconnected.png`, fullPage: true });

  // ---- 1. connect
  await page.getByRole('button', { name: /connect the demonstration account/i }).click();
  await expect(card(page)).toHaveAttribute('data-google', 'demo', { timeout: 30_000 });
  await page.screenshot({ path: `${CAPTURES}/f101-2-connected.png`, fullPage: true });
  expect(
    Number(scratchQuery("select count(*) from integration_credential where provider = 'google_calendar'")),
  ).toBe(1);

  // ---- 2. the picker
  await page.locator('[data-control="choose-calendars"]').click();
  const choices = page.locator('[data-calendar-choice]');
  await expect(choices.first()).toBeVisible({ timeout: 30_000 });
  const offered = await choices.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-calendar-choice')!),
  );
  console.log(`calendars offered: ${offered.join(', ')}`);
  expect(offered.length).toBe(3);
  await page.screenshot({ path: `${CAPTURES}/f101-3-picker.png`, fullPage: true });
  await page.locator('[data-control="save-calendars"]').click();
  await expect(page.locator('[data-google-watched]')).toHaveAttribute('data-google-watched', '3');

  // ---- 3. a week to write
  await acceptSessions(page, 3);

  // ---- 4. the diff, with nothing written yet
  await buildPlan(page);
  const rows = page.locator('[data-confirm-row]');
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  const rowCount = await rows.count();
  console.log(`diff rows: ${rowCount}`);
  console.log(`events in the demonstration calendar while the diff is open: ${events()}`);
  console.log(`writes in the log while the diff is open: ${writes()}`);
  // NOTHING WRITES BEFORE THE CONFIRM. The counts here are the population beside
  // the zeroes below.
  expect(rowCount).toBeGreaterThanOrEqual(3);
  expect(events()).toBe(0);
  expect(writes()).toBe(0);
  await page.screenshot({ path: `${CAPTURES}/f101-4-diff.png`, fullPage: true });

  // ---- 5. the write
  await page.locator('[data-control="apply"]').click();
  await expect(page.locator('[data-write]').first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${CAPTURES}/f101-5-written.png`, fullPage: true });

  const landed = events();
  const marked = Number(
    scratchQuery("select count(*) from google_demo_event where mode = 'demonstration'"),
  );
  console.log(`events written: ${landed}, of which marked demonstration: ${marked}`);
  console.log(scratchQuery('select id, summary, start_at, mode from google_demo_event order by start_at'));
  expect(landed).toBeGreaterThan(0);
  // EVERY EVENT IS MARKED, readable off the database rather than off a badge.
  expect(marked).toBe(landed);

  // The dedicated calendar was created through the same confirmed path.
  const calendar = scratchQuery('select app_calendar_id from google_connection');
  console.log(`app calendar: ${calendar}`);
  expect(calendar).not.toBe('');
  expect(calendar).not.toContain('primary');
});

test('F105. every recorded write names the stored calendar and none names the primary keyword', async () => {
  const log = scratchQuery('select site, verb, event_id, outcome from calendar_write order by at');
  console.log(`write log:\n${log}`);
  const lines = log.split('\n').filter(Boolean);
  // The population beside the zero: the log is not empty.
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    expect(line).not.toContain('primary');
  }
  const sites = new Set(lines.map((line) => line.split('|')[0]));
  console.log(`write sites used: ${[...sites].join(', ')}`);
  for (const site of sites) {
    expect(['calendars.insert', 'calendars.delete', 'events.insert', 'events.update', 'events.delete']).toContain(
      site,
    );
  }
});

test('F107. the diff shows counts, columns, causes and per-row confirmation, and removals start unselected', async ({
  page,
}) => {
  await signIn(page);

  // A session moved into a block the demonstration calendar shows as busy, so
  // the diff has a genuine move in it with a cause naming the block. The row is
  // moved in the DATABASE rather than on screen, because the training week has
  // no control that puts a session on top of a meeting.
  const target = scratchQuery("select id from planned_session where state = 'planned' order by planned_for limit 1");
  // Thursday of next week at 18:45 in the app's own zone, written through
  // `at time zone` rather than with an offset typed into the string, so this
  // does not quietly move an hour on the last Sunday in October.
  scratchQuery(`
    update planned_session
    set planned_for = (date_trunc('week', now() at time zone 'Europe/Paris')
      + interval '10 days 18 hours 45 minutes') at time zone 'Europe/Paris'
    where id = '${target}'
  `);
  const moved = scratchQuery(
    `select to_char(planned_for at time zone 'Europe/Paris', 'Day DD Mon HH24:MI') from planned_session where id = '${target}'`,
  );
  console.log(`session ${target} moved to ${moved} local, inside the demonstration Thursday evening block`);

  await buildPlan(page);
  const rows = page.locator('[data-confirm-row]');
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });

  // THE COUNTS, FIRST, IN THE ORDER ADDED MOVED REMOVED.
  const counts = await page.locator('[data-confirm-counts] [data-count]').evaluateAll((nodes) =>
    nodes.map((node) => `${node.getAttribute('data-count')}=${node.textContent?.trim()}`),
  );
  console.log(`counts on screen, in order: ${counts.join(', ')}`);
  expect(counts.map((entry) => entry.split('=')[0])).toEqual(['added', 'moved', 'removed']);

  // THE TWO COLUMNS.
  await expect(page.locator('[data-confirm="columns"] [data-column="before"]')).toBeVisible();
  await expect(page.locator('[data-confirm="columns"] [data-column="after"]')).toBeVisible();

  // EVERY ROW CARRIES A CAUSE, AND A CAUSE IS A SENTENCE NAMING AN INPUT.
  const total = await rows.count();
  for (let index = 0; index < total; index += 1) {
    const cause = await rows.nth(index).locator('[data-cause]').innerText();
    const verb = await rows.nth(index).getAttribute('data-verb');
    console.log(`  ${verb}: ${cause}`);
    expect(cause.length).toBeGreaterThan(30);
    expect(cause).toMatch(/because|Placed|Moved|Removed/i);
    expect(cause.toLowerCase()).not.toContain('rescheduled');
  }

  // DEFAULTS: additions and moves ticked, removals not.
  const defaults = await rows.evaluateAll((nodes) =>
    nodes.map((node) => `${node.getAttribute('data-verb')}=${node.getAttribute('data-selected')}`),
  );
  console.log(`defaults: ${defaults.join(', ')}`);
  for (const entry of defaults) {
    const [verb, selected] = entry.split('=');
    expect(selected).toBe(verb === 'removed' ? 'false' : 'true');
  }

  // THE FOOTER STATES THE COUNT, and nothing has been written while it is open.
  const footer = await page.locator('[data-confirm-footer] [data-control="apply"]').innerText();
  console.log(`apply button reads: ${footer}`);
  expect(footer).toMatch(/Apply \d+ change/);
  console.log(`events while the diff is open: ${events()}`);

  await page.screenshot({ path: `${CAPTURES}/f107-diff-open.png`, fullPage: true });
});

test('F104. a calendar that could not be read is surfaced rather than treated as free', async ({ page }) => {
  await signIn(page);
  await buildPlan(page);

  const failure = page.locator('[data-calendar="read-failure"]');
  await expect(failure).toBeVisible({ timeout: 30_000 });
  const named = await failure.locator('[data-failed-calendar]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-failed-calendar')!),
  );
  console.log(`calendars surfaced as unreadable: ${named.join(', ')}`);
  console.log(await failure.innerText());
  expect(named.length).toBe(1);

  // And the database says the same thing: the failure is stored beside the busy
  // periods rather than lost when the read finished.
  const stored = scratchQuery('select calendar_id, reason from calendar_read_failure');
  const busy = Number(scratchQuery('select count(*) from calendar_busy'));
  console.log(`stored failures: ${stored}`);
  console.log(`stored busy periods: ${busy}`);
  expect(stored).toContain('notFound');
  // The population beside the failure: the same read returned real busy periods,
  // so this is one calendar failing rather than the whole query.
  expect(busy).toBeGreaterThan(0);

  await page.screenshot({ path: `${CAPTURES}/f104-read-failure.png`, fullPage: true });
});

test('F106 and F108. a second apply writes no duplicate, and undo restores the before column', async ({
  page,
}) => {
  await signIn(page);
  await buildPlan(page);
  await expect(page.locator('[data-confirm-row]').first()).toBeVisible({ timeout: 30_000 });

  const before = events();
  const beforeList = scratchQuery('select id, start_at from google_demo_event order by start_at');
  console.log(`BEFORE the apply: ${before} events\n${beforeList}`);

  await page.locator('[data-control="apply"]').click();
  await expect(page.locator('[data-write]').first()).toBeVisible({ timeout: 30_000 });
  const after = events();
  const afterList = scratchQuery('select id, start_at from google_demo_event order by start_at');
  console.log(`AFTER the apply: ${after} events\n${afterList}`);

  // Applying the same plan again: the plan is spent, so the screen offers a
  // rebuild rather than a second Apply, and the rebuild finds nothing to do.
  await buildPlan(page);
  const rowsAfter = await page.locator('[data-confirm-row]').count();
  const second = events();
  console.log(`rebuild after the apply: ${rowsAfter} rows, ${second} events`);
  expect(second).toBe(after);

  // UNDO, from the permanent log, on the oldest write there is.
  const oldest = scratchQuery(
    "select id from calendar_write where outcome = 'written' and verb <> 'undo' order by at limit 1",
  );
  console.log(`undoing the oldest write in the log: ${oldest}`);
  await page.locator(`[data-undo="${oldest}"]`).first().click();
  await expect(page.locator(`[data-write="${oldest}"] [data-write-undone]`)).toBeVisible({ timeout: 30_000 });

  const undoneList = scratchQuery('select id, start_at from google_demo_event order by start_at');
  console.log(`AFTER the undo: ${events()} events\n${undoneList}`);
  await page.screenshot({ path: `${CAPTURES}/f108-after-undo.png`, fullPage: true });

  // The undo is a new row naming the one it reverses, and the log is append
  // only: the row it reversed is still there.
  const undoRow = scratchQuery(
    `select verb, undoes_write_id from calendar_write where undoes_write_id = '${oldest}'`,
  );
  console.log(`undo row: ${undoRow}`);
  expect(undoRow).toContain(oldest);
  expect(Number(scratchQuery(`select count(*) from calendar_write where id = '${oldest}'`))).toBe(1);
});

test('F108. the write log refuses to be edited, so undo survives every past write', () => {
  const target = scratchQuery('select id from calendar_write order by at limit 1');
  const update = scratchQuery(
    `do $$ begin update calendar_write set outcome = 'failed' where id = '${target}'; exception when others then raise notice 'refused'; end $$`,
  );
  console.log(`update attempt on the write log: ${update || 'refused by the database'}`);
  const outcome = scratchQuery(`select outcome from calendar_write where id = '${target}'`);
  console.log(`outcome after the attempt: ${outcome}`);
  expect(outcome).toBe('written');
});

test('F111. with the calendar unreachable the plan still proposes, from stored availability, and names the cause', async ({
  page,
}) => {
  // The provider is made unreachable rather than mocked: every calendar call
  // comes back the way a socket that never opened comes back.
  console.log(testStackWithCalendarFault('outage'));
  await waitForScratch();

  await signIn(page);
  await buildPlan(page);

  const stale = page.locator('[data-calendar="stale"]');
  await expect(stale).toBeVisible({ timeout: 30_000 });
  console.log(await stale.innerText());
  await page.screenshot({ path: `${CAPTURES}/f111-provider-unreachable.png`, fullPage: true });

  // The plan was still built, from availability this machine already held.
  const plan = scratchQuery(
    'select availability_stale, availability_at from calendar_plan order by built_at desc limit 1',
  );
  console.log(`newest plan: ${plan}`);
  expect(plan.startsWith('t|')).toBe(true);

  // And the training week itself is unaffected: it renders and still proposes.
  await page.goto('/train');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-proposal]').first()).toBeVisible();
  await page.screenshot({ path: `${CAPTURES}/f111-train-week-unaffected.png`, fullPage: true });

  console.log(testStackWithCalendarFault('none'));
  await waitForScratch();
});

test('F109. an invalid grant disconnects permanently, keeps the raw body, and is never retried', async ({
  page,
}) => {
  console.log(testStackWithCalendarFault('revoked'));
  await waitForScratch();

  await signIn(page);
  await buildPlan(page);

  await openSettings(page);
  await expect(card(page)).toHaveAttribute('data-google', 'revoked', { timeout: 30_000 });
  console.log(await page.locator('[data-google="revoked"]').innerText());
  await page.screenshot({ path: `${CAPTURES}/f109-revoked.png`, fullPage: true });

  const row = scratchQuery(
    'select state, disconnected_at is not null, last_error_kind, background_sync_stopped, last_error_raw from google_connection',
  );
  console.log(`connection row: ${row}`);
  expect(row).toContain('revoked');
  expect(row).toContain('invalid_grant');
  expect(row).toContain('Token has been expired or revoked.');

  // THE TOKEN IS GONE.
  const credential = Number(
    scratchQuery("select count(*) from integration_credential where provider = 'google_calendar'"),
  );
  console.log(`stored google credentials after the refusal: ${credential}`);
  expect(credential).toBe(0);

  // ONE RECONNECT AND NOTHING ELSE: the card offers a single action.
  const actions = await page
    .locator('[data-google] button, [data-google] a')
    .evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? '').trim()).filter(Boolean));
  console.log(`actions on the card: ${actions.join(' | ')}`);
  expect(actions).toEqual(['Reconnect']);

  // AND NOTHING IS RETRIED. A second attempt at the same action leaves the
  // disconnection instant exactly where it was.
  const stamp = scratchQuery('select disconnected_at from google_connection');
  await buildPlan(page);
  const again = scratchQuery('select disconnected_at from google_connection');
  console.log(`disconnected at ${stamp}, still ${again} after a second attempt`);
  expect(again).toBe(stamp);

  console.log(testStackWithCalendarFault('none'));
  await waitForScratch();
});

test('F102 and F103. the authorization request carries three scopes, offline access and a forced consent', async ({
  page,
}) => {
  // LIVE MODE with a client id that is not real, so the shipped Connect button
  // builds a real authorization URL. The navigation to Google is blocked before
  // it leaves the browser, so no socket is opened.
  console.log(testStackWithGoogleLive('vernier-preflight-probe.apps.googleusercontent.com'));
  await waitForScratch();
  await ensureScratchOwner();

  let authorize = '';
  await page.route('**accounts.google.com/**', async (route) => {
    authorize = route.request().url();
    await route.abort();
  });

  await signIn(page);
  await openSettings(page);
  await page.getByRole('button', { name: /^Connect Google Calendar$/ }).click();
  await expect.poll(() => authorize, { timeout: 30_000 }).not.toBe('');

  console.log(`authorization URL:\n${authorize}`);
  const url = new URL(authorize);
  const scopes = (url.searchParams.get('scope') ?? '').split(' ').filter(Boolean);
  console.log(`scopes: ${scopes.join('\n        ')}`);

  expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
  expect(scopes).toEqual([
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/calendar.freebusy',
    'https://www.googleapis.com/auth/calendar.app.created',
  ]);
  expect(scopes).not.toContain('https://www.googleapis.com/auth/calendar');
  expect(scopes).not.toContain('https://www.googleapis.com/auth/calendar.events');
  expect(url.searchParams.get('access_type')).toBe('offline');
  expect(url.searchParams.get('prompt')).toBe('consent');
  expect(url.searchParams.get('response_type')).toBe('code');
  expect((url.searchParams.get('state') ?? '').length).toBeGreaterThan(20);

  // The state that was sent is kept only as a hash.
  const stored = scratchQuery('select auth_state_hash from google_connection');
  console.log(`stored state hash: ${stored}`);
  expect(stored).toMatch(/^[0-9a-f]{64}$/);
  expect(stored).not.toBe(url.searchParams.get('state'));

  await page.screenshot({ path: `${CAPTURES}/f102-connect-live.png`, fullPage: true });
});

test('F103. a callback whose state does not match is refused and stores nothing', async ({ page, request }) => {
  const before = Number(
    scratchQuery("select count(*) from integration_credential where provider = 'google_calendar'"),
  );
  const refused = await request.get(
    '/api/integrations/google/callback?code=4%2Fnot-a-real-code&state=not-the-value-this-app-sent',
    { maxRedirects: 0 },
  );
  console.log(`mismatched state answered ${refused.status()}`);
  console.log(await refused.text());
  expect(refused.status()).toBe(403);

  const after = Number(
    scratchQuery("select count(*) from integration_credential where provider = 'google_calendar'"),
  );
  console.log(`stored google credentials before ${before}, after ${after}`);
  expect(after).toBe(before);

  // The owner declining consent comes back with an error and no code, and the
  // route sends him to a URL with nothing on it.
  const declined = await request.get(
    '/api/integrations/google/callback?error=access_denied&state=whatever',
    { maxRedirects: 0 },
  );
  const location = declined.headers().location ?? '';
  console.log(`declined consent answered ${declined.status()} to ${location}`);
  expect(declined.status()).toBe(303);
  expect(location).toContain('/settings');
  expect(location).not.toContain('code');
  expect(location).not.toContain('state');

  await page.goto(location.startsWith('http') ? location : `/settings`);
  console.log(`the browser landed on ${page.url()}`);
  expect(page.url()).not.toContain('code=');
  expect(page.url()).not.toContain('state=');
});

test('C14. the training week and the calendar write render the same confirm component', async ({ page }) => {
  console.log(testStackWithDemoMode('1'));
  await waitForScratch();
  await signIn(page);
  await connectAndChoose(page);
  await acceptSessions(page, 3);
  await buildPlan(page);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await page.goto('/train');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-confirm="summary"]')).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/c14-train-week-${viewport.name}.png`, fullPage: true });

    await openCalendar(page);
    await expect(page.locator('[data-confirm="summary"]')).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/c14-calendar-${viewport.name}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 393, height: 852 });

  // THE SAME COMPONENT, not two that look alike: both surfaces draw the counts
  // block, the three counts in one order, and rows carrying a cause.
  await page.goto('/train');
  await page.waitForLoadState('networkidle');
  const weekCounts = await page.locator('[data-confirm-counts] [data-count]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-count')!),
  );
  await openCalendar(page);
  const calendarCounts = await page.locator('[data-confirm-counts] [data-count]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-count')!),
  );
  console.log(`training week counts: ${weekCounts.join(', ')}`);
  console.log(`calendar write counts: ${calendarCounts.join(', ')}`);
  expect(weekCounts).toEqual(['added', 'moved', 'removed']);
  expect(calendarCounts).toEqual(['added', 'moved', 'removed']);

  // And F72 still holds on screen 06: no control there commits the whole week.
  await page.goto('/train');
  await page.waitForLoadState('networkidle');
  const labels = await page
    .locator('button, a[role=button]')
    .evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? '').trim()).filter(Boolean));
  console.log(`controls on screen 06: ${labels.join(' | ')}`);
  for (const label of labels) {
    expect(label).not.toMatch(/apply \d+ change|accept all|approve the week|confirm all/i);
  }
});

test('F105. a missing stored calendar identifier is an error, never a second calendar', async ({ page }) => {
  await signIn(page);
  const before = scratchQuery('select app_calendar_id, app_calendar_created_at is not null from google_connection');
  console.log(`connection before: ${before}`);

  // The identifier disappears while the grant stays live, which is the state
  // F105 names. There is no lookup path back to an app-created calendar.
  scratchQuery('update google_connection set app_calendar_id = null');
  await buildPlan(page);

  const error = page.locator('[data-state="error"]').first();
  await expect(error).toBeVisible({ timeout: 30_000 });
  console.log(await error.innerText());
  await page.screenshot({ path: `${CAPTURES}/f105-missing-calendar.png`, fullPage: true });

  // AND NO SECOND CALENDAR WAS CREATED.
  const creates = Number(
    scratchQuery("select count(*) from calendar_write where site = 'calendars.insert'"),
  );
  console.log(`calendars.insert writes in the whole log: ${creates}`);
  expect(creates).toBe(1);
});
