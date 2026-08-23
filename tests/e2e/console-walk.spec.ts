import { mkdirSync } from 'node:fs';
import { expect, retypeInto, test, type Page } from './fixtures';
import {
  ensureScratchOwner,
  projectRoot,
  scratchQuery,
  scratchSignInLink,
  testStackWithDemoMode,
  waitForScratch,
} from './host';

/**
 * C9. Zero console errors and zero failed network requests across Today,
 * Health, the quick-log flow and the session player, at three viewports.
 *
 * IT MOVED TO THIS SLICE BECAUSE ONE OF THE FOUR SURFACES IS THE PLAYER, which
 * did not exist until now. The verifier correctly left the line unchecked twice
 * in slice 4 rather than reading three surfaces as four.
 *
 * THE QUICK LOG IS WALKED AS A WRITE. Opening a sheet and closing it exercises
 * a render; saving through it exercises the outbox, the anti-forgery pair, the
 * idempotency key and the route, which is where a failed request would actually
 * come from. That is why this file runs on the scratch instance: it writes a
 * measurement on every run, and `measurement` refuses DELETE, so on the owner's
 * install those rows would be permanent.
 *
 * A ZERO IS EVIDENCE ONLY BESIDE THE POPULATION IT COVERED, so every run prints
 * the surfaces it walked, how many requests it saw and how many console lines
 * it read. A walk that saw four requests and no errors is a walk that did not
 * happen.
 */

const CAPTURES = `${projectRoot}.forge/evidence/slice-8/captures`;

/*
 * A different waist per viewport, so each of the three walks is a write of its
 * own and not the same number sent three times. The provenance spine drops the
 * identical fact from the same source on the same day, correctly, and three
 * identical sends would have left two of these three walks proving a render.
 */
const VIEWPORTS = [
  { name: '393x852', width: 393, height: 852, waist: '92.5' },
  { name: '768x1024', width: 768, height: 1024, waist: '92.6' },
  { name: '1280x800', width: 1280, height: 800, waist: '92.7' },
];

type Watch = {
  console: string[];
  failed: string[];
  requests: number;
  responses: number;
};

function watch(page: Page): Watch {
  const state: Watch = { console: [], failed: [], requests: 0, responses: 0 };
  page.on('console', (message) => {
    if (message.type() === 'error') state.console.push(`${message.location().url}: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    state.failed.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? ''}`);
  });
  page.on('request', () => {
    state.requests += 1;
  });
  page.on('response', (response) => {
    state.responses += 1;
    if (response.status() >= 400) {
      state.failed.push(`${response.request().method()} ${response.url()}: HTTP ${response.status()}`);
    }
  });
  return state;
}

test.beforeAll(async () => {
  mkdirSync(CAPTURES, { recursive: true });
  console.log(testStackWithDemoMode('1', 'up'));
  await waitForScratch();
  await ensureScratchOwner();
});

