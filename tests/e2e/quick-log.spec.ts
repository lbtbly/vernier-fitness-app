import { expect, test, typeKeyByKey, typedSoFar, type BrowserContext, type Page } from './fixtures';
import {
  ensureScratchOwner,
  resetScratchProvenance,
  scratchQuery,
  scratchSignInLink,
  testStackWithDemoMode,
  waitForScratch,
} from './host';

/**
 * The quick log and the provenance spine, end to end, at 393x852.
 *
 * ON THE SCRATCH INSTANCE, IN CHROME, and both halves of that are the same
 * decision. This file is the destructive end of the suite: it truncates the
 * provenance tables between tests, because what it grades is a chain of
 * corrections and a chain means nothing on top of yesterday's rows. It used to
 * do that to the owner's live install behind a guard that counted rows older
 * than the run, and a row logged through the shipped quick log a second after
 * the run started counted as the run's own. One real reading died that way.
 *
 * So it runs against the instance that holds nothing anybody would miss. That
 * instance answers on plain loopback HTTP, the session cookie is Secure as F11
 * requires, and WebKit refuses a Secure cookie from an http origin however
 * local it is: probed on 127.0.0.1 and on localhost, and in both the cookie jar
 * came back empty and the browser sat on the sign-in screen. Chrome accepts one
 * from a loopback origin, so Chrome drives this file. What that costs is
 * honest: the behaviour below is proven in Chrome and not in WebKit, and every
 * other spec in this suite still runs in WebKit against the real HTTPS origin.
 * The alternative was a second HTTPS proxy on the tailnet in front of a test
 * instance, which would have put a second entry in the serve configuration that
 * F4 counts and a test account on the tailnet, to keep an engine.
 *
 * F20, F21, F22, F23, F24, F26 and C5. Everything here goes through the shipped
 * screens: no test-only route, no seeded session, no back door into the write
 * path. The one thing borrowed from the host is the sign-in link, which is the
 * procedure docs/security.md already documents for the owner.
 */

const CAPTURES = new URL('../../.forge/evidence/slice-3/captures/', import.meta.url).pathname;

/**
 * Take the origin away, properly.
 *
 * `context.setOffline` is honoured by some engines and quietly ignored by
 * others, and a page-level route is invisible to a service worker's own
 * fetches: a test that takes only the page offline passes while proving
 * nothing, and that trap has already cost this run once. So both are applied,
 * and playwright.config.ts blocks service workers for the whole suite, which
 * means there is no worker target left with a route home. The assertion below
 * proves the origin really is unreachable rather than assuming it.
 */
async function goOffline(context: BrowserContext, page: Page): Promise<void> {
  await context.route('**/*', (route) => route.abort('connectionfailed'));
  try {
    await context.setOffline(true);
  } catch (error) {
    console.log(`setOffline is not implemented in this engine: ${(error as Error).message}`);
  }
  const reachable = await page.evaluate(async () => {
    try {
      const response = await fetch('/healthz', { method: 'HEAD', cache: 'no-store' });
      return response.ok;
    } catch {
      return false;
    }
  });
  expect(reachable, 'the origin must really be unreachable before an offline write means anything').toBe(false);
}

async function goOnline(context: BrowserContext, page: Page): Promise<void> {
  await context.unroute('**/*');
  try {
    await context.setOffline(false);
  } catch {
    // Already covered by unroute.
  }
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        try {
          const response = await fetch('/healthz', { method: 'HEAD', cache: 'no-store' });
          return response.ok;
        } catch {
          return false;
        }
      }),
    )
    .toBe(true);
}

/**
 * Let every running animation finish before a capture. The sheet enters over
 * 200 ms, and a screenshot taken the instant the element becomes visible
 * catches the scrim and an unpainted sheet, which is a picture of nothing.
 */
async function settle(page: Page): Promise<void> {
  if ((await page.locator('.sheet').count()) > 0) {
    await page
      .locator('.sheet')
      .evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)))
      .catch(() => undefined);
  }
  await page.waitForTimeout(120);
}

async function signIn(page: Page): Promise<void> {
  await page.goto(scratchSignInLink());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
}

/**
 * The headers a signed-in write carries, with the session written in by hand.
 *
 * The session cookie is Secure, as F11 requires, and Playwright's request
 * context will not attach a Secure cookie to an http origin even a loopback
 * one, where the browser itself does. The page above is signed in through the
 * shipped door; this is that same session, in the header the browser would have
 * sent, so what is being measured stays the route's behaviour and not
 * Playwright's cookie policy.
 */
async function signedInHeaders(
  context: BrowserContext,
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const jar = new Map((await context.cookies()).map((cookie) => [cookie.name, cookie.value]));
  return {
    'content-type': 'application/json',
    'idempotency-key': crypto.randomUUID(),
    'x-vernier-csrf': jar.get('vernier_csrf')!,
    cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '),
    ...extra,
  };
}

/**
 * The instance these tests run against, brought up before they do.
 *
 * The same image, the same boot path, the same demonstration seed, its own
 * database, its own container. It is reset here rather than assumed, because
 * the specs that ran before this one use the scratch instance for a first run
 * and a wrong master key and leave it holding whatever those needed.
 *
 * The owner account is created through the shipped bootstrap route, and every
 * sign-in below mints a one-time link on this container. Nothing in this file
 * can reach the owner's installation.
 */
async function bringUpTheScratchInstance(): Promise<void> {
  testStackWithDemoMode('1', 'reset');
  await waitForScratch();
  await ensureScratchOwner();
}

