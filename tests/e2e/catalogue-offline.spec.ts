import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
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

/** How many demonstrations the worker must be holding before the origin goes. */
const PRECACHED_FLOOR = 30;

test.beforeAll(() => {
  mkdirSync(CAPTURES, { recursive: true });
});

/**
 * Every demonstration the worker is holding, by path.
 *
 * THIS IS THE PRECONDITION, AND IT REPLACED A MUCH WEAKER ONE. What used to
 * stand here was "at least five images decoded while the origin was up", which
 * measured how many cards fit above the fold on a 393 px viewport: four of
 * them, so F66 failed on a layout fact before it had taken the network away
 * once. It also encoded the old design, where a demonstration reached the cache
 * because the page had fetched it. The worker precaches all 44 at install now
 * and the shell layout asks again on every document load, so what has to be
 * true before going offline is that the CACHE is full, which is what this
 * reads.
 */
async function precachedPaths(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith('vernier-media-'));
    const paths: string[] = [];
    for (const name of names) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) paths.push(new URL(request.url).pathname);
    }
    return paths;
  });
}

/** The decoded width of the image on one card, or 0 when it drew nothing. */
function drawnWidth(page: Page, index: number): Promise<number> {
  return page
    .locator('[data-movement]')
    .nth(index)
    .evaluate((node) => {
      const image = node.querySelector('img');
      return image === null ? 0 : (image as HTMLImageElement).naturalWidth;
    });
}

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

    /*
     * THE CACHE, NOT THE FOLD. This waited for images to decode with the origin
     * up and asked for five of them, which on a 393 px viewport is a question
     * about how many cards fit above the fold: four do, so F66 went red on a
     * layout fact having never taken the network away. What has to be true here
     * is that the worker is HOLDING the demonstrations, which is a number about
     * the product rather than about the viewport.
     */
    await page.waitForLoadState('networkidle');
    await expect
      .poll(async () => (await precachedPaths(page)).length, { timeout: 60_000 })
      .toBeGreaterThanOrEqual(PRECACHED_FLOOR);
    const precached = await precachedPaths(page);
    console.log(`demonstrations the worker is holding: ${precached.length}`);
    console.log(`first five of them: ${precached.slice(0, 5).join(', ')}`);

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
    expect(offlineCards).toBeGreaterThanOrEqual(30);

    /*
     * FIVE CARDS, EACH SCROLLED TO WITH NO ORIGIN AND EACH WAITED FOR.
     *
     * The cards carry loading=lazy, so an image is requested when it nears the
     * viewport and not before. Counting what happened to have decoded on load
     * counts the fold again, which is what this test kept doing to itself. Each
     * of the first five is scrolled to, the way a person in a basement gym
     * scrolls, and each one has to decode: `naturalWidth > 0` is the browser
     * saying it read the bytes, and a card whose image failed still renders its
     * alt text, its cue and its caption, so nothing weaker sees the difference.
     */
    const drawn: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      await page.locator('[data-movement]').nth(index).scrollIntoViewIfNeeded();
      await expect
        .poll(() => drawnWidth(page, index), { timeout: 20_000 })
        .toBeGreaterThan(0);
      drawn.push(
        await page
          .locator('[data-movement]')
          .nth(index)
          .evaluate((node) => {
            const image = node.querySelector('img') as HTMLImageElement | null;
            const id = node.getAttribute('data-movement') ?? '';
            return image === null
              ? `${id} drew nothing`
              : `${id} ${image.getAttribute('src')} ${image.naturalWidth}x${image.naturalHeight}`;
          }),
      );
    }
    console.log(`offline: ${offlineCards} cards. The five drawn with no origin:\n  ${drawn.join('\n  ')}`);
    expect(drawn).toHaveLength(5);

    // The capture F66 asks for: five movement cards, offline.
    await page.locator('[data-movement]').nth(4).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${CAPTURES}/f66-five-cards-offline.png`, fullPage: false });
    await page.screenshot({ path: `${CAPTURES}/f66-catalogue-offline-full.png`, fullPage: true });

    await context.unroute('**/*');
    await context.setOffline(false);
  });

  test('a movement never scrolled into view renders with the origin gone', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    // WHAT WOULD MAKE THIS RED: a worker that caches a demonstration when the
    // page fetches it rather than at install. The cards carry loading=lazy, so
    // a card the owner never scrolled past while online was never fetched, has
    // no cache entry, and offline its image decodes to 0 by 0 pixels. That was
    // the shipped behaviour: 6 of 44 rendered offline and the other 38 did not.
    await page.goto(mintSignInLink());
    await page.goto('/train/catalogue');
    await expect(page.locator('[data-movement]').first()).toBeVisible();

    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const registration = await navigator.serviceWorker.getRegistration();
            return Boolean(registration?.active);
          }),
        { timeout: 60_000 },
      )
      .toBe(true);
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 30_000 })
      .toBe(true);

    // The precache runs inside the install event's waitUntil, so an active
    // worker has already finished it. The shell layout asks again on every
    // document load, which is what repairs an install that happened on the
    // sign-in screen, so this waits for the cache to hold the whole manifest
    // rather than assuming either path won the race.
    // It is polled rather than read once. A fill of 44 files runs inside the
    // install event's waitUntil and again on every document load, and a single
    // read taken while it is still running would fail a worker that was about
    // to be right. The floor it has to reach is unchanged.
    await expect
      .poll(async () => (await precachedPaths(page)).length, { timeout: 60_000 })
      .toBeGreaterThanOrEqual(PRECACHED_FLOOR);
    const cachedNames = await page.evaluate(() => caches.keys());
    const cached = { entries: await precachedPaths(page) };
    console.log(`caches on the device: ${cachedNames.join(', ')}`);
    console.log(`demonstrations precached: ${cached.entries.length}`);
    expect(cached.entries.length).toBeGreaterThanOrEqual(PRECACHED_FLOOR);

    // NOTHING IS SCROLLED. Whatever decoded here decoded because it was on the
    // first screen, and every id that did not is a card this browser has never
    // asked the origin for.
    await page.waitForLoadState('networkidle');
    const seenOnline = await page.locator('[data-movement]').evaluateAll((nodes) =>
      nodes
        .filter((node) => {
          const image = node.querySelector('img');
          return image !== null && (image as HTMLImageElement).naturalWidth > 0;
        })
        .map((node) => node.getAttribute('data-movement') ?? ''),
    );
    const allCards = await page
      .locator('[data-movement]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-movement') ?? ''));
    const neverSeen = allCards.filter((id) => !seenOnline.includes(id));
    console.log(
      `${allCards.length} cards, ${seenOnline.length} decoded without scrolling, ` +
        `${neverSeen.length} never requested while online`,
    );
    // The population this test rests on. An empty one would make everything
    // below vacuous, which is the failure this run keeps finding.
    expect(neverSeen.length).toBeGreaterThan(0);

    // Now the origin goes away, from the page and from the worker.
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
    expect(reachable, 'the origin must really be gone before an offline capture means anything').toBe(
      false,
    );

    await page.reload();
    await expect(page.locator('[data-movement]').first()).toBeVisible();

    // The card the browser has never asked for, scrolled to for the first time
    // with no network at all.
    const target = neverSeen[neverSeen.length - 1];
    const card = page.locator(`[data-movement="${target}"]`);
    await card.scrollIntoViewIfNeeded();
    await expect
      .poll(
        () =>
          card.evaluate((node) => {
            const image = node.querySelector('img');
            return image === null ? 0 : (image as HTMLImageElement).naturalWidth;
          }),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);
    const drawn = await card.evaluate((node) => {
      const image = node.querySelector('img') as HTMLImageElement | null;
      return image === null ? '' : `${image.getAttribute('src')} ${image.naturalWidth}x${image.naturalHeight}`;
    });
    console.log(`offline, never scrolled to while online: ${target} drew ${drawn}`);
    await card.screenshot({ path: `${CAPTURES}/f66-never-seen-card-offline.png` });

    // And then the whole catalogue, walked to the bottom with the origin still
    // gone, so the claim is 44 of 44 rather than one lucky card.
    for (let index = 0; index < allCards.length; index += 4) {
      await page.locator('[data-movement]').nth(index).scrollIntoViewIfNeeded();
      await page.waitForTimeout(120);
    }
    await page.locator('[data-movement]').last().scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const decodedOffline = await page.locator('[data-movement] img').evaluateAll((nodes) =>
      nodes.filter((node) => (node as HTMLImageElement).naturalWidth > 0).length,
    );
    console.log(`offline: ${decodedOffline} of ${allCards.length} demonstrations decoded`);
    expect(decodedOffline).toBe(allCards.length);

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
