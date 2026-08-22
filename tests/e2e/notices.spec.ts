import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ENGINES, expect, inEngine, test, type Engine } from './fixtures';
import {
  anchorScratchDemo,
  ensureScratchOwner,
  projectRoot,
  scratchQuery,
  scratchQuietSources,
  scratchSignInLink,
  scratchUrl,
  testStackWithDemoMode,
  waitForScratch,
} from './host';
import { strings } from '../../src/lib/strings';

/**
 * F27, and the class of defect it turned out to be.
 *
 * Today puts five things inside 715 px at 393x852 with nothing scrolled, and
 * everything it raises between the title and the first card is data: how many
 * sources have gone quiet, how many imports are waiting on an answer, how many
 * entries are still on the phone. Each of those shipped as a banner of its own,
 * so the room they took grew with the trouble. Two quiet sources put the weight
 * trend 27 px under the fold. That was fixed on the stale banner, and an open
 * import question then put it 43 px under, in Chrome and in WebKit alike: the
 * same defect in a second element.
 *
 * So what is graded here is the REGION rather than any banner in it. One line,
 * whatever it holds, at every anchor and in both engines.
 *
 * WHERE THE STATE COMES FROM. The scale in the demonstration series goes quiet
 * four days in every twenty-one and the phone is permanently four days silent,
 * so two sources are quiet at once about one day in six and there is no shipped
 * path that makes that today. The seed is a pure function of `demo.anchor_day`,
 * so the anchor is moved and the container restarted: 198, 199 and 200 days back
 * are the three consecutive days the verifier measured 742, 741 and 742 px at,
 * and 196 is the neighbouring day with one source quiet. The question is raised
 * through the shipped `/api/log` path, as a real import disagreeing with a real
 * correction, and it stands until it is answered.
 *
 * BOTH ENGINES, AGAINST ONE DATABASE. Chrome only is what let this through the
 * first time. The two browsers are launched inside the test rather than as two
 * projects so that they measure the same rows: the anchored seed costs a
 * container restart to build, and two projects would build two of them.
 *
 * THE SESSION IS INJECTED, AND THAT IS WRITTEN DOWN. The scratch instance
 * answers on plain loopback HTTP and the session cookie is Secure, as F11
 * requires, so WebKit stores it and never sends it back: probed on 127.0.0.1 and
 * on localhost, both empty jars. The token itself is minted by the shipped
 * recovery route through the procedure docs/security.md gives the owner; the
 * only thing relaxed is the client-side Secure attribute, so the browser will
 * carry it over loopback. Nothing about the app changes, and nothing here is a
 * back door into a write path: every write below goes through `/api/log`.
 */

const CAPTURES = `${projectRoot}.forge/evidence/slice-4/fix3/`;

/** DESIGN.md: 852 minus a 54 px status bar and an 83 px tab bar. */
const FOLD = 715;

/** Two quiet sources at 198, 199 and 200. One at 196. */
const ANCHORS = [196, 198, 199, 200];

/** Counts the copy has to hold at, read through the shipped summary function. */
const COUNTS = [1, 2, 3, 5, 9, 42, 999_999];

type Reading = {
  anchor: string;
  engine: Engine;
  quiet: number;
  notices: number;
  summary: string;
  regionHeight: number;
  trendBottom: number;
  scrollY: number;
  banners: number;
  heightByCount: Record<string, number>;
};

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  mkdirSync(CAPTURES, { recursive: true });
  testStackWithDemoMode('1', 'reset');
  await waitForScratch();
  await ensureScratchOwner();
});

/**
 * A session on the scratch instance, minted by the shipped recovery route.
 *
 * Retried, because this runs seconds after a container restart: the port
 * answers `/healthz` before the route that mints the link has been compiled,
 * and the first request through can come back as a reset connection. A retry is
 * honest here; what is being graded is a fold, not a cold start.
 */