test.describe('C9, four surfaces at three viewports', () => {
  for (const viewport of VIEWPORTS) {
    test(`no console error and no failed request at ${viewport.name}`, async ({ page }) => {
      test.setTimeout(180_000);
      const seen = watch(page);
      const walked: string[] = [];

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(scratchSignInLink());
      await page.waitForURL(/\/$/);
      await page.waitForLoadState('networkidle');

      // 1. Today.
      walked.push('/');
      await expect(page.locator('.today')).toBeVisible();
      await page.screenshot({ path: `${CAPTURES}/c9-today-${viewport.name}.png`, fullPage: true });

      // 2. The quick log, AS A WRITE. Typed rather than filled: what is being
      // proven is that the field takes typing, and `fill` sets a whole value in
      // one input event, which passed for four rounds over a field nobody could
      // type into.
      //
      // AND THE FIELD IS EMPTIED FIRST. The sheet prefills the waist with the
      // last stored reading, and a click plus `keyboard.type` leaves the caret
      // where a programmatic focus put it, which is index 0. So "92.5" typed
      // over "98.5" produced "92.598.5", the save was refused for a waist no
      // band accepts, `[data-just-logged]` never appeared, and this test failed
      // at all three viewports on a step that has nothing to do with C9. Zero
      // manual waist rows landed on any of the three runs, which is what the
      // check below reads back.
      walked.push('/ quick log, as a write');
      await page.getByRole('button', { name: 'Quick log' }).first().click();
      const sheet = page.locator('.sheet');
      await expect(sheet).toBeVisible();
      await retypeInto(page.locator('#quick-log-waist'), viewport.waist);
      await sheet.getByRole('button', { name: 'Energy, 4 of 5' }).click();
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(page.locator('[data-just-logged]')).toBeVisible();
      await page.screenshot({ path: `${CAPTURES}/c9-quicklog-${viewport.name}.png`, fullPage: true });

      // 3. Health.
      walked.push('/health');
      await page.goto('/health');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${CAPTURES}/c9-health-${viewport.name}.png`, fullPage: true });

      // 4. The session player, opened and run for two sets.
      walked.push('/train');
      await page.goto('/train');
      await page.waitForLoadState('networkidle');
      const propose = page.getByRole('button', { name: 'Propose next week' });
      if (await propose.isVisible().catch(() => false)) await propose.click();
      const rows = page.locator('[data-proposal]');
      await expect(rows.first()).toBeVisible();
      const id = await rows.first().getAttribute('data-proposal');
      if ((await rows.first().getAttribute('data-state')) !== 'accepted') {
        await rows.first().locator('[data-decision="accept"]').click();
        await expect(rows.first()).toHaveAttribute('data-state', 'accepted');
      }

      walked.push(`/train/session/${id}`);
      await page.goto(`/train/session/${id}`);
      await page.waitForLoadState('networkidle');
      await page.locator('[data-action="start"]').click();
      await expect(page.locator('[data-phase="work"]')).toBeVisible();
      await page.locator('[data-action="set-done"]').click();
      await expect(page.locator('[data-phase="rest"]')).toBeVisible();
      await page.getByRole('button', { name: 'Skip rest' }).click();
      await expect(page.locator('[data-phase="work"]')).toBeVisible();
      await page.screenshot({ path: `${CAPTURES}/c9-player-${viewport.name}.png`, fullPage: true });

      // Let the outbox drain, so a write that failed on its way home is counted
      // rather than left in the air when the page closes.
      const queueDepth = () =>
        page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const request = indexedDB.open('vernier', 1);
              request.onsuccess = () => {
                const store = request.result.transaction('outbox', 'readonly').objectStore('outbox');
                const all = store.getAll();
                all.onsuccess = () => resolve(all.result.length);
                all.onerror = () => resolve(-1);
              };
              request.onerror = () => resolve(-1);
            }),
        );
      await expect.poll(queueDepth, { timeout: 30_000 }).toBe(0);

      // THE POPULATION, PRINTED, BESIDE THE ZEROS.
      console.log(
        [
          `viewport ${viewport.name}`,
          `surfaces walked: ${walked.join(', ')}`,
          `requests seen: ${seen.requests}, responses: ${seen.responses}`,
          `console errors: ${seen.console.length}`,
          `failed requests: ${seen.failed.length}`,
          ...seen.console.map((line) => `  console: ${line}`),
          ...seen.failed.map((line) => `  failed:  ${line}`),
        ].join('\n'),
      );

      expect(walked).toHaveLength(5);
      expect(seen.requests).toBeGreaterThan(20);
      expect(seen.responses).toBeGreaterThan(20);
      expect(seen.console).toEqual([]);
      expect(seen.failed).toEqual([]);
    });
  }

  test('the writes really landed, so the walk was a walk and not a render', async () => {
    const waist = scratchQuery(
      'select count(*) from measurement where metric = \'waist\' and source = \'manual\'',
    );
    const sets = scratchQuery('select count(*) from set_log');
    console.log(`after the walk: ${waist} manual waist rows, ${sets} logged sets`);
    expect(Number(waist)).toBeGreaterThan(0);
    expect(Number(sets)).toBeGreaterThan(0);
  });
});