test.describe('the quick log', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async () => {
    await bringUpTheScratchInstance();
  });

  /**
   * F23. Six taps or fewer from Today, for each of the six things the sheet
   * commits. The count is printed per metric and it is a real count: every
   * click below is one finger on one target.
   */
  test('commits each of the six in six taps or fewer from Today', async ({ page }) => {
    resetScratchProvenance();
    await signIn(page);

    const counts: Array<[string, number]> = [];

    const fields: Array<{ metric: string; tap: (page: Page) => Promise<void> }> = [
      {
        metric: 'waist',
        tap: async (target) => {
          await target.getByRole('button', { name: 'Up half a centimetre' }).click();
        },
      },
      { metric: 'energy', tap: (target) => target.getByRole('button', { name: 'Energy, 4 of 5' }).click() },
      { metric: 'fatigue', tap: (target) => target.getByRole('button', { name: 'Fatigue, 2 of 5' }).click() },
      { metric: 'hunger', tap: (target) => target.getByRole('button', { name: 'Hunger, 3 of 5' }).click() },
      { metric: 'satiety', tap: (target) => target.getByRole('button', { name: 'Satiety after eating, 4 of 5' }).click() },
      {
        metric: 'note',
        tap: async (target) => {
          await target.getByLabel('Note').click();
          await target.getByLabel('Note').fill('Slept badly. Left knee fine.');
        },
      },
    ];

    for (const field of fields) {
      let taps = 0;

      await page.goto('/');
      await page.getByRole('button', { name: 'Quick log', exact: true }).click();
      taps += 1;

      await expect(page.getByRole('dialog', { name: 'Quick log' })).toBeVisible();
      await field.tap(page);
      taps += 1;

      await page.getByRole('button', { name: 'Save', exact: true }).click();
      taps += 1;

      counts.push([field.metric, taps]);
      console.log(`${field.metric}: ${taps} taps from Today`);
      expect(taps).toBeLessThanOrEqual(6);

      // Each write leaves the queue before the next one starts, so the counts
      // above are counts and not a race.
      await expect
        .poll(
          () =>
            Number(
              scratchQuery(`select count(*) from measurement where metric = '${field.metric}' and source = 'manual'`),
            ),
          { timeout: 20_000 },
        )
        .toBe(1);
    }

    console.log(counts.map(([metric, taps]) => `${metric}=${taps}`).join(' '));
    expect(counts).toHaveLength(6);
    expect(Math.max(...counts.map(([, taps]) => taps))).toBeLessThanOrEqual(6);

    const stored = scratchQuery(
      `select metric || ' ' || raw_value || ' ' || unit || ' ' || source || ' ' || confidence
       from measurement where source = 'manual' order by metric`,
    );
    console.log(stored);
    expect(stored.split('\n')).toHaveLength(6);
  });

  /**
   * F24. A genuine offline write: the origin is gone, the sheet still commits,
   * the entry sits in IndexedDB keyed by the client UUID that is also its
   * Idempotency-Key, and when the origin comes back it replays exactly once.
   */
  test('commits offline, shows the queue, and replays exactly once', async ({ page, context }) => {
    resetScratchProvenance();
    await signIn(page);

    await page.getByRole('button', { name: 'Quick log', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Quick log' })).toBeVisible();
    // Wait for the snapshot to land, so the sheet is in its loaded state before
    // the origin disappears, which is the real sequence: signal drops mid entry.
    await expect(page.getByRole('button', { name: 'Energy, 4 of 5' })).toBeEnabled();

    await goOffline(context, page);

    await page.getByRole('button', { name: 'Energy, 2 of 5' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    // Committed on the phone. The entry is in IndexedDB and its key is the
    // Idempotency-Key the replay will carry.
    const queuedKey = await page.evaluate(async () => {
      const open = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('vernier', 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const db = await open();
      const rows = await new Promise<Array<{ id: string; url: string; body: string }>>((resolve, reject) => {
        const tx = db.transaction('outbox', 'readonly');
        const request = tx.objectStore('outbox').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return rows[0];
    });
    console.log(`queued offline: ${JSON.stringify(queuedKey)}`);
    expect(queuedKey.url).toBe('/api/log');
    expect(queuedKey.id).toMatch(/^[0-9a-f-]{36}$/);

    // Nothing reached the database while the origin was gone.
    expect(scratchQuery("select count(*) from measurement where metric = 'energy' and source = 'manual'")).toBe('0');

    // The queue count is on Today, with the sheet closed, which is where
    // screen 03 frame 2 draws it. save() closes the sheet, so this is the state
    // the owner is actually looking at a second after he presses Save, and it
    // used to show a marker with no number in it.
    //
    // It is its own neutral line under the title now, not a notice folded into
    // the warn region: an offline queue needs no action and clears itself, and
    // `.forge/RULING-SLICE-4.md` question 2 refused the merge on the colour, on
    // the hidden number and on the copy. The count is on the line, with no tap.
    const todayBanner = page.locator('main .banner.queue[data-state="offline"]');
    await expect(todayBanner).toBeVisible();
    const todayCount = await todayBanner.textContent();
    console.log(`Today with the sheet closed reads: ${todayCount}`);
    expect(todayCount).toMatch(/\d+ entr(y|ies) saved on this phone|1 entry saved on this phone/);
    expect(await todayBanner.evaluate((node) => node.closest('[data-notices]') !== null)).toBe(false);
    expect(await todayBanner.evaluate((node) => node.classList.contains('w'))).toBe(false);
    await settle(page);
    await page.screenshot({ path: `${CAPTURES}c5-offline-today-count-393.png`, fullPage: true });

    // And the same count inside the sheet, from the same key.
    await page.getByRole('button', { name: 'Quick log', exact: true }).click();
    await expect(page.locator('.sheet [data-state="offline"]')).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${CAPTURES}f24-offline-queued-393.png`, fullPage: true });
    await page.locator('.sheet').getByRole('button', { name: 'Close the quick log' }).click();

    await goOnline(context, page);

    const beforeReplay = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('vernier', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const rows = await new Promise<Array<{ attempts: number; nextAttemptAt: number; lastError: string }>>(
        (resolve, reject) => {
          const request = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        },
      );
      db.close();
      return rows.map((row) => ({ attempts: row.attempts, waitMs: row.nextAttemptAt - Date.now(), lastError: row.lastError }));
    });
    console.log(`the queue after the origin came back: ${JSON.stringify(beforeReplay)}`);

    // Trigger 2 of the six, the one iOS actually gives you: the app came back
    // to the front. It goes now rather than waiting out a backoff earned while
    // the origin was gone.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

    await expect
      .poll(() => scratchQuery("select count(*) from measurement where metric = 'energy' and source = 'manual'"), {
        timeout: 20_000,
      })
      .toBe('1');

    // The retry loop guarantees a second arrival. Send one on purpose, with the
    // same key, the way a lost response would.
    //
    // The session travels by hand here. The cookie is Secure, as F11 requires,
    // and Playwright's request context will not attach a Secure cookie to an
    // http origin even a loopback one, where the browser itself does. The page
    // is signed in; this is the same session, written into the header the
    // browser would have written.
    const replay = await page.request.post('/api/log', {
      headers: await signedInHeaders(context, { 'idempotency-key': queuedKey.id }),
      data: JSON.parse(queuedKey.body),
    });
    console.log(`replay answered ${replay.status()}`);

    expect(scratchQuery("select count(*) from measurement where metric = 'energy' and source = 'manual'")).toBe('1');
    expect(scratchQuery(`select count(*) from idempotency_key where key = '${queuedKey.id}'`)).toBe('1');

    const log = scratchQuery(`select outcome from write_request where key = '${queuedKey.id}' order by at`);
    console.log(`request log for ${queuedKey.id}:\n${log}`);
    expect(log.split('\n').filter((row) => row === 'applied')).toHaveLength(1);
    expect(log).toContain('replayed');
  });

  /**
   * F20. Three edits, four rows, and the original still readable.
   *
   * EVERY EDIT GOES THROUGH THE SCREEN, and that is the whole point of this
   * test rather than a nicety. It used to post `correctsId: originalId` three
   * times straight at `/api/log`, which no shipped screen does: the value sheet
   * hands `CorrectionForm` the id of the row that stands TODAY, and after the
   * first edit that row is a correction and never a root. The route resolved it
   * with `readChain()`, which keys on `root_id`, so the second edit found an
   * empty chain and answered 404, and the owner was told a row sitting in the
   * table "was never stored". The old test passed through all of it, because
   * posting the root id is the one input that cannot reproduce the bug.
   *
   * So: one visit to `/value/[id]`, three saves, and the assertion after each
   * one is that the chain grew and no error card was drawn. The database
   * refuses UPDATE outright, so the four rows are not a convention the code
   * follows, they are the only thing the table permits.
   */
  test('appends three corrections through the value screen and keeps the original readable', async ({
    page,
  }) => {
    resetScratchProvenance();
    await signIn(page);

    await page.getByRole('button', { name: 'Quick log', exact: true }).click();
    await page.getByRole('button', { name: 'Up half a centimetre' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(() => scratchQuery("select count(*) from measurement where metric = 'waist' and source = 'manual'"), {
        timeout: 20_000,
      })
      .toBe('1');

    const originalId = scratchQuery("select id from measurement where metric = 'waist' and source = 'manual'");
    const originalValue = scratchQuery(`select raw_value from measurement where id = '${originalId}'`);
    console.log(`original ${originalId} = ${originalValue}`);

    await page.goto(`/value/${originalId}`);
    for (const [index, value] of ['92.2', '98.5', '99.2'].entries()) {
      // The form is the only thing touched here. Whatever id it is carrying is
      // the id the product decided to send, which is the id under test.
      const sending = await page.locator('#correction-value').inputValue();
      await page.locator('#correction-value').fill(value);
      await page.locator('#correction-reason').fill(`Edit ${index + 1}`);
      await page.getByRole('button', { name: 'Save the correction' }).click();
      await expect
        .poll(() => scratchQuery(`select count(*) from measurement where root_id = '${originalId}'`), {
          timeout: 20_000,
        })
        .toBe(String(index + 2));
      // A 404 from the route draws screen 00's error card on this very screen.
      // Its absence is the difference between one edit and three.
      await expect(page.locator('.card.error[data-state="error"]')).toHaveCount(0);
      console.log(`edit ${index + 1} through the screen: ${sending} corrected to ${value}`);
    }

    const chain = scratchQuery(
      `select correction_index || ' | ' || raw_value || ' | ' || coalesce(correction_reason, 'original')
       from measurement where root_id = '${originalId}' order by correction_index`,
    );
    console.log(`the chain after three edits through the screen:\n${chain}`);
    expect(chain.split('\n')).toHaveLength(4);
    expect(chain).toContain(`0 | ${originalValue} | original`);
    expect(chain).toContain('1 | 92.2 | Edit 1');
    expect(chain).toContain('2 | 98.5 | Edit 2');
    expect(chain).toContain('3 | 99.2 | Edit 3');

    // Each correction names the row it corrected, and no two name the same one,
    // which is what a chain is and what a fork would not be.
    const links = scratchQuery(
      `select correction_index || ' corrects ' || coalesce(corrects_id, 'nothing')
       from measurement where root_id = '${originalId}' order by correction_index`,
    );
    console.log(`the links:\n${links}`);
    expect(new Set(links.split('\n')).size).toBe(4);

    // The original is still exactly what it was, byte for byte.
    expect(scratchQuery(`select raw_value from measurement where id = '${originalId}'`)).toBe(originalValue);

    // And all four rows are readable on the screen: three correction cards and
    // the original struck through.
    await expect(page.getByText('Correction history')).toBeVisible();
    await expect(page.getByText('Append only')).toHaveCount(3);
    await expect(page.locator('s')).toHaveCount(1);
    await settle(page);
    await page.screenshot({ path: `${CAPTURES}f20-three-edits-through-the-screen-393.png`, fullPage: true });
    await page.screenshot({ path: `${CAPTURES}f21-value-sheet-corrected-393.png`, fullPage: true });
  });

  /**
   * D3. A correction is a write, so it passes the same gate the quick log's own
   * values pass, and a refusal is drawn as screen 00's error card.
   *
   * Both halves of this were broken and the second half is the one that could
   * not be undone. `ninety-seven` reached `Number()` as NaN, the CHECK
   * constraint threw, and the route answered 500 with an empty body, which the
   * value screen rendered as the two words "HTTP 500". Meanwhile 99 and -4.7
   * were accepted for a rating out of five and written into a table that
   * refuses DELETE, where they still are.
   */
  test('refuses a correction the metric does not allow, and draws it as an error card', async ({
    page,
    context,
  }) => {
    resetScratchProvenance();
    await signIn(page);

    const ratingId = scratchQuery("select id from measurement where metric = 'energy' and seed");
    const before = scratchQuery(`select count(*) from measurement where root_id = '${ratingId}'`);
    expect(before).toBe('1');

    // On screen, through the shipped form, which is where the bare status code
    // was rendered.
    await page.goto(`/value/${ratingId}`);
    await page.locator('#correction-value').fill('ninety-seven');
    await page.getByRole('button', { name: 'Save the correction' }).click();

    const card = page.locator('[data-state="error"]');
    await expect(card).toBeVisible({ timeout: 15_000 });
    const shown = await card.textContent();
    console.log(`what the value screen says about a word where a number belongs:\n${shown}`);
    expect(shown).toContain('ninety-seven is not a number');
    expect(shown).not.toContain('HTTP 500');
    // Screen 00 state 4 draws the error card with an --alert border. Resolved
    // through a probe rather than compared against the token's own text, so
    // this reads the colour the owner actually sees.
    const alert = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--alert)';
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    });
    expect(await card.evaluate((node) => getComputedStyle(node).borderColor)).toBe(alert);
    await settle(page);
    await page.screenshot({ path: `${CAPTURES}d3-correction-refused-393.png`, fullPage: true });

    // And every out-of-range value the append-only table would have kept.
    for (const bad of ['99', '-4.7', '3.5', '0', '', 'ninety-seven']) {
      const response = await page.request.post('/api/log', {
        headers: await signedInHeaders(context),
        data: { action: 'correct', correctsId: ratingId, rawValue: bad, reason: 'a test' },
      });
      const body = (await response.json()) as { error?: string; detail?: string };
      console.log(`correcting a 1-to-5 rating to ${JSON.stringify(bad)}: ${response.status()} ${body.detail}`);
      expect(response.status()).toBe(422);
      expect(String(body.error).length, 'a refusal names a cause').toBeGreaterThan(0);
      expect(String(body.detail).length, 'a refusal names a next step').toBeGreaterThan(0);
    }

    // Nothing was written, which is the only outcome that can be relied on in a
    // table that refuses DELETE.
    expect(scratchQuery(`select count(*) from measurement where root_id = '${ratingId}'`)).toBe('1');
    expect(scratchQuery(`select raw_value from measurement where id = '${ratingId}'`)).toBe('4');

    // A correction the range does allow still goes through, so the gate is a
    // gate and not a wall.
    const good = await page.request.post('/api/log', {
      headers: await signedInHeaders(context),
      data: { action: 'correct', correctsId: ratingId, rawValue: '2', reason: 'Felt worse than I said' },
    });
    expect(good.status()).toBe(201);
    expect(scratchQuery(`select count(*) from measurement where root_id = '${ratingId}'`)).toBe('2');

    // And the reason stored on it names the whole id rather than eight
    // characters of one, which read as a mangled word.
    const reason = scratchQuery(`select dedup_reason from measurement where root_id = '${ratingId}' and correction_index = 1`);
    console.log(`the reason stored on the correction: ${reason}`);
    expect(reason).toContain(ratingId);

    // One outcome, one shape. A quick-log write whose every value is refused
    // answers exactly as a refused correction does: 422, a cause, a next step,
    // and the per-value reasons beside them. It used to answer 200 with a
    // `rejected` array and no error field at all, so the same event had two
    // contracts and the queue read the refusal as applied.
    const allRefused = await page.request.post('/api/log', {
      headers: await signedInHeaders(context),
      data: {
        timeZone: 'Europe/Paris',
        values: [
          { id: crypto.randomUUID(), metric: 'energy', rawValue: '99' },
          { id: crypto.randomUUID(), metric: 'waist', rawValue: '4' },
        ],
      },
    });
    const refusedBody = (await allRefused.json()) as {
      error?: string;
      detail?: string;
      saved?: unknown[];
      rejected?: Array<{ metric: string; detail: string }>;
    };
    console.log(`a write whose every value is refused: ${allRefused.status()} ${refusedBody.detail}`);
    expect(allRefused.status()).toBe(422);
    expect(String(refusedBody.error).length, 'a refusal names a cause').toBeGreaterThan(0);
    expect(String(refusedBody.detail).length, 'a refusal names a next step').toBeGreaterThan(0);
    expect(refusedBody.saved).toEqual([]);
    expect(refusedBody.rejected).toHaveLength(2);
    for (const entry of refusedBody.rejected ?? []) expect(entry.detail.length).toBeGreaterThan(0);
  });

  /**
   * C5. Screen 03 frame 2's Undo and Edit, and the clause that makes them
   * honest: "undoable for as long as it sits in the queue".
   *
   * While the write is in the outbox it is genuinely reversible, so Undo drops
   * it and nothing is ever stored. Once it has uploaded, `measurement` refuses
   * DELETE and the only reversal left is a correction, so the button changes
   * its word. The surface says which one it is doing.
   */
  test('undoes a queued write, and offers a correction rather than a deletion once it has uploaded', async ({
    page,
    context,
  }) => {
    resetScratchProvenance();
    await signIn(page);

    // Queued, and therefore genuinely reversible.
    await page.getByRole('button', { name: 'Quick log', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Fatigue, 2 of 5' })).toBeEnabled();
    await goOffline(context, page);
    await page.getByRole('button', { name: 'Fatigue, 2 of 5' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    const card = page.locator('[data-just-logged]');
    await expect(card).toHaveAttribute('data-just-logged', 'queued');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(page.getByText('What happens next')).toBeVisible();
    console.log(`the just-logged card while queued:\n${await card.textContent()}`);
    await settle(page);
    await page.screenshot({ path: `${CAPTURES}c5-just-logged-queued-393.png`, fullPage: true });

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(card).toHaveAttribute('data-just-logged', 'undone');
    await expect(card.locator('.chip')).toHaveText('Removed');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeHidden();

    const left = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('vernier', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const rows = await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return rows.length;
    });
    console.log(`entries left in the outbox after Undo: ${left}`);
    expect(left).toBe(0);
    await settle(page);
    await page.screenshot({ path: `${CAPTURES}c5-just-logged-undone-393.png`, fullPage: true });

    await goOnline(context, page);
    // Nothing ever reached the Mac mini, which is what makes it an undo.
    expect(scratchQuery("select count(*) from measurement where metric = 'fatigue' and source = 'manual'")).toBe('0');

    // Applied, and therefore not reversible by deletion. The card says so and
    // offers the correction instead.
    await page.goto('/');
    await page.getByRole('button', { name: 'Quick log', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Hunger, 3 of 5' })).toBeEnabled();
    await page.getByRole('button', { name: 'Hunger, 3 of 5' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(card).toHaveAttribute('data-just-logged', 'applied', { timeout: 20_000 });
    console.log(`the just-logged card once it has uploaded:\n${await card.textContent()}`);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeHidden();
    await expect(page.getByRole('link', { name: 'Correct it' })).toBeVisible();
    // The chip carries the state, in one word, on the row. The paragraph that
    // used to repeat it under the pair is gone: every line above the weight
    // trend is spent out of F27's 715 px, and "Stored" beside "Correct it"
    // already says what the sentence said.
    await expect(card.locator('.chip')).toHaveText('Stored');
    await settle(page);
    await page.screenshot({ path: `${CAPTURES}c5-just-logged-applied-393.png`, fullPage: true });

    // No two cards on Today wear the same label. Today used to draw the write
    // that was just made and the values that stand today side by side, both
    // headed JUST LOGGED, from one key used for two different meanings. A6
    // settled it the other way: the write is a ROW in the day card, under that
    // card's own label, and "On file" is the only card of the two left.
    const labels = await page.locator('main .card > .lbl').allTextContents();
    console.log(`the card labels on Today: ${JSON.stringify(labels)}`);
    expect(new Set(labels).size, 'no two cards on Today wear the same label').toBe(labels.length);
    expect(labels).not.toContain('Just logged');
    expect(labels).toContain('On file');
    // And the write is inside the day card, which is where screen 02 frame 3
    // draws it, rather than in a card of its own below it.
    expect(
      await card.evaluate((node) => node.closest('.card.day') !== null),
      'the just-logged entry is not a row in the day card',
    ).toBe(true);

    // The action really does reach the value's own sheet, where a correction
    // appends beside the original.
    await page.getByRole('link', { name: 'Correct it' }).click();
    await expect(page.getByText('Correct this value')).toBeVisible();
  });

  /**
   * F21 and F22. One tap to the value sheet, a second to the source, and all
   * six sources land on the same screen shape.
   */
  test('walks from a value to its source in two taps, for all six sources', async ({ page }) => {
    await signIn(page);

    // Tap 1, from Today.
    await page.goto('/');
    const firstValue = page.locator('a.value-link').first();
    await expect(firstValue).toBeVisible();
    await firstValue.click();

    await expect(page.getByText('Stored value')).toBeVisible();
    await expect(page.getByText('Deduplication')).toBeVisible();
    await expect(page.getByText('Confidence')).toBeVisible();
    await expect(page.getByText('Measured', { exact: true })).toBeVisible();
    await expect(page.getByText('Imported', { exact: true })).toBeVisible();

    // Tap 2.
    await page.getByRole('link', { name: 'Open the source' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Rows from this record')).toBeVisible();

    // And now every source, one capture each, all through the same file.
    const records = scratchQuery('select id, source, kind from source_record order by source').split('\n');
    console.log(records.join('\n'));
    const seen = new Set<string>();
    for (const line of records) {
      const [id, source, kind] = line.split('|');
      if (seen.has(source)) continue;
      seen.add(source);
      await page.goto(`/source/${id}`);
      await expect(page.getByText('Reference')).toBeVisible();
      await expect(page.getByText('Rows from this record')).toBeVisible();
      await expect(page.getByText('Import version')).toBeVisible();
      await settle(page);
      await page.screenshot({ path: `${CAPTURES}f22-source-${source}.png`, fullPage: true });
      console.log(`source ${source} (${kind}) rendered by src/app/(shell)/source/[id]/page.tsx`);
    }
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });

  /**
   * F26. A write that disagrees with a stored correction raises a question and
   * writes nothing. The stored value is byte identical before and after.
   */
  test('raises a question rather than overwriting a correction', async ({ page, context }) => {
    resetScratchProvenance();
    await signIn(page);

    await page.getByRole('button', { name: 'Quick log', exact: true }).click();
    await page.getByRole('button', { name: 'Up half a centimetre' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(() => scratchQuery("select count(*) from measurement where metric = 'waist' and source = 'manual'"), {
        timeout: 20_000,
      })
      .toBe('1');

    const originalId = scratchQuery("select id from measurement where metric = 'waist' and source = 'manual'");

    await page.request.post('/api/log', {
      headers: await signedInHeaders(context),
      data: { action: 'correct', correctsId: originalId, rawValue: '99.2', reason: 'Typed a 2 for a 9.' },
    });

    const before = scratchQuery(
      "select id || '|' || raw_value || '|' || source || '|' || correction_index from measurement order by id",
    );
    const beforeCount = scratchQuery('select count(*) from measurement');
    console.log(`before the disagreeing write:\n${before}`);

    const conflicting = await page.request.post('/api/log', {
      headers: await signedInHeaders(context),
      data: {
        measuredAt: new Date().toISOString(),
        timeZone: 'Europe/Paris',
        values: [{ id: crypto.randomUUID(), metric: 'waist', rawValue: '92.2' }],
      },
    });
    const body = await conflicting.json();
    console.log(`the disagreeing write answered ${conflicting.status()}: ${JSON.stringify(body.questions)}`);
    expect(body.questions).toHaveLength(1);
    expect(body.saved).toHaveLength(0);

    const after = scratchQuery(
      "select id || '|' || raw_value || '|' || source || '|' || correction_index from measurement order by id",
    );
    console.log(`after:\n${after}`);
    expect(after).toBe(before);
    expect(scratchQuery('select count(*) from measurement')).toBe(beforeCount);

    const question = scratchQuery(
      "select stored_raw_value || ' vs ' || incoming_raw_value || ' | ' || state from import_question",
    );
    console.log(`the question that was raised instead: ${question}`);
    expect(question).toBe('99.2 vs 92.2 | open');

    await page.goto(`/value/${originalId}`);
    await expect(page.getByText('An import disagrees with your correction')).toBeVisible();
    await expect(page.getByText('What you corrected it to')).toBeVisible();
    await expect(page.getByText('What the import sent')).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${CAPTURES}f26-question-393.png`, fullPage: true });
  });
});

/**
 * WHAT SCREEN 03 AND SCREEN 00 FIX, AS NUMBERS, SO THE CHECKS BELOW CAN ASK.
 *
 * Every one of these is read off an approved artifact and not off the build:
 *
 *   `03-quick-log.html` line 64  .sheetfoot{padding:12px 0 28px}, and no margin
 *                                on the button inside it
 *   `03-quick-log.html` line 68  .scale5 button{height:52px}
 *   `00-patterns.html`  line 159 an error card's action row at margin-top:12px
 *   `00-patterns.html`  line 32  .card{padding:16px}
 *   DESIGN.md section 2b         44 px is the floor no control goes under
 *
 * The sheet escalates its own buttons to 52, which is why 44 is the wrong
 * question to ask about one: a control that lost the escalation and came back
 * at exactly 44 answers "yes" and is still not screen 03.
 */
const SHEET_BUTTON = 52;
const TOUCH_FLOOR = 44;
const FOOT_PADDING_TOP = '12px';
const SAVE_BELOW_THE_DIVIDER = 12;
const ACTIONS_MARGIN_TOP = '12px';
const CARD_PADDING = '16px';

/** One target on the sheet, with the floor the sheet itself sets for it. */
type SheetTarget = {
  label: string;
  height: number;
  width: number;
  minHeight: string;
  fontSize: string;
  floor: number;
  classes: string;
};

/** Everything C5 names about the sheet, in one read, for one state. */
type SheetGeometry = {
  width: number;
  x: number;
  targets: SheetTarget[];
  actions: Array<{ where: string; marginTop: string; gapAboveIt: number | null }>;
  cardPadding: string[];
  saveMarginTop: string;
  saveBelowTheDivider: number;
  footPaddingTop: string;
  ancestry: string;
  insideAScreenCard: boolean;
};

/**
 * The sheet measured the way C5's line reads, rather than the way it is easy to
 * measure.
 *
 * WHAT THIS REPLACES AND WHY. Two checks graded this line and both passed by not
 * looking. One walked the targets on the LOADED sheet only, so the error state's
 * Try again had never been measured once; it asserted `>= 44`, so the button
 * that lost the sheet's own 52 px escalation answered yes. The other compared
 * the sheet's outer width and x between states, which no card rule inside the
 * sheet can move, so `.actions` margin-top and the margin on Save were outside
 * what it looked at. Three properties were wrong in Chrome and in WebKit at all
 * three viewports while both were green.
 *
 * So the read is one function, it takes everything the line names, and every
 * state is put through it.
 */
async function readTheSheet(page: Page): Promise<SheetGeometry> {
  return page.evaluate(
    ({ sheetButton, touchFloor }) => {
      const round = (value: number) => Math.round(value * 10) / 10;
      const sheet = document.querySelector<HTMLElement>('.sheet')!;
      const box = sheet.getBoundingClientRect();
      const foot = sheet.querySelector<HTMLElement>('.sheetfoot')!;
      const footStyle = getComputedStyle(foot);
      const save = foot.querySelector<HTMLElement>('.btn.primary')!;

      const targets = [...sheet.querySelectorAll<HTMLElement>('button, input, textarea, a')].map(
        (node) => {
          const style = getComputedStyle(node);
          const shape = node.getBoundingClientRect();
          // A field carries no text of its own, so it is named by the label
          // that points at it. Without this the waist field would be measured
          // and then reported as an empty string.
          const labelled = node.id
            ? document.querySelector(`label[for="${node.id}"]`)?.textContent?.trim()
            : undefined;
          const named =
            node.getAttribute('aria-label') ?? labelled ?? node.textContent?.trim().slice(0, 24);
          return {
            label: named && named !== '' ? named : node.tagName.toLowerCase(),
            height: Math.round(shape.height),
            width: Math.round(shape.width),
            minHeight: style.minHeight,
            fontSize: style.fontSize,
            // The floor this control is held to is the one the sheet sets for
            // it: 52 for a button on screen 03, 44 for the icon button and for
            // anything the sheet does not escalate.
            floor: node.matches('.btn:not(.icon)') ? sheetButton : touchFloor,
            classes: node.className,
          };
        },
      );

      const actions = [...sheet.querySelectorAll<HTMLElement>('.actions')].map((node) => {
        const previous = node.previousElementSibling;
        return {
          where: node.closest('[data-state]')?.getAttribute('data-state') ?? 'sheet',
          marginTop: getComputedStyle(node).marginTop,
          gapAboveIt: previous
            ? round(node.getBoundingClientRect().top - previous.getBoundingClientRect().bottom)
            : null,
        };
      });

      // The ancestry, because the cause of all three defects was ancestry: a
      // sheet inside `section.card.day` inherits Today's card rules.
      const ancestry: string[] = [];
      for (let hop = sheet.parentElement; hop; hop = hop.parentElement) {
        ancestry.push(
          `${hop.tagName.toLowerCase()}${hop.className ? `.${String(hop.className).trim().split(/\s+/).join('.')}` : ''}`,
        );
      }

      return {
        width: round(box.width),
        x: round(box.x),
        targets,
        actions,
        cardPadding: [...sheet.querySelectorAll<HTMLElement>('.card')].map(
          (card) => getComputedStyle(card).padding,
        ),
        saveMarginTop: getComputedStyle(save).marginTop,
        saveBelowTheDivider: round(
          save.getBoundingClientRect().top -
            (foot.getBoundingClientRect().top + parseFloat(footStyle.borderTopWidth)),
        ),
        footPaddingTop: footStyle.paddingTop,
        ancestry: ancestry.join(' < '),
        insideAScreenCard: Boolean(sheet.closest('.card')),
      };
    },
    { sheetButton: SHEET_BUTTON, touchFloor: TOUCH_FLOOR },
  );
}

/**
 * Every target on the sheet, in one state, against the floor the sheet sets.
 *
 * GOES RED IF: any control on the sheet is under 44 px, or any `.btn` that is
 * not the icon button is under the 52 px screen 03 escalates it to, or has lost
 * `min-height:52px` to a rule that outranks `.sheet .btn`. That last clause is
 * the one that was missing: Try again shipped at exactly 44 with
 * `min-height:44px`, which is a pass under `>= 44` and is not screen 03.
 */
function walkTheTargets(state: string, sheet: SheetGeometry): void {
  console.log(`--- targets, ${state}, ${sheet.targets.length} of them ---`);
  for (const target of sheet.targets) {
    console.log(
      `  ${String(target.height).padStart(3)} px  min-height ${target.minHeight.padEnd(6)} ` +
        `floor ${target.floor}  ${target.fontSize}  ${target.label}`,
    );
    expect(
      target.height,
      `${state}: ${target.label} is ${target.height} px, under the ${target.floor} px floor this sheet sets for it`,
    ).toBeGreaterThanOrEqual(target.floor);
    if (target.floor === SHEET_BUTTON) {
      expect(
        target.minHeight,
        `${state}: ${target.label} lost the sheet's 52 px escalation to a rule that outranks .sheet .btn`,
      ).toBe(`${SHEET_BUTTON}px`);
    }
  }
}

/**
 * C5. The quick log against screen 03 at three viewports, and the five states
 * against the geometry screen 00 defines once.
 *
 * Every state below is reached the way it is reached in life. Loading is the
 * snapshot held in flight, error is the origin taken away, empty is a database
 * with no waist reading in it, stale is a reading three days old, offline is a
 * queue with something in it. Nothing is a preview parameter and nothing is a
 * fixture painted into a component.
 */
test.describe('the quick log against screen 03', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async () => {
    await bringUpTheScratchInstance();
  });

  const VIEWPORTS: Array<[string, number, number]> = [
    ['393', 393, 852],
    ['768', 768, 1024],
    ['1280', 1280, 900],
  ];

  test('matches screen 03 at three viewports, every target at the floor this sheet sets', async ({
    page,
  }) => {
    resetScratchProvenance();
    await signIn(page);

    for (const [name, width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.getByRole('button', { name: 'Quick log', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Quick log' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Energy, 4 of 5' })).toBeVisible();
      await settle(page);
      await page.screenshot({ path: `${CAPTURES}c5-quick-log-${name}.png` });

      // Every target inside the sheet, measured rather than asserted.
      //
      // `input` is in that list now, and its absence is how the waist field
      // shipped at 133x40 under a line that says 44: the walk read buttons,
      // textareas and links, the one field on the sheet was in none of those,
      // and three viewports of green said the targets were fine.
      const sheet = await readTheSheet(page);
      walkTheTargets(`loaded at ${name}`, sheet);

      // AND THE SHEET IS NOT INSIDE THE SCREEN THAT RAISED IT. `QuickLog` is
      // mounted in `section.card.day` because the day card's rows are its
      // children, and the sheet used to render there too, so `.card.day .actions`,
      // `.card.day .actions .btn` and `.card.day .btn.primary` all reached
      // inside screen 03. The sheet is portalled to `document.body` now.
      //
      // GOES RED IF: the portal is removed, or the sheet is ever mounted inside
      // a card again, which is the only way a screen-scoped rule can reach it.
      console.log(`  the sheet at ${name} hangs off ${sheet.ancestry}`);
      expect(
        sheet.insideAScreenCard,
        `at ${name} the sheet is inside a card (${sheet.ancestry}), so that card's rules reach into screen 03`,
      ).toBe(false);
      expect(sheet.ancestry).toBe('body < html');

      // Screen 03 escalates the committed action to 52 px, over the 48 px base
      // that DESIGN.md section 2b fixes for the shell.
      const save = sheet.targets.find((target) => target.label === 'Save')!;
      expect(save.height).toBe(SHEET_BUTTON);
      expect(save.fontSize).toBe('16px');

      // And it sits where `03-quick-log.html` line 64 draws it: 12 px of foot
      // padding under the divider and no margin of its own. It shipped with
      // `margin-top:14px` inherited from the day card, 27 px below the divider
      // on a sheet that never wrote a margin.
      console.log(
        `  Save at ${name}: margin-top ${sheet.saveMarginTop}, ` +
          `${sheet.saveBelowTheDivider} px below the foot divider, foot padding-top ${sheet.footPaddingTop}`,
      );
      expect(sheet.saveMarginTop, 'the sheet foot never writes a margin on Save').toBe('0px');
      expect(sheet.footPaddingTop).toBe(FOOT_PADDING_TOP);
      expect(sheet.saveBelowTheDivider).toBe(SAVE_BELOW_THE_DIVIDER);

      await page.setViewportSize({ width: 393, height: 852 });
    }
  });

  test('draws loading, empty, error, offline and stale on screen 00 geometry', async ({ page, context }) => {
    resetScratchProvenance();
    await signIn(page);

    /**
     * Every state's full geometry, kept and compared at the end.
     *
     * This used to be four bounding boxes, and only the sheet's own width and x
     * were compared between them. Nothing a card rule inside the sheet does can
     * move either of those, so the check was blind to every property that was
     * actually wrong: the error card's action row at 8 px where screen 00 draws
     * 12, its Try again at 44 px where the sheet escalates to 52, and Save at
     * 27 px below a divider the sheet draws 12 under. All three were wrong at
     * all three viewports in both engines while this test was green.
     */
    const measured: Array<{ state: string; sheet: SheetGeometry }> = [];

    // Stale first, because that is the state the seed leaves the instance in:
    // the waist reading it writes is three days old, so the sheet says so with a
    // --warn source chip naming the age, exactly as screen 00 state 6.
    //
    // AND LOADED IS NOT THE SAME SCREEN. It used to be captured here, one line
    // above this assertion, off the same open sheet: two files, byte identical,
    // and a comparison between them proved nothing at all. So the reading is
    // made fresh below, through the sheet, and the loaded capture is taken after
    // the product has stopped calling it stale.
    await page.goto('/');
    await page.getByRole('button', { name: 'Quick log', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Energy, 4 of 5' })).toBeVisible();
    await expect(page.locator('[data-state="stale"]')).toBeVisible();
    const staleChip = await page.locator('[data-state="stale"] .src').textContent();
    console.log(`stale chip reads: ${staleChip}`);
    expect(staleChip).toMatch(/\d+ days old$/);
    await settle(page);
    measured.push({ state: 'stale', sheet: await readTheSheet(page) });
    await page.screenshot({ path: `${CAPTURES}c5-state-stale.png` });

    // Loaded: a waist reading taken today, logged through the sheet that is
    // already open, so the next open finds a reading with no age on it.
    await page.getByRole('button', { name: 'Up half a centimetre', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('[data-just-logged]')).toBeVisible();
    await page.getByRole('button', { name: 'Quick log', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Energy, 4 of 5' })).toBeVisible();
    await expect(page.locator('[data-state="stale"]')).toHaveCount(0);
    // No age chip at all, which is the difference between this capture and the
    // one above: the sheet only names an age when there is one worth naming.
    console.log(
      `loaded sheet reads: ${await page.locator('#quick-log-waist').inputValue()} cm, ` +
        `${await page.locator('.sheet .src').count()} age chip(s)`,
    );
    await settle(page);
    measured.push({ state: 'loaded', sheet: await readTheSheet(page) });
    await page.screenshot({ path: `${CAPTURES}c5-state-loaded.png` });
    await page.locator('.sheet').getByRole('button', { name: 'Close the quick log' }).click();

    // Loading: the snapshot held in flight, which is the state a slow tailnet
    // really produces. Skeleton blocks at the final size, no spinner, no curve.
    await page.route('**/api/log', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      // The hold can outlive the unroute below, and a route handled after its
      // handler is gone throws. Letting it go is correct: the state it was
      // holding open has already been captured.
      await route.continue().catch(() => undefined);
    });
    await page.getByRole('button', { name: 'Quick log', exact: true }).click();
    await expect(page.locator('[data-state="loading"]')).toBeVisible();
    await settle(page);
    measured.push({ state: 'loading', sheet: await readTheSheet(page) });
    await page.screenshot({ path: `${CAPTURES}c5-state-loading.png` });
    console.log(`loading skeletons: ${await page.locator('[data-state="loading"] .skel').count()}`);
    expect(await page.locator('[data-state="loading"] .skel').count()).toBeGreaterThan(0);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await expect(page.locator('[data-state="loading"]')).toBeHidden({ timeout: 15_000 });
    await page.locator('.sheet').getByRole('button', { name: 'Close the quick log' }).click();

    // Error: the origin taken away while the sheet opens. The card names the
    // failure in words and says what still works, which here is the save itself.
    await goOffline(context, page);
    await page.getByRole('button', { name: 'Quick log', exact: true }).click();
    await expect(page.locator('[data-state="error"]')).toBeVisible({ timeout: 20_000 });
    const errorText = await page.locator('[data-state="error"]').textContent();
    console.log(`error card reads: ${errorText}`);
    expect(errorText).toContain('The sheet still saves');
    await settle(page);
    measured.push({ state: 'error', sheet: await readTheSheet(page) });
    await page.screenshot({ path: `${CAPTURES}c5-state-error.png` });

    // Offline: a write commits with the origin still gone, and the banner
    // carries the queue count.
    await page.getByRole('button', { name: 'Hunger, 3 of 5' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Quick log', exact: true }).click();
    await expect(page.locator('.sheet [data-state="offline"]')).toBeVisible();
    const offlineText = await page.locator('.sheet [data-state="offline"]').textContent();
    console.log(`offline banner reads: ${offlineText}`);
    expect(offlineText).toMatch(/entr(y|ies) (is|are) waiting to upload/);
    await settle(page);
    measured.push({ state: 'offline', sheet: await readTheSheet(page) });
    await page.screenshot({ path: `${CAPTURES}c5-state-offline.png` });

    await goOnline(context, page);

    // Empty: a database holding no waist reading at all. Truncated without the
    // re-seed, so the absence is real rather than routed around.
    scratchQuery('truncate measurement, source_record, import_question, idempotency_key, write_request');
    await page.goto('/');
    await page.getByRole('button', { name: 'Quick log', exact: true }).click();
    await expect(page.locator('[data-state="empty"]')).toBeVisible({ timeout: 20_000 });
    const emptyText = await page.locator('[data-state="empty"]').textContent();
    console.log(`empty card reads: ${emptyText}`);
    expect(emptyText).toContain('No waist measurement yet');
    await settle(page);
    measured.push({ state: 'empty', sheet: await readTheSheet(page) });
    await page.screenshot({ path: `${CAPTURES}c5-state-empty.png` });
    // The value is `--` and it is a placeholder, not a number: screen 03 frame 3
    // draws it muted and the footer says blank fields stay blank. A field
    // holding "" sends nothing; a field holding 0 would store a zero.
    await expect(page.locator('#quick-log-waist')).toHaveValue('');
    await expect(page.locator('#quick-log-waist')).toHaveAttribute('placeholder', '--');

    // ---- and now the five states, against the geometry, all in one place ----

    // Every target in every state, at the floor the sheet sets for it.
    //
    // The error state's Try again had never been measured by anything: the
    // target walk ran on the loaded sheet only. It shipped at 44 px, which is
    // the shell's floor and not this sheet's 52.
    //
    // GOES RED IF: any control in any state is under its own floor, or a `.btn`
    // on the sheet loses `min-height:52px` to a rule that outranks `.sheet .btn`.
    for (const { state, sheet } of measured) {
      walkTheTargets(state, sheet);
    }

    const loaded = measured.find((entry) => entry.state === 'loaded')!.sheet;

    // Geometry does not move between states, which is the whole of screen 00's
    // rule: a state change never reflows the page. Compared property by property
    // rather than by the sheet's outer box, because the outer box is the one
    // thing a card rule inside the sheet cannot move.
    //
    // GOES RED IF: any state draws its card padding, its foot, its Save or its
    // action row differently from the loaded sheet, or differently from what
    // screen 03 and screen 00 fix.
    for (const { state, sheet } of measured) {
      console.log(
        `${state.padEnd(8)} sheet ${sheet.width}/${sheet.x}  cards ${sheet.cardPadding.join(',') || 'none'}  ` +
          `foot padding-top ${sheet.footPaddingTop}  Save margin-top ${sheet.saveMarginTop} at ` +
          `${sheet.saveBelowTheDivider} px below the divider  ` +
          `actions ${sheet.actions.map((row) => `${row.where} ${row.marginTop}/${row.gapAboveIt}`).join(', ') || 'none'}`,
      );

      expect(sheet.width, `${state} draws the sheet at a different width`).toBe(loaded.width);
      expect(sheet.x, `${state} draws the sheet at a different left edge`).toBe(loaded.x);
      expect(sheet.footPaddingTop, `${state} draws the foot differently`).toBe(FOOT_PADDING_TOP);
      expect(sheet.saveMarginTop, `${state} writes a margin on Save the sheet never wrote`).toBe('0px');
      expect(sheet.saveBelowTheDivider, `${state} moves Save away from the foot divider`).toBe(
        SAVE_BELOW_THE_DIVIDER,
      );

      // Screen 00 state 2 to 6: every state card is a card, at card padding.
      for (const padding of sheet.cardPadding) {
        expect(padding, `${state} draws a card at ${padding}`).toBe(CARD_PADDING);
      }

      // `00-patterns.html` line 159 draws the error card's action row 12 px
      // under the sentence above it. It shipped at 8, from `.card.day .actions`.
      for (const row of sheet.actions) {
        expect(row.marginTop, `${state}: the ${row.where} action row sits at ${row.marginTop}`).toBe(
          ACTIONS_MARGIN_TOP,
        );
        expect(row.gapAboveIt, `${state}: the ${row.where} action row is drawn at the wrong gap`).toBe(
          Number(ACTIONS_MARGIN_TOP.replace('px', '')),
        );
      }

      // And no state's sheet is inside the screen that raised it, which is the
      // one condition under which any of the above can silently change again.
      expect(sheet.insideAScreenCard, `${state}: the sheet hangs off ${sheet.ancestry}`).toBe(false);
    }

    // The error state is the one that carries an action row, so the comparison
    // above says nothing unless it was really reached.
    expect(
      measured.find((entry) => entry.state === 'error')!.sheet.actions,
      'the error state drew no action row, so its geometry was never compared',
    ).toHaveLength(1);

    resetScratchProvenance();
  });
});

/**
 * F24. The capture path never blocks, and never lies about what it did.
 *
 * The second half of that is what failed. The sheet's waist control is a
 * stepper: it moves the LAST measurement by half a centimetre, so with no last
 * measurement it has nothing to move. With the origin unreachable the snapshot
 * read fails, and one tap on the plus control put 0.5 cm in it and queued it.
 * The just-logged card then read "Waist 0.5 cm, Queued" beside "Still on this
 * phone" for a value the band in src/lib/provenance.ts refuses at 30 cm, so the
 * flush was certain to reject it and nothing would ever be stored. The data was
 * safe and the message was not.
 *
 * Both halves are closed here. The stepper refuses to start from nothing and
 * says why, and the queue asks the same rule the route asks before it accepts
 * anything at all.
 */
test.describe('the quick log tells the truth about what it queued', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async () => {
    await bringUpTheScratchInstance();
  });

  test('refuses to step a waist it has no reading to step from, and says why', async ({
    page,
    context,
  }) => {
    resetScratchProvenance();
    await signIn(page);

    // The origin taken away, which is the state the defect was found in: the
    // snapshot read fails and there is no last measurement to count from.
    await goOffline(context, page);
    await page.getByRole('button', { name: 'Quick log', exact: true }).click();
    await expect(page.locator('[data-state="error"]')).toBeVisible({ timeout: 20_000 });

    const up = page.getByRole('button', { name: 'Up half a centimetre' });
    const down = page.getByRole('button', { name: 'Down half a centimetre' });
    console.log(`with no snapshot: up enabled ${await up.isEnabled()}, down enabled ${await down.isEnabled()}`);
    await expect(up).toBeDisabled();
    await expect(down).toBeDisabled();

    const why = (await page.locator('[data-waist="no-base"]').textContent())!.trim();
    console.log(`and it says: ${why}`);
    expect(why).toContain('there is nothing to step from');
    await expect(page.locator('#quick-log-waist')).toHaveValue('');

    // A tap on the plus lands on nothing, so the reading is still absent.
    await up.click({ force: true });
    await expect(page.locator('#quick-log-waist')).toHaveValue('');

    // The viewport rather than the page: the sheet is fixed over it, and a
    // full-page stitch draws it once at the top with its own scroll offset
    // still applied, which cuts the card off the picture.
    await page.locator('.sheetbody').evaluate((node) => node.scrollTo(0, 0));
    await settle(page);
    await page.screenshot({ path: `${CAPTURES}f24-no-base-to-step-from-393.png` });

    // AND THE CAPTURE PATH IS NOT BLOCKED. Everything else on the sheet still
    // saves with the origin gone, which is the whole point of the queue.
    await page.getByRole('button', { name: 'Energy, 4 of 5' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const queued = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('vernier', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const rows = await new Promise<Array<{ body: string }>>((resolve, reject) => {
        const request = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return rows.map((row) => row.body);
    });
    console.log(`the queue holds ${queued.length} entry(s): ${queued.join(' | ')}`);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toContain('energy');
    // And no waist of any size went with it.
    expect(queued[0]).not.toContain('waist');

    await goOnline(context, page);
  });

  test('refuses a value the flush would refuse, at the moment it is typed', async ({ page }) => {
    resetScratchProvenance();
    await signIn(page);

    // A database with no waist reading in it at all, truncated without the
    // re-seed so the absence is real, and a number typed into the field that the
    // band refuses at 30 cm.
    //
    // The stepper used to produce this on its own: with nothing to step from it
    // counted up from zero, so one tap queued 0.5 cm and the screen reported it
    // as saved. It cannot any more, which is defect 60 closed at the other end,
    // so the value is typed. The refusal being graded is the same one: an entry
    // the flush is certain to reject must never be accepted here and called safe.
    scratchQuery('truncate measurement, source_record, import_question, idempotency_key, write_request');
    await page.goto('/');
    await page.getByRole('button', { name: 'Quick log', exact: true }).click();
    await expect(page.locator('[data-state="empty"]')).toBeVisible({ timeout: 20_000 });
    // TYPED, KEY BY KEY, IN A TEST NAMED FOR THE MOMENT IT IS TYPED.
    //
    // This line was `fill('0.5')` followed by `toHaveValue('0.5')`, which sets
    // the whole value in one input event and never moves a caret. It stayed
    // green for four rounds over a field that could not be typed into at all,
    // in a test whose own title says "at the moment it is typed". The refusal
    // below is only worth anything if the value reached the field the way the
    // owner puts one there.
    //
    // GOES RED IF: any keystroke comes back reformatted, so what the field
    // holds after the nth key is not the first n characters of 0.5.
    const field = page.locator('#quick-log-waist');
    await field.click();
    const typed = await typeKeyByKey(field, ['0', '.', '5']);
    for (const step of typed) {
      console.log(`typing a refusable waist: "${step.key}" -> "${step.value}" caret ${step.caret}`);
    }
    expect(
      typed.map((step) => step.value),
      'typing 0.5 into an empty field did not produce 0.5',
    ).toEqual(typedSoFar('0.5'));
    await expect(field).toHaveValue('0.5');

    await page.getByRole('button', { name: 'Save', exact: true }).click();

    // The sheet stays open on what was typed and the card names the reason the
    // server would have given, from the same key.
    const refused = page.locator('[data-state="refused"]');
    await expect(refused).toBeVisible();
    const said = (await refused.textContent())!.replace(/\s+/g, ' ').trim();
    console.log(`the refusal reads: ${said}`);
    expect(said).toContain('Waist is stored between 30 and 250 cm');
    expect(said).toContain('Nothing was put on this phone and nothing was sent');

    // Nothing was queued, nothing was claimed as just logged, and nothing
    // reached the database.
    const depth = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('vernier', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const rows = await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return rows.length;
    });
    console.log(`entries in the queue after the refusal: ${depth}`);
    expect(depth).toBe(0);
    expect(await page.locator('[data-just-logged]').count()).toBe(0);
    expect(scratchQuery("select count(*) from measurement where metric = 'waist'")).toBe('0');

    // The viewport rather than the page: the sheet is fixed over it, and a
    // full-page stitch draws it once at the top with its own scroll offset
    // still applied, which cuts the card off the picture.
    await page.locator('.sheetbody').evaluate((node) => node.scrollTo(0, 0));
    await settle(page);
    await page.screenshot({ path: `${CAPTURES}f24-queue-refuses-a-refusable-value-393.png` });

    resetScratchProvenance();
  });
});