async function scratchSession(): Promise<Map<string, string>> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(scratchSignInLink(), { redirect: 'manual' });
      const jar = new Map<string, string>();
      for (const line of response.headers.getSetCookie()) {
        const pair = line.split(';')[0];
        const split = pair.indexOf('=');
        jar.set(pair.slice(0, split), pair.slice(split + 1));
      }
      if (jar.get('vernier_session')) return jar;
      lastError = new Error(`the recovery route answered ${response.status} and minted no session`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw lastError;
}

function signedInHeaders(jar: Map<string, string>): Record<string, string> {
  return {
    'content-type': 'application/json',
    'idempotency-key': randomUUID(),
    'x-vernier-csrf': jar.get('vernier_csrf')!,
    cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '),
  };
}

/**
 * An open import question, raised the way one is raised in life: a value stored,
 * corrected by the owner, and then an import sending a different number for the
 * same day. Nothing is written by the third call and the question stands until
 * the owner answers it, which is exactly the state F27 has to survive.
 */
async function raiseAQuestion(jar: Map<string, string>): Promise<void> {
  const measuredAt = new Date().toISOString();
  const stored = await fetch(`${scratchUrl}/api/log`, {
    method: 'POST',
    headers: signedInHeaders(jar),
    body: JSON.stringify({
      measuredAt,
      timeZone: 'Europe/Paris',
      values: [{ id: randomUUID(), metric: 'energy', rawValue: '3' }],
    }),
  });
  expect(stored.status).toBe(201);

  const id = scratchQuery(
    "select id from measurement where metric = 'energy' and source = 'manual' order by measured_at desc limit 1",
  );
  const corrected = await fetch(`${scratchUrl}/api/log`, {
    method: 'POST',
    headers: signedInHeaders(jar),
    body: JSON.stringify({ action: 'correct', correctsId: id, rawValue: '4', reason: 'Typed a 3 for a 4.' }),
  });
  expect(corrected.status).toBe(201);

  const disagreeing = await fetch(`${scratchUrl}/api/log`, {
    method: 'POST',
    headers: signedInHeaders(jar),
    body: JSON.stringify({
      measuredAt,
      timeZone: 'Europe/Paris',
      values: [{ id: randomUUID(), metric: 'energy', rawValue: '2' }],
    }),
  });
  const body = (await disagreeing.json()) as { questions: unknown[]; saved: unknown[] };
  expect(body.questions).toHaveLength(1);
  expect(body.saved).toHaveLength(0);
  expect(scratchQuery("select count(*) from import_question where state = 'open'")).toBe('1');
}

function cookiesFor(jar: Map<string, string>) {
  return [...jar].map(([name, value]) => ({
    name,
    value,
    domain: '127.0.0.1',
    path: '/',
    // See the header: WebKit will not send a Secure cookie back to an http
    // origin, and the scratch instance has no TLS in front of it. The app is
    // unchanged; this is the browser being told to carry what it was given.
    secure: false,
    httpOnly: true,
    sameSite: 'Strict' as const,
  }));
}

/** Everything the fold turns on, read off the rendered page. */
async function measure(page: import('@playwright/test').Page, counts: number[], copy: string[]) {
  return page.evaluate(
    ({ counts: forCounts, copy: lines }) => {
      const region = document.querySelector('[data-notices]') as HTMLDetailsElement | null;
      const box = region?.getBoundingClientRect();
      const trend = document.querySelector('[data-chart="today-weight"]')?.getBoundingClientRect();
      const day = document.querySelector('.card.day');

      // Every banner drawn above the first card, which is the region this line
      // is about. One element, or the class of defect is back.
      const banners = [...document.querySelectorAll('.banner')].filter(
        (node) => day !== null && node.compareDocumentPosition(day) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).length;

      // The height against the copy the shipped function produces for each
      // count, fed through the shipped element and re-measured. The point is
      // that no wording can grow the row.
      const heightByCount: Record<string, number> = {};
      const label = region?.querySelector('summary > b') ?? null;
      const was = label?.textContent ?? '';
      for (let index = 0; index < forCounts.length; index += 1) {
        if (!label || !region) break;
        label.textContent = lines[index];
        heightByCount[String(forCounts[index])] = Math.round(region.getBoundingClientRect().height);
      }
      if (label) label.textContent = was;

      return {
        notices: Number(region?.getAttribute('data-notices') ?? 0),
        // One line per quiet source, under the count. Nothing is dropped when
        // the region collapses; what collapses is the room, not the reading.
        staleLines: document.querySelectorAll('[data-notice="stale"] .noticedetail').length,
        summary: region?.querySelector('summary')?.textContent?.trim() ?? '',
        detail: region?.textContent?.trim() ?? '',
        regionHeight: box ? Math.round(box.height) : 0,
        trendBottom: trend ? Math.round(trend.bottom + window.scrollY) : 0,
        scrollY: window.scrollY,
        banners,
        heightByCount,
      };
    },
    { counts, copy },
  );
}

