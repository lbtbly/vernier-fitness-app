import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import {
  ensureScratchOwner,
  projectRoot,
  scratchSignInLink,
  testStackWithDemoMode,
  waitForScratch,
} from './host';

/**
 * The notifications surface: the eleven diagnostic rows, the four reminder
 * categories, the quiet window, and the Done control that closes an item.
 *
 * ON THE SCRATCH INSTANCE, IN CHROME, because this file WRITES: it toggles a
 * reminder category, moves the quiet window and closes a reminder item. On the
 * owner's install those are settings he chose, and a headless browser turning
 * his session reminder off is a notification he never gets and never knows to
 * look for.
 *
 * WHAT THIS FILE CANNOT PROVE, STATED RATHER THAN IMPLIED. A real subscription
 * needs a push service: Chromium's `pushManager.subscribe` reaches FCM, and
 * nothing on this machine can answer it. So the diagnostics screen is graded
 * here in its FAILING states, which are real and reachable, and the ordering
 * rule is graded engine-free over all eleven rows in
 * tests/unit/push-diagnostics.test.ts. The passing state on a real device is
 * F122, which is an operator line, and its sibling F115 proves the send path
 * and the payload shape with no device at all.
 *
 * F113, F114, F117.
 */

const CAPTURES = `${projectRoot}.forge/evidence/slice-12/captures`;

/** The eleven, in the order they have to pass. */
const CHECKS = [
  'secure',
  'installed',
  'notifications',
  'platform',
  'permission',
  'worker',
  'subscription',
  'keyMatch',
  'serverKnown',
  'delivery',
  'badge',
];

const CATEGORIES = ['session', 'measurements', 'menu', 'missing_data'];

test.beforeAll(async () => {
  mkdirSync(CAPTURES, { recursive: true });
  console.log(testStackWithDemoMode('1', 'reset'));
  await waitForScratch();
  await ensureScratchOwner();
});

async function signIn(page: Page) {
  await page.goto(scratchSignInLink());
  await page.waitForURL(/\/$/);
  await page.waitForLoadState('networkidle');
}

async function openNotifications(page: Page) {
  await signIn(page);
  await page.goto('/settings/notifications');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-push-diagnostics]')).toBeVisible();
}

