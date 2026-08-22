import { execFileSync } from 'node:child_process';
import { expect, test } from './fixtures';
import { strings } from '@/lib/strings';
import { baseUrl, mintSignInLink, projectRoot, query } from './host';

/**
 * The worker, with the worker running.
 *
 * Every other end-to-end file in this suite runs under `serviceWorkers:
 * 'block'`, which is right for them: the worker owns every fetch on this origin
 * once it is installed, and a request it makes is outside `page.route`'s reach,
 * so a test that wants to take the origin away from the page has to be able to
 * take it away. The cost is that the offline test proves nothing about the
 * worker, because under that setting there is no worker. That gap had to be
 * closed by hand at the last verify, which is exactly the kind of proof that
 * belongs in the suite rather than in a transcript.
 *
 * So this file is the other half, in its own project with the worker allowed:
 * it installs, it activates, it controls the page, and then the origin is taken
 * away from the browser and the worker's own `fetch` is asked what it can
 * reach. The pair of facts is what makes the answer mean anything. The worker
 * cannot reach `/healthz`, and a `curl` from this host can, so the origin is up
 * and it is the browser that is cut off rather than the Mac mini that is down.
 */

/** Straight from the host shell, outside the browser entirely. */
function hostStatus(path: string): string {
  return execFileSync(
    'bash',
    ['-c', `curl -s -o /dev/null -w '%{http_code}' ${baseUrl()}${path}`],
    { cwd: projectRoot, encoding: 'utf8' },
  ).trim();
}

test.describe('the service worker', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(Number(query('select count(*) from owner')) === 0, 'no owner account on this installation yet');

  test('installs, controls the page, and loses the origin with the host still answering', async ({
    page,
    context,
  }) => {
    await page.goto(mintSignInLink());
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

    // Registered and activated first. A worker that is merely registered does
    // not answer requests, so both halves are waited for rather than assumed.
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

    // Then controlling. `clients.claim()` takes the pages that are already open
    // and a reload settles it either way, which is what a second visit is.
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
        timeout: 30_000,
      })
      .toBe(true);
    console.log('the worker is active and controlling this page');

    let workers = context.serviceWorkers();
    if (workers.length === 0) {
      await context.waitForEvent('serviceworker', { timeout: 15_000 });
      workers = context.serviceWorkers();
    }
    console.log(`service worker targets: ${workers.map((worker) => worker.url()).join(', ')}`);
    expect(workers.length).toBeGreaterThan(0);

    // While the origin is there, the worker can reach it. Without this the
    // failure below would prove only that the probe never worked.
    const before = await workers[0].evaluate(async () => {
      try {
        const response = await fetch('/healthz', { method: 'HEAD', cache: 'no-store' });
        return `HTTP ${response.status}`;
      } catch (error) {
        return `FAILED: ${(error as Error).message}`;
      }
    });
    console.log(`worker probe of /healthz, origin reachable: ${before}`);
    expect(before).toBe('HTTP 200');

    // Take it away from the whole browser, worker included.
    await context.route('**/*', (route) => route.abort('connectionfailed'));
    await context.setOffline(true);

    const offlineProbe = await workers[0].evaluate(async () => {
      try {
        const response = await fetch('/healthz', { method: 'HEAD', cache: 'no-store' });
        return `HTTP ${response.status}`;
      } catch (error) {
        return `FAILED: ${(error as Error).message}`;
      }
    });
    console.log(`worker probe of /healthz, origin taken away: ${offlineProbe}`);
    expect(offlineProbe).toContain('FAILED');

    // A write through the worker fails the same way, which is what the outbox
    // is for and why it never branches on navigator.onLine.
    const offlineWrite = await workers[0].evaluate(async () => {
      try {
        const response = await fetch('/api/log', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        return `HTTP ${response.status}`;
      } catch (error) {
        return `FAILED: ${(error as Error).message}`;
      }
    });
    console.log(`worker probe of POST /api/log, origin taken away: ${offlineWrite}`);
    expect(offlineWrite).toContain('FAILED');

    // The other half of the pair: the Mac mini is up the whole time.
    const fromHost = hostStatus('/healthz');
    console.log(`host curl of /healthz while the browser is cut off: ${fromHost}`);
    expect(fromHost).toBe('200');

    await context.unroute('**/*');
    await context.setOffline(false);
  });

  /**
   * C6, at the last resort. With Cache Storage evicted the worker answered
   * `new Response('Offline', {status: 503})`: a word on a screen with no
   * catalogue key, duplicating strings.offline.title with no reference to it,
   * and reachable in normal use because eviction is the browser's decision
   * under storage pressure rather than anybody's action here.
   *
   * The worker cannot import the catalogue, so scripts/build-sw.mjs writes it
   * in and `npm run sw:check` keeps the two equal. This is the other end of
   * that: the words the owner actually reads when every cache has gone.
   */
  test('answers an evicted cache with the catalogue\'s offline copy and not a bare word', async ({
    page,
    context,
  }) => {
    await page.goto(mintSignInLink());
    await page.goto('/');
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 30_000 })
      .toBe(true);

    // The control: the origin gone, the caches intact. This is the offline
    // document the worker precached, and it is what the owner normally gets.
    await context.route('**/*', (route) => route.abort('connectionfailed'));
    const cached = await page.goto('/eat');
    console.log(`cache intact: HTTP ${cached?.status()} ${cached?.headers()['content-type']}`);
    expect(cached?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: strings.offline.cardTitle })).toBeVisible();

    // Now the browser takes the storage back, which is the state this answers.
    await context.unroute('**/*');
    await page.goto('/');
    const evicted = await page.evaluate(async () => {
      let entries = 0;
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          await cache.delete(request);
          entries += 1;
        }
      }
      return entries;
    });
    console.log(`cache entries evicted: ${evicted}`);
    expect(evicted).toBeGreaterThan(0);

    await context.route('**/*', (route) => route.abort('connectionfailed'));
    const lastResort = await page.goto('/eat');
    const body = await page.content();
    console.log(
      `cache evicted: HTTP ${lastResort?.status()} ${lastResort?.headers()['content-type']}`,
    );
    expect(lastResort?.status()).toBe(503);
    expect(lastResort?.headers()['content-type']).toContain('text/html');
    expect(body).toContain(strings.offline.title);
    expect(body).toContain(strings.offline.cardTitle);
    expect(body).toContain(strings.offline.causeSuffix);
    // The bare word on its own, which is what this replaced.
    expect(body).not.toMatch(/^Offline$/);

    await context.unroute('**/*');
    await context.setOffline(false);
  });
});
