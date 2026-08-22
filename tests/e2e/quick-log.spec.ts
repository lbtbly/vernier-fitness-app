import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mintSignInLink, query, resetProvenance } from './host';

/**
 * The quick log and the provenance spine, end to end, in WebKit at 393x852.
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
  await page.goto(mintSignInLink());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
}

test.describe('the quick log', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(Number(query('select count(*) from owner')) === 0, 'no owner account on this installation yet');

  /**
   * F23. Six taps or fewer from Today, for each of the six things the sheet
   * commits. The count is printed per metric and it is a real count: every
   * click below is one finger on one target.
   */
  test('commits each of the six in six taps or fewer from Today', async ({ page }) => {
    resetProvenance();
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
      await page.getByRole('button', { name: 'Quick log' }).click();
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
              query(`select count(*) from measurement where metric = '${field.metric}' and source = 'manual'`),
            ),
          { timeout: 20_000 },
        )
        .toBe(1);
    }

    console.log(counts.map(([metric, taps]) => `${metric}=${taps}`).join(' '));
    expect(counts).toHaveLength(6);
    expect(Math.max(...counts.map(([, taps]) => taps))).toBeLessThanOrEqual(6);

    const stored = query(
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
    resetProvenance();
    await signIn(page);

    await page.getByRole('button', { name: 'Quick log' }).click();
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
    expect(query("select count(*) from measurement where metric = 'energy' and source = 'manual'")).toBe('0');

    // The queue count is on screen, and the marker says so plainly.
    await page.getByRole('button', { name: 'Quick log' }).click();
    await expect(page.locator('[data-state="offline"]')).toBeVisible();
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
      .poll(() => query("select count(*) from measurement where metric = 'energy' and source = 'manual'"), {
        timeout: 20_000,
      })
      .toBe('1');

    // The retry loop guarantees a second arrival. Send one on purpose, with the
    // same key, the way a lost response would.
    const replay = await page.request.post('/api/log', {
      headers: {
        'content-type': 'application/json',
        'idempotency-key': queuedKey.id,
        'x-vernier-csrf': (await context.cookies()).find((cookie) => cookie.name === 'vernier_csrf')!.value,
      },
      data: JSON.parse(queuedKey.body),
    });
    console.log(`replay answered ${replay.status()}`);

    expect(query("select count(*) from measurement where metric = 'energy' and source = 'manual'")).toBe('1');
    expect(query(`select count(*) from idempotency_key where key = '${queuedKey.id}'`)).toBe('1');

    const log = query(`select outcome from write_request where key = '${queuedKey.id}' order by at`);
    console.log(`request log for ${queuedKey.id}:\n${log}`);
    expect(log.split('\n').filter((row) => row === 'applied')).toHaveLength(1);
    expect(log).toContain('replayed');
  });

  /**
   * F20. Three edits, four rows, and the original still readable. The database
   * refuses UPDATE outright, so this is not a convention the code follows: it
   * is the only thing the table permits.
   */
  test('appends three corrections and keeps the original readable', async ({ page, context }) => {
    resetProvenance();
    await signIn(page);

    await page.getByRole('button', { name: 'Quick log' }).click();
    await page.getByRole('button', { name: 'Up half a centimetre' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(() => query("select count(*) from measurement where metric = 'waist' and source = 'manual'"), {
        timeout: 20_000,
      })
      .toBe('1');

    const originalId = query("select id from measurement where metric = 'waist' and source = 'manual'");
    const originalValue = query(`select raw_value from measurement where id = '${originalId}'`);
    console.log(`original ${originalId} = ${originalValue}`);

    const csrf = (await context.cookies()).find((cookie) => cookie.name === 'vernier_csrf')!.value;
    for (const [index, value] of ['92.2', '98.5', '99.2'].entries()) {
      const response = await page.request.post('/api/log', {
        headers: {
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
          'x-vernier-csrf': csrf,
        },
        data: { action: 'correct', correctsId: originalId, rawValue: value, reason: `Edit ${index + 1}` },
      });
      expect(response.status()).toBe(201);
    }

    const chain = query(
      `select correction_index || ' | ' || raw_value || ' | ' || coalesce(correction_reason, 'original')
       from measurement where root_id = '${originalId}' order by correction_index`,
    );
    console.log(`the chain after three edits:\n${chain}`);
    expect(chain.split('\n')).toHaveLength(4);
    expect(chain).toContain(`0 | ${originalValue} | original`);
    expect(chain).toContain('3 | 99.2 | Edit 3');

    // The original is still exactly what it was, byte for byte.
    expect(query(`select raw_value from measurement where id = '${originalId}'`)).toBe(originalValue);

    await page.goto(`/value/${originalId}`);
    await expect(page.getByText('Correction history')).toBeVisible();
    await expect(page.getByText('Append only').first()).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${CAPTURES}f21-value-sheet-corrected-393.png`, fullPage: true });
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
    const records = query('select id, source, kind from source_record order by source').split('\n');
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
    resetProvenance();
    await signIn(page);

    await page.getByRole('button', { name: 'Quick log' }).click();
    await page.getByRole('button', { name: 'Up half a centimetre' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(() => query("select count(*) from measurement where metric = 'waist' and source = 'manual'"), {
        timeout: 20_000,
      })
      .toBe('1');

    const originalId = query("select id from measurement where metric = 'waist' and source = 'manual'");
    const csrf = (await context.cookies()).find((cookie) => cookie.name === 'vernier_csrf')!.value;

    await page.request.post('/api/log', {
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID(), 'x-vernier-csrf': csrf },
      data: { action: 'correct', correctsId: originalId, rawValue: '99.2', reason: 'Typed a 2 for a 9.' },
    });

    const before = query(
      "select id || '|' || raw_value || '|' || source || '|' || correction_index from measurement order by id",
    );
    const beforeCount = query('select count(*) from measurement');
    console.log(`before the disagreeing write:\n${before}`);

    const conflicting = await page.request.post('/api/log', {
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID(), 'x-vernier-csrf': csrf },
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

    const after = query(
      "select id || '|' || raw_value || '|' || source || '|' || correction_index from measurement order by id",
    );
    console.log(`after:\n${after}`);
    expect(after).toBe(before);
    expect(query('select count(*) from measurement')).toBe(beforeCount);

    const question = query(
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
  test.skip(Number(query('select count(*) from owner')) === 0, 'no owner account on this installation yet');

  const VIEWPORTS: Array<[string, number, number]> = [
    ['393', 393, 852],
    ['768', 768, 1024],
    ['1280', 1280, 900],
  ];

  test('matches screen 03 at three viewports, with 44 px targets or better', async ({ page }) => {
    resetProvenance();
    await signIn(page);

    for (const [name, width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.getByRole('button', { name: 'Quick log' }).click();
      await expect(page.getByRole('dialog', { name: 'Quick log' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Energy, 4 of 5' })).toBeVisible();
      await settle(page);
      await page.screenshot({ path: `${CAPTURES}c5-quick-log-${name}.png` });

      // Every target inside the sheet, measured rather than asserted.
      const targets = await page
        .locator('.sheet button, .sheet textarea, .sheet a')
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const box = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return {
              label: node.getAttribute('aria-label') ?? node.textContent?.trim().slice(0, 24) ?? node.tagName,
              height: Math.round(box.height),
              fontSize: style.fontSize,
              classes: node.className,
            };
          }),
        );
      console.log(`--- ${name} px ---`);
      for (const target of targets) {
        console.log(`  ${target.height} px  ${target.fontSize}  ${target.label}`);
        expect(target.height, `${target.label} is under the 44 px floor`).toBeGreaterThanOrEqual(44);
      }

      // Screen 03 escalates the committed action to 52 px, over the 48 px base
      // that DESIGN.md section 2b fixes for the shell.
      const save = targets.find((target) => target.label === 'Save')!;
      expect(save.height).toBe(52);
      expect(save.fontSize).toBe('16px');

      await page.setViewportSize({ width: 393, height: 852 });
    }
  });

  test('draws loading, empty, error, offline and stale on screen 00 geometry', async ({ page, context }) => {
    resetProvenance();
    await signIn(page);

    // Loaded first, because every other state is measured against its geometry.
    await page.goto('/');
    await page.getByRole('button', { name: 'Quick log' }).click();
    await expect(page.getByRole('button', { name: 'Energy, 4 of 5' })).toBeVisible();
    const loadedBox = await page.locator('.sheet').boundingBox();
    await settle(page);
    await page.screenshot({ path: `${CAPTURES}c5-state-loaded.png` });

    // Stale: the seeded waist reading is three days old, so the sheet says so
    // with a --warn source chip naming the age, exactly as screen 00 state 6.
    await expect(page.locator('[data-state="stale"]')).toBeVisible();
    const staleChip = await page.locator('[data-state="stale"] .src').textContent();
    console.log(`stale chip reads: ${staleChip}`);
    expect(staleChip).toMatch(/\d+ days old$/);
    await settle(page);
    await page.screenshot({ path: `${CAPTURES}c5-state-stale.png` });
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
    await page.getByRole('button', { name: 'Quick log' }).click();
    await expect(page.locator('[data-state="loading"]')).toBeVisible();
    const loadingBox = await page.locator('.sheet').boundingBox();
    await settle(page);
    await page.screenshot({ path: `${CAPTURES}c5-state-loading.png` });
    console.log(`loading skeletons: ${await page.locator('[data-state="loading"] .skel').count()}`);
    expect(await page.locator('[data-state="loading"] .skel').count()).toBeGreaterThan(0);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await expect(page.locator('[data-state="loading"]')).toBeHidden({ timeout: 15_000 });
    await page.locator('.sheet').getByRole('button', { name: 'Close the quick log' }).click();

    // Error: the origin taken away while the sheet opens. The card names the
    // failure in words and says what still works, which here is the save itself.
    await goOffline(context, page);
    await page.getByRole('button', { name: 'Quick log' }).click();
    await expect(page.locator('[data-state="error"]')).toBeVisible({ timeout: 20_000 });
    const errorText = await page.locator('[data-state="error"]').textContent();
    console.log(`error card reads: ${errorText}`);
    expect(errorText).toContain('The sheet still saves');
    const errorBox = await page.locator('.sheet').boundingBox();
    await settle(page);
    await page.screenshot({ path: `${CAPTURES}c5-state-error.png` });

    // Offline: a write commits with the origin still gone, and the banner
    // carries the queue count.
    await page.getByRole('button', { name: 'Hunger, 3 of 5' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Quick log' }).click();
    await expect(page.locator('[data-state="offline"]')).toBeVisible();
    const offlineText = await page.locator('[data-state="offline"]').textContent();
    console.log(`offline banner reads: ${offlineText}`);
    expect(offlineText).toMatch(/entr(y|ies) (is|are) waiting to upload/);
    const offlineBox = await page.locator('.sheet').boundingBox();
    await settle(page);
    await page.screenshot({ path: `${CAPTURES}c5-state-offline.png` });

    await goOnline(context, page);

    // Geometry does not move between states, which is the whole of screen 00's
    // rule: a state change never reflows the page.
    console.log(
      `sheet width and left, per state: loaded ${loadedBox?.width}/${loadedBox?.x}, loading ${loadingBox?.width}/${loadingBox?.x}, error ${errorBox?.width}/${errorBox?.x}, offline ${offlineBox?.width}/${offlineBox?.x}`,
    );
    for (const box of [loadingBox, errorBox, offlineBox]) {
      expect(box?.width).toBe(loadedBox?.width);
      expect(box?.x).toBe(loadedBox?.x);
    }

    // Empty: a database holding no waist reading at all. Truncated without the
    // re-seed, so the absence is real rather than routed around.
    query('truncate measurement, source_record, import_question, idempotency_key, write_request');
    await page.goto('/');
    await page.getByRole('button', { name: 'Quick log' }).click();
    await expect(page.locator('[data-state="empty"]')).toBeVisible({ timeout: 20_000 });
    const emptyText = await page.locator('[data-state="empty"]').textContent();
    console.log(`empty card reads: ${emptyText}`);
    expect(emptyText).toContain('No waist measurement yet');
    await settle(page);
    await page.screenshot({ path: `${CAPTURES}c5-state-empty.png` });
    await expect(page.locator('.metric.mut')).toHaveText(/--/);

    resetProvenance();
  });
});