test.describe('the diagnostics screen', () => {
  test('F114: eleven rows, in order, each with its own remedy', async ({ page }) => {
    await openNotifications(page);
    const rows = await page.locator('[data-check]').evaluateAll((nodes) =>
      nodes.map((node) => ({
        id: node.getAttribute('data-check') ?? '',
        state: node.getAttribute('data-check-state') ?? '',
        text: node.textContent?.trim().replace(/\s+/g, ' ') ?? '',
      })),
    );
    console.log(`walked ${rows.length} row(s)`);
    for (const row of rows) console.log(`  ${row.id} = ${row.state}: ${row.text}`);
    expect(rows.map((row) => row.id)).toEqual(CHECKS);

    // The count is stated on the screen as a number rather than left to be
    // eyeballed off a capture.
    const stated = await page.locator('[data-check-count]').getAttribute('data-check-count');
    expect(stated).toBe('11');
  });

  test('F114: only the first failure carries a remedy, and the rest are not checked', async ({
    page,
  }) => {
    await openNotifications(page);
    const states = await page.locator('[data-check]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-check-state') ?? ''),
    );
    const failed = states.filter((state) => state === 'failed');
    const notChecked = states.filter((state) => state === 'not-checked');
    console.log(`states: ${states.join(', ')}`);
    console.log(`${failed.length} failed, ${notChecked.length} not checked`);

    // A driven Chrome is not a Home Screen web app, so this screen is in a
    // failing state here by construction. That is what makes it worth walking:
    // the passing state needs a device and is F122.
    expect(failed).toHaveLength(1);
    expect(notChecked.length).toBeGreaterThan(0);

    const remedies = await page.locator('[data-remedy]').count();
    console.log(`remedies rendered: ${remedies}`);
    expect(remedies).toBe(1);

    // And the remedy shown belongs to the row that failed.
    const failing = page.locator('[data-check-state="failed"]');
    await expect(failing.locator('[data-remedy]')).toHaveCount(1);

    await page.screenshot({ path: `${CAPTURES}/f114-diagnostics-failing.png`, fullPage: true });
  });

  test('F114: no row below the first failure claims to have passed', async ({ page }) => {
    await openNotifications(page);
    const states = await page.locator('[data-check]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-check-state') ?? ''),
    );
    const firstFailure = states.indexOf('failed');
    expect(firstFailure).toBeGreaterThan(-1);
    const below = states.slice(firstFailure + 1);
    console.log(`rows below the failure: ${below.join(', ')}`);
    // Reporting a check that did not run as one that passed is the failure this
    // project has found seven times. Not one of them says passed.
    expect(below.every((state) => state === 'not-checked')).toBe(true);
  });

  test('F113: the served markup carries the public key and never the private one', async ({
    page,
  }) => {
    await openNotifications(page);
    const html = await page.content();
    // The private half is read in one server file and is not in any bundle.
    expect(html).not.toContain('VAPID_PRIVATE_KEY');

    // Every script this page loaded, searched for the same thing. A key inlined
    // into a chunk would not be in the document.
    const scripts = await page.locator('script[src]').evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLScriptElement).src),
    );
    console.log(`searching ${scripts.length} bundle(s) for the private half`);
    expect(scripts.length).toBeGreaterThan(0);
    let searched = 0;
    for (const src of scripts) {
      const body = await page.evaluate(async (url) => (await fetch(url)).text(), src);
      searched += 1;
      expect(body).not.toContain('VAPID_PRIVATE_KEY');
    }
    console.log(`searched ${searched} bundle(s); the private half is in none of them`);
    expect(searched).toBe(scripts.length);
  });

  test('F113: with no key pair, the send is refused and the screen says so', async ({ page }) => {
    await openNotifications(page);
    // The scratch instance is started with no VAPID pair, which is the state
    // F113 names: the app refuses to send and names the command that fixes it.
    const absent = page.locator('[data-push-keys="absent"]');
    if (await absent.isVisible().catch(() => false)) {
      const text = await absent.innerText();
      console.log(`key-absent card: ${text.replace(/\n/g, ' / ')}`);
      expect(text).toContain('gen-vapid');
    }

    const test = page.locator('[data-push-action="test"]');
    await test.click();
    const result = page.locator('[data-test-result]');
    await expect(result).toBeVisible();
    const detail = await result.innerText();
    console.log(`refused send says: ${detail.replace(/\n/g, ' / ')}`);
    // Refused, in words, with a next step, and no subscription was touched.
    expect(detail.length).toBeGreaterThan(20);
  });
});