test('F27. the notice region is one line, and the trend clears the fold, at every quiet anchor in both engines', async () => {
  const readings: Reading[] = [];
  const copy = COUNTS.map((count) => strings.notices.summary(count));

  for (const daysAgo of ANCHORS) {
    const anchor = anchorScratchDemo(daysAgo);
    await waitForScratch();
    await ensureScratchOwner();
    const jar = await scratchSession();
    await raiseAQuestion(jar);
    const quiet = scratchQuietSources();
    console.log(`q${daysAgo}  anchor ${anchor}, ${quiet} quiet source(s), 1 open question`);

    for (const engine of ENGINES) {
      await inEngine(
        engine,
        { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 },
        async (page, context) => {
          await context.addCookies(cookiesFor(jar));
          await page.goto(`${scratchUrl}/`);
          await page.waitForLoadState('networkidle');
          const read = await measure(page, COUNTS, copy);
          readings.push({ anchor: `q${daysAgo}`, engine, quiet, ...read });
          console.log(
            `q${daysAgo}  ${engine.padEnd(6)} region ${read.regionHeight} px, ${read.notices} notice(s), ` +
              `trend ends ${read.trendBottom} px, fold ${FOLD}, scrollY ${read.scrollY}`,
          );
          console.log(`q${daysAgo}  ${engine.padEnd(6)} the one line reads: ${read.summary}`);
          if (daysAgo === 200) {
            await page.screenshot({
              path: `${CAPTURES}f27-q${daysAgo}-${engine}-393.png`,
              fullPage: true,
            });
          }
        },
      );
    }
  }

  // Two sources quiet AND a question open is the state the defect was found in,
  // and it is reached at three of the four anchors.
  const bothQuiet = readings.filter((reading) => reading.quiet === 2);
  expect(bothQuiet.length, 'no anchor reached two quiet sources at once').toBe(6);

  for (const reading of readings) {
    expect(reading.notices, `${reading.anchor} ${reading.engine} raised no question`).toBe(2);
    expect(reading.banners, `${reading.anchor} ${reading.engine} drew more than one banner`).toBe(1);
    expect(reading.scrollY, `${reading.anchor} ${reading.engine} had to scroll`).toBe(0);
    expect(
      reading.trendBottom,
      `${reading.anchor} ${reading.engine}: the weight trend is under the fold`,
    ).toBeLessThanOrEqual(FOLD);
  }

  // The height is one number across every anchor, both engines and every count
  // the copy can produce. This is the line: the region does not grow with the
  // data, and no string anybody writes later can grow it either.
  const heights = new Set<number>();
  for (const reading of readings) {
    heights.add(reading.regionHeight);
    for (const count of COUNTS) heights.add(reading.heightByCount[String(count)]);
  }
  console.log(`F27  every region height measured, across ${readings.length} readings: ${[...heights].join(', ')}`);
  expect([...heights], 'the region height depends on something').toHaveLength(1);
});

/**
 * The third notice, which is the queue, and the state slices 5 to 14 will keep
 * adding to. Three things wrong at once on one line.
 */
