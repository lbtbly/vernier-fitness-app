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
    expect(query("select count(*) from measurement where metric = 'energy' and source = 'manual'")).toBe('0');

    // The queue count is on Today, with the sheet closed, which is where
    // screen 03 frame 2 draws it. save() closes the sheet, so this is the state
    // the owner is actually looking at a second after he presses Save, and it
    // used to show a marker with no number in it.
    const todayBanner = page.locator('main [data-state="offline"]').first();
    await expect(todayBanner).toBeVisible();
    const todayCount = await todayBanner.textContent();
    console.log(`Today with the sheet closed reads: ${todayCount}`);
    expect(todayCount).toMatch(/entr(y|ies) (is|are) waiting to upload/);
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

    await page.getByRole('button', { name: 'Quick log', exact: true }).click();
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
    resetProvenance();
    await signIn(page);

    const ratingId = query("select id from measurement where metric = 'energy' and seed");
    const before = query(`select count(*) from measurement where root_id = '${ratingId}'`);
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
    const csrf = (await context.cookies()).find((cookie) => cookie.name === 'vernier_csrf')!.value;
    for (const bad of ['99', '-4.7', '3.5', '0', '', 'ninety-seven']) {
      const response = await page.request.post('/api/log', {
        headers: {
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
          'x-vernier-csrf': csrf,
        },
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
    expect(query(`select count(*) from measurement where root_id = '${ratingId}'`)).toBe('1');
    expect(query(`select raw_value from measurement where id = '${ratingId}'`)).toBe('4');

    // A correction the range does allow still goes through, so the gate is a
    // gate and not a wall.
    const good = await page.request.post('/api/log', {
      headers: {
        'content-type': 'application/json',
        'idempotency-key': crypto.randomUUID(),
        'x-vernier-csrf': csrf,
      },
      data: { action: 'correct', correctsId: ratingId, rawValue: '2', reason: 'Felt worse than I said' },
    });
    expect(good.status()).toBe(201);
    expect(query(`select count(*) from measurement where root_id = '${ratingId}'`)).toBe('2');

    // And the reason stored on it names the whole id rather than eight
    // characters of one, which read as a mangled word.
    const reason = query(`select dedup_reason from measurement where root_id = '${ratingId}' and correction_index = 1`);
    console.log(`the reason stored on the correction: ${reason}`);
    expect(reason).toContain(ratingId);

    // One outcome, one shape. A quick-log write whose every value is refused
    // answers exactly as a refused correction does: 422, a cause, a next step,
    // and the per-value reasons beside them. It used to answer 200 with a
    // `rejected` array and no error field at all, so the same event had two
    // contracts and the queue read the refusal as applied.
    const allRefused = await page.request.post('/api/log', {
      headers: {
        'content-type': 'application/json',
        'idempotency-key': crypto.randomUUID(),
        'x-vernier-csrf': csrf,
      },
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
    resetProvenance();
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
    await expect(page.getByText('Removed before it uploaded. Nothing was stored.')).toBeVisible();
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
    expect(query("select count(*) from measurement where metric = 'fatigue' and source = 'manual'")).toBe('0');

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
    await expect(page.getByText('Vernier never deletes a value')).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${CAPTURES}c5-just-logged-applied-393.png`, fullPage: true });

    // Two cards, two things, two labels. Today used to draw the write that was
    // just made and the values that stand today side by side, both headed
    // JUST LOGGED, from one key used for two different meanings.
    const labels = await page.locator('main .card > .lbl').allTextContents();
    console.log(`the card labels on Today: ${JSON.stringify(labels)}`);
    expect(new Set(labels).size, 'no two cards on Today wear the same label').toBe(labels.length);
    expect(labels).toContain('Just logged');
    expect(labels).toContain('On file');

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

    await page.getByRole('button', { name: 'Quick log', exact: true }).click();
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
      await page.getByRole('button', { name: 'Quick log', exact: true }).click();
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
    await page.getByRole('button', { name: 'Quick log', exact: true }).click();
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
    await page.getByRole('button', { name: 'Quick log', exact: true }).click();
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
    await page.getByRole('button', { name: 'Quick log', exact: true }).click();
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
    await page.getByRole('button', { name: 'Quick log', exact: true }).click();
    await expect(page.locator('.sheet [data-state="offline"]')).toBeVisible();
    const offlineText = await page.locator('.sheet [data-state="offline"]').textContent();
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
    await page.getByRole('button', { name: 'Quick log', exact: true }).click();
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
