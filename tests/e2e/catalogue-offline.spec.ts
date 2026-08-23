import { mkdirSync } from 'node:fs';
import { expect, test } from './fixtures';
import { mintSignInLink, projectRoot, query } from './host';

/**
 * F66. The movement catalogue renders with the network disabled.
 *
 * WITH THE WORKER RUNNING, WHICH IS THE WHOLE POINT. Every other file in this
 * suite runs under `serviceWorkers: 'block'`, and an offline test with no
 * worker installed is a test with nothing to be offline: that trap has cost
 * this run once already and it is why `service-worker.spec.ts` exists in its
 * own project. This file joins that project for the same reason. What is being
 * proven is that a bundled demonstration is on the phone, served by the worker,
 * and paints in a basement gym with no signal.
 *
 * IT ONLY READS. No proposal, no decision, no set. It signs in, opens the
 * catalogue, takes the origin away and reloads, so it is safe against the
 * owner's own installation, which is where the worker really lives.
 *
 * THE ASSERTION THAT MATTERS IS `naturalWidth`. A card whose image failed
 * offline still renders its alt text, its cue and its caption, and a test that
 * counted cards would pass over 44 broken images. `naturalWidth > 0` is the
 * browser saying it decoded the bytes.
 */

const CAPTURES = `${projectRoot}.forge/evidence/slice-8/captures`;

test.beforeAll(() => {
  mkdirSync(CAPTURES, { recursive: true });
});

test.describe('the catalogue offline', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(Number(query('select count(*) from owner')) === 0, 'no owner account on this installation yet');

  test('at least 30 movements, each with cue text, and five cards drawn with no origin', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await page.goto(mintSignInLink());
    await page.goto('/train/catalogue');
    await expect(page.locator('[data-movement]').first()).toBeVisible();

    // The count, off the screen, which is reading the database rather than the
    // bundled module: the page is server rendered from the `movement` table.
    const count = await page.locator('[data-movement]').count();
    const ids = await page
      .locator('[data-movement]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-movement')));
    console.log(`catalogue holds ${count} movements: ${ids.join(', ')}`);
    expect(count).toBeGreaterThanOrEqual(30);

    // Cue text on every one of them, walked rather than sampled.
    const cues = await page
      .locator('[data-movement] [data-cue]')
      .evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? '').trim()));
    expect(cues).toHaveLength(count);
    for (const cue of cues) expect(cue.length).toBeGreaterThan(40);

    // The worker, registered, active and controlling. All three, because a
    // worker that is merely registered answers nothing.
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const registration = await navigator.serviceWorker.getRegistration();
            return Boolean(registration?.active);
          }),
        { timeout: 30_000 },
      )
      .toBe(true);
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 30_000 })
      .toBe(true);
    console.log('the worker is active and controlling the catalogue');

    // Let the images come through the worker, so they are in its cache.
    await page.waitForLoadState('networkidle');
    const decodedOnline = await page.locator('[data-movement] img').evaluateAll((nodes) =>
      nodes.filter((node) => (node as HTMLImageElement).naturalWidth > 0).length,
    );
    console.log(`images decoded with the origin up: ${decodedOnline}`);
    expect(decodedOnline).toBeGreaterThanOrEqual(5);

    // Now take the origin away, from the page and from the worker.
    await context.route('**/*', (route) => route.abort('connectionfailed'));
    await context.setOffline(true);
    const reachable = await page.evaluate(async () => {
      try {
        const response = await fetch('/healthz', { method: 'HEAD', cache: 'no-store' });
        return response.ok;
      } catch {
        return false;
      }
    });
    expect(reachable, 'the origin must really be gone before an offline capture means anything').toBe(false);

    await page.reload();
    await expect(page.locator('[data-movement]').first()).toBeVisible();
    const offlineCards = await page.locator('[data-movement]').count();
    const decodedOffline = await page.locator('[data-movement] img').evaluateAll((nodes) =>
      nodes
        .filter((node) => (node as HTMLImageElement).naturalWidth > 0)
        .map((node) => (node as HTMLImageElement).getAttribute('src')),
    );
    console.log(
      `offline: ${offlineCards} cards, ${decodedOffline.length} images decoded, first five: ${decodedOffline
        .slice(0, 5)
        .join(', ')}`,
    );
    expect(offlineCards).toBeGreaterThanOrEqual(30);
    expect(decodedOffline.length).toBeGreaterThanOrEqual(5);

    // The capture F66 asks for: five movement cards, offline.
    await page.locator('[data-movement]').nth(4).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${CAPTURES}/f66-five-cards-offline.png`, fullPage: false });
    await page.screenshot({ path: `${CAPTURES}/f66-catalogue-offline-full.png`, fullPage: true });

    await context.unroute('**/*');
    await context.setOffline(false);
  });

  test('every card names the author of the picture on it', async ({ page }) => {
    await page.goto(mintSignInLink());
    await page.goto('/train/catalogue');
    await expect(page.locator('[data-movement]').first()).toBeVisible();
    const captions = await page
      .locator('[data-movement] figcaption')
      .evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? '').trim()));
    console.log(`captions read: ${captions.length}`);
    expect(captions.length).toBeGreaterThanOrEqual(30);
    for (const caption of captions) {
      expect(caption).toMatch(/Demonstration by .+/);
      expect(caption).toMatch(/checked \d+ [A-Z][a-z]{2}/);
    }
  });
});