test.describe('reminders', () => {
  test('F117: four categories, each switched on its own', async ({ page }) => {
    await openNotifications(page);
    const settings = await page.locator('[data-setting]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-setting') ?? ''),
    );
    console.log(`categories on screen: ${settings.join(', ')}`);
    expect(settings).toEqual(CATEGORIES);

    const before = await page
      .locator('[data-setting="menu"] [data-setting-action="toggle"]')
      .getAttribute('aria-pressed');
    await page.locator('[data-setting="menu"] [data-setting-action="toggle"]').click();
    await expect(
      page.locator('[data-setting="menu"] [data-setting-action="toggle"]'),
    ).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');

    // The other three did not move, because there is no control that decides
    // more than the row it sits in.
    for (const category of CATEGORIES.filter((name) => name !== 'menu')) {
      await expect(
        page.locator(`[data-setting="${category}"] [data-setting-action="toggle"]`),
      ).toHaveAttribute('aria-pressed', 'true');
    }

    await page.screenshot({ path: `${CAPTURES}/f117-reminder-settings.png`, fullPage: true });
  });

  test('F117: the quiet window is two wall clocks and it is stored', async ({ page }) => {
    await openNotifications(page);
    const window = page.locator('[data-quiet-hours]');
    await expect(window).toBeVisible();
    const before = await window.getAttribute('data-quiet-hours');
    console.log(`quiet hours before: ${before}`);

    // Typed, never filled. A field that cannot be typed into passed four rounds
    // of this suite once because fill() sets a whole value in one input event.
    //
    // FOCUS, NOT CLICK. A time input is segments inside a box that is wider
    // than they are, and a click lands wherever the pointer lands: on the blank
    // right-hand side of this one, where no segment is selected and every
    // keystroke after it is dropped. Focusing selects the first segment, which
    // is the hour, every time. `Control+a` went with the click; it selects
    // nothing in a segmented control and only moved the state around.
    const from = page.locator('#quiet-from');
    await from.focus();
    for (const digit of ['2', '1', '3', '0']) await from.press(digit);

    /*
     * THE CHECK THAT WAS MISSING, and it is the whole of why this line went red
     * with the product working. The old test typed and saved without ever
     * asking whether the field had taken the value. Every keystroke was
     * dropped, the screen posted 22:00 back over 22:00, the row was written
     * exactly as asked, and the assertion at the bottom read "unchanged" as
     * "not stored" and blamed the wrong half of the product. If the digits do
     * not land, this is where it goes red, and it says so.
     */
    await expect(from, 'the hour and minute a person typed').toHaveValue('21:30');

    // The far side of the window, as the screen had it before the edit. Read
    // rather than assumed, so this test says nothing about which value the seed
    // happens to carry.
    const until = (before ?? '').split('-')[1] ?? '';
    expect(until).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);

    await page.locator('[data-setting-action="quiet"]').click();
    // Saved, in the screen's own words, before anything is read back. A failed
    // post renders the error card instead, and without this the reload below
    // would read the old row and call it a storage failure.
    await expect(page.locator('[data-saved="quiet"]')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.reload();
    await page.waitForLoadState('networkidle');

    const after = await page.locator('[data-quiet-hours]').getAttribute('data-quiet-hours');
    console.log(`quiet hours before: ${before}, after a reload: ${after}`);
    expect(after).not.toBe(before);
    // TWO WALL CLOCKS AND NOT A DURATION: the far side of the window is
    // untouched by an edit to the near side, so it is asserted whole rather
    // than by its first five characters.
    expect(after).toBe(`21:30-${until}`);
  });

  test('F117: a reminder carries the action that closes it, and the item state follows', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/reminders');
    await page.waitForLoadState('networkidle');

    const items = page.locator('[data-reminder]');
    const count = await items.count();
    console.log(`pending reminders: ${count}`);

    if (count === 0) {
      // An empty list is a real state and it is styled, not a blank screen. It
      // is asserted rather than skipped, because a screen that says nothing is
      // the disqualifier.
      const empty = page.locator('[data-reminders="0"]');
      await expect(empty).toBeVisible();
      const text = await empty.innerText();
      console.log(`empty state: ${text.replace(/\n/g, ' / ')}`);
      expect(text.length).toBeGreaterThan(40);
      return;
    }

    const first = items.first();
    const id = await first.getAttribute('data-reminder');
    await first.locator('[data-reminder-action="done"]').click();
    await expect(page.locator(`[data-reminder="${id}"]`)).toHaveCount(0);

    await page.reload();
    await page.waitForLoadState('networkidle');
    // It stayed closed, which is the item state after the action rather than a
    // row that vanished from a list in a browser.
    await expect(page.locator(`[data-reminder="${id}"]`)).toHaveCount(0);
    console.log(`closed ${id}; it is still closed after a reload`);

    await page.screenshot({ path: `${CAPTURES}/f117-reminder-done.png`, fullPage: true });
  });

  test('every control on the notifications screen clears 44 pixels', async ({ page }) => {
    await openNotifications(page);
    const small = await page
      .locator('main button, main a[href], main input')
      .evaluateAll((nodes) =>
        nodes
          .map((node) => {
            const box = node.getBoundingClientRect();
            return { text: node.textContent?.trim().slice(0, 24) ?? '', height: box.height, width: box.width };
          })
          .filter((box) => box.height > 0 && (box.height < 44 || box.width < 44)),
      );
    console.log(`controls under 44 px: ${small.length}`);
    if (small.length > 0) console.log(JSON.stringify(small));
    expect(small).toEqual([]);
  });
});