test('F27. a third notice does not move the fold either', async () => {
  const anchor = anchorScratchDemo(200);
  await waitForScratch();
  await ensureScratchOwner();
  const jar = await scratchSession();
  await raiseAQuestion(jar);
  console.log(`queue  anchor ${anchor}, ${scratchQuietSources()} quiet source(s), 1 open question`);

  const copy = COUNTS.map((count) => strings.notices.summary(count));
  const heights = new Set<number>();

  for (const engine of ENGINES) {
    await inEngine(
      engine,
      { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 },
      async (page, context) => {
        await context.addCookies(cookiesFor(jar));
        // The queue cannot drain while the origin refuses the write, which is
        // the only state in which an entry sits in it. Only /api/log is taken
        // away; the screen itself still loads.
        await context.route('**/api/log', (route) => route.abort('connectionfailed'));
        await page.goto(`${scratchUrl}/`);
        await page.waitForLoadState('load');

        // One entry in the outbox, in the store the shipped flusher reads. The
        // component opens that database on mount to read the queue depth, so
        // this waits for it rather than creating a database of its own at the
        // same version with different stores in it.
        await expect
          .poll(
            () =>
              page.evaluate(async () => {
                const names = await indexedDB.databases();
                if (!names.some((entry) => entry.name === 'vernier')) return false;
                return new Promise<boolean>((resolve) => {
                  const request = indexedDB.open('vernier', 1);
                  request.onsuccess = () => {
                    const has = request.result.objectStoreNames.contains('outbox');
                    request.result.close();
                    resolve(has);
                  };
                  request.onerror = () => resolve(false);
                });
              }),
            { timeout: 20_000 },
          )
          .toBe(true);

        await page.evaluate(async () => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('vernier', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('outbox', 'readwrite');
            tx.objectStore('outbox').put({
              id: crypto.randomUUID(),
              url: '/api/log',
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                measuredAt: new Date().toISOString(),
                timeZone: 'Europe/Paris',
                values: [{ id: crypto.randomUUID(), metric: 'fatigue', rawValue: '2' }],
              }),
              createdAt: Date.now(),
              attempts: 0,
              nextAttemptAt: 0,
              lastError: null,
              parked: false,
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
          db.close();
        });

        await page.reload();
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('[data-notices="3"]')).toBeVisible();

        const read = await measure(page, COUNTS, copy);
        heights.add(read.regionHeight);
        for (const count of COUNTS) heights.add(read.heightByCount[String(count)]);
        console.log(
          `queue  ${engine.padEnd(6)} region ${read.regionHeight} px, ${read.notices} notice(s), ` +
            `trend ends ${read.trendBottom} px, fold ${FOLD}, scrollY ${read.scrollY}`,
        );
        console.log(`queue  ${engine.padEnd(6)} the one line reads: ${read.summary}`);
        console.log(`queue  ${engine.padEnd(6)} one tap under it: ${read.detail.replace(/\s+/g, ' ')}`);

        expect(read.notices).toBe(3);
        expect(read.banners, 'a third notice drew a second banner').toBe(1);
        expect(read.scrollY).toBe(0);
        expect(read.trendBottom).toBeLessThanOrEqual(FOLD);
        // Nothing is hidden: the queue count, the quiet sources and the
        // question are all one tap under the line, in full.
        expect(read.detail).toContain('entry is waiting to upload');
        expect(read.staleLines, 'a quiet source lost its line').toBe(2);
        expect(read.detail).toContain('days old');
        expect(read.detail).toContain(strings.question.title);

        await page.screenshot({ path: `${CAPTURES}f27-three-notices-${engine}-393.png`, fullPage: true });
        await page.locator('[data-notices] summary').click();
        await page.screenshot({ path: `${CAPTURES}f27-three-notices-open-${engine}-393.png`, fullPage: true });
      },
    );
  }

  console.log(`F27  region heights with three notices in it: ${[...heights].join(', ')}`);
  expect([...heights]).toHaveLength(1);
});
