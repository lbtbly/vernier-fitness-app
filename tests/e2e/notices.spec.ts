import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ENGINES, expect, inEngine, test, type Engine } from './fixtures';
import {
  anchorScratchDemo,
  ensureScratchOwner,
  landScratchSample,
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
 * F27, amended, and the class of defect it turned out to be.
 *
 * WHAT THE LINE NOW ASKS. Today puts the session row, the meals, what needs
 * logging and the weight trend inside 715 px at 393x852 with nothing scrolled,
 * in every state the owner's data can produce and not in one. Adherence is never
 * drawn above the trend. Every element that CAN draw above the trend carries a
 * maximum height fixed by construction rather than by a count of rows, each
 * maximum stated as a number, measured at its smallest and its largest count,
 * and the maxima sum inside 715. The 715 is met at DESIGN.md section 3's card
 * padding and card gap, measured on the shipped screen.
 *
 * WHY IT ASKS THAT. Four verifications found four different elements growing
 * above the trend: a second stale line at 742 px, an open import question at
 * 758 px, and the just-logged card at 1147 px. Each fix bounded the element in
 * front of it and the next one grew, because the set was never closed. Amendment
 * A5 closed it, and A4's third standing rule now binds every line that fixes a
 * budget: a fixed budget binds only over a closed set.
 *
 * SO WHAT IS GRADED HERE IS THE SUM OF MAXIMA, not one capture of one seed.
 * There are four elements above the trend and each states its number where it is
 * built:
 *
 *   header.title      63 px   fixed type on a fixed padding
 *   .banner.queue     one line, clamped in the stylesheet, at any queue depth
 *   details.notices   one summary row, clamped, whatever it holds
 *   section.card.day  the session row plus the pair a write replaces
 *
 * Each is measured below at both extremes of whatever count can move it, and the
 * five states F27 names are walked in both engines against one database.
 *
 * WHERE THE STATE COMES FROM. The scale in the demonstration series goes quiet
 * four days in every twenty-one and the phone is permanently four days silent, so
 * two sources are quiet at once about one day in six and there is no shipped path
 * that makes that today. The seed is a pure function of `demo.anchor_day`, so the
 * anchor is moved and the container restarted. "Nothing raised" is the state the
 * anchors cannot reach at all, because the demonstration phone never sends: it is
 * built by landing one fresh sample per source, the way trend-scratch.spec.ts
 * does, which is the same door and the same reason.
 *
 * BOTH ENGINES, AGAINST ONE DATABASE. Chrome only is what let this through the
 * first time. The two browsers are launched inside the test rather than as two
 * projects so that they measure the same rows: the anchored seed costs a
 * container restart to build, and two projects would build two of them.
 *
 * THE SESSION IS INJECTED, AND THAT IS WRITTEN DOWN. The scratch instance answers
 * on plain loopback HTTP and the session cookie is Secure, as F11 requires, so
 * WebKit stores it and never sends it back: probed on 127.0.0.1 and on localhost,
 * both empty jars. The token itself is minted by the shipped recovery route
 * through the procedure docs/security.md gives the owner; the only thing relaxed
 * is the client-side Secure attribute, so the browser will carry it over
 * loopback. Nothing about the app changes, and nothing here is a back door into a
 * write path: every write below goes through `/api/log` or through the sheet.
 */

/**
 * AND THE WAIST FIELD, WHICH LIVES HERE FOR THE SAME REASON THE FOLD DOES.
 *
 * F23 and C5 came back on the one control the owner cannot do without: the
 * field could not be typed into, and a value typed while the snapshot read was
 * in flight was replaced by the last stored measurement when it landed. Both
 * happened in Chrome and in WebKit, and the suite that missed them used
 * `fill()`, which sets a whole value in one event and never moves a caret.
 *
 * Withings sends a weight and never a waist. That field is the only door that
 * metric has, on both of the owner's devices, forever, so the tests below type
 * into it one key at a time in both engines and read the field back after every
 * keystroke. They are here because this is the file that drives two engines
 * against one scratch database, and because an install with no waist ever
 * measured costs a container rebuild to reach.
 */
const CAPTURES = `${projectRoot}.forge/evidence/slice-4/fix5/`;

/** DESIGN.md section 3: 852 minus a 54 px status bar and an 83 px tab bar. */
const FOLD = 715;

/** DESIGN.md section 3, the two values the fold has to be met at. */
const CARD_PADDING = 16;
const CARD_GAP = 12;

/** Two quiet sources at 200. One at 196. */
const QUIET_ANCHOR = 200;
const ONE_QUIET_ANCHOR = 196;

/** Counts the notice copy has to hold at, read through the shipped function. */
const COUNTS = [1, 2, 3, 5, 9, 42, 999_999];

type Measured = {
  state: string;
  engine: Engine;
  scrollY: number;
  trendBottom: number;
  adherenceTop: number | null;
  /** Every element the page drew above the weight trend, with its height. */
  above: Array<{ what: string; top: number; bottom: number; height: number }>;
  title: number;
  queue: number | null;
  queueText: string | null;
  region: number | null;
  regionNotices: number;
  day: number;
  cardPadding: number;
  cardGap: number;
  /** The region's height at every count its copy can take. */
  regionByCount: Record<string, number>;
  /** The offline line's height at 1 and at 999999 queued entries. */
  queueByCount: Record<string, number>;
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
 * Retried, because this runs seconds after a container restart: the port answers
 * `/healthz` before the route that mints the link has been compiled, and the
 * first request through can come back as a reset connection. A retry is honest
 * here; what is being graded is a fold, not a cold start.
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

/** The fold, drawn on the page, so a capture shows where 715 pixels ends. */
async function markTheFold(page: import('@playwright/test').Page) {
  await page.evaluate((fold) => {
    if (document.querySelector('[data-fold-marker]')) return;
    const rule = document.createElement('div');
    rule.setAttribute('data-fold-marker', String(fold));
    Object.assign(rule.style, {
      position: 'absolute',
      left: '0',
      right: '0',
      top: `${fold}px`,
      height: '0',
      borderTop: '2px dashed #F07A6A',
      zIndex: '99',
      pointerEvents: 'none',
    });
    const label = document.createElement('span');
    label.textContent = `fold, ${fold} px`;
    Object.assign(label.style, {
      position: 'absolute',
      right: '4px',
      top: '2px',
      font: '11px -apple-system, system-ui',
      color: '#F07A6A',
    });
    rule.append(label);
    document.body.append(rule);
  }, FOLD);
}

/**
 * Everything the fold turns on, read off the rendered page.
 *
 * The two by-count maps are the boundedness clause itself: the shipped copy
 * function is called for each count, its answer is written into the shipped
 * element, and the element is re-measured. The point is not that the copy is
 * short today, it is that no wording can grow the row.
 */
async function measure(
  page: import('@playwright/test').Page,
  noticeCopy: string[],
  queueCopy: string[],
): Promise<Omit<Measured, 'state' | 'engine'>> {
  return page.evaluate(
    ({ counts, notices, queues }) => {
      const round = (value: number) => Math.round(value);
      const trend = document.querySelector('[data-chart="today-weight"]')!.getBoundingClientRect();
      const trendBottom = round(trend.bottom + window.scrollY);

      // Everything the page drew above the trend, whatever it is. Not a list of
      // five names: whatever is there, so a sixth element in slice 6 or slice 13
      // shows up in this evidence without anybody remembering to add it.
      const above: Array<{ what: string; top: number; bottom: number; height: number }> = [];
      const scroll = document.querySelector('.app-scroll')!;
      const walk = (parent: Element) => {
        for (const node of parent.children) {
          const box = node.getBoundingClientRect();
          if (box.top + window.scrollY >= trend.top + window.scrollY) continue;
          const name = `${node.tagName.toLowerCase()}${node.className ? `.${String(node.className).split(' ').join('.')}` : ''}`;
          above.push({
            what: name,
            top: round(box.top + window.scrollY),
            bottom: round(box.bottom + window.scrollY),
            height: round(box.height),
          });
        }
      };
      walk(scroll.firstElementChild ?? scroll);

      const region = document.querySelector('[data-notices]') as HTMLDetailsElement | null;
      const queue = document.querySelector('.banner.queue') as HTMLElement | null;
      const title = document.querySelector('header.title')!.getBoundingClientRect();
      const day = document.querySelector('.card.day')!;
      const dayStyle = getComputedStyle(day);
      const adherence = document.querySelector('.card.adherence')?.getBoundingClientRect() ?? null;

      // The region's height against every count its own copy can produce.
      const regionByCount: Record<string, number> = {};
      const regionLabel = region?.querySelector('summary > b') ?? null;
      const regionWas = regionLabel?.textContent ?? '';
      if (region && regionLabel) {
        for (let index = 0; index < counts.length; index += 1) {
          regionLabel.textContent = notices[index];
          regionByCount[String(counts[index])] = round(region.getBoundingClientRect().height);
        }
        regionLabel.textContent = regionWas;
      }

      // The offline line's height against every count of queued entries.
      const queueByCount: Record<string, number> = {};
      const queueLine = queue?.querySelector('.queue-line') ?? null;
      const queueWas = queueLine?.innerHTML ?? '';
      if (queue && queueLine) {
        for (let index = 0; index < counts.length; index += 1) {
          queueLine.textContent = queues[index];
          queueByCount[String(counts[index])] = round(queue.getBoundingClientRect().height);
        }
        queueLine.innerHTML = queueWas;
      }

      return {
        scrollY: window.scrollY,
        trendBottom,
        adherenceTop: adherence ? round(adherence.top + window.scrollY) : null,
        above,
        title: round(title.height),
        queue: queue ? round(queue.getBoundingClientRect().height) : null,
        queueText: queue?.textContent?.trim() ?? null,
        region: region ? round(region.getBoundingClientRect().height) : null,
        regionNotices: Number(region?.getAttribute('data-notices') ?? 0),
        day: round(day.getBoundingClientRect().height),
        cardPadding: Number.parseFloat(dayStyle.paddingTop),
        cardGap: Number.parseFloat(dayStyle.marginBottom),
        regionByCount,
        queueByCount,
      };
    },
    { counts: COUNTS, notices: noticeCopy, queues: queueCopy },
  );
}

/** One entry in the outbox, in the store the shipped flusher reads. */
async function queueOneEntry(page: import('@playwright/test').Page) {
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
}

/**
 * One quick log writing all six values F23 names, through the shipped sheet.
 *
 * The waist is typed rather than stepped, which is what screen 03 frame 3 draws
 * and what F23's tap count now rests on. The origin is taken away first, so the
 * entry sits in the queue and the row keeps its Undo and Edit: that is the tallest
 * the day card ever gets, and it is the state this measurement is for.
 */
async function writeAllSix(page: import('@playwright/test').Page, context: import('@playwright/test').BrowserContext) {
  await page.getByRole('button', { name: 'Quick log', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Quick log' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Energy, 4 of 5' })).toBeEnabled();

  await page.locator('#quick-log-waist').fill('99.0');
  await page.getByRole('button', { name: 'Energy, 4 of 5' }).click();
  await page.getByRole('button', { name: 'Fatigue, 2 of 5' }).click();
  await page.getByRole('button', { name: 'Hunger, 3 of 5' }).click();
  await page.getByRole('button', { name: 'Satiety after eating, 4 of 5' }).click();
  await page
    .getByLabel('Note')
    .fill(
      'Slept badly. Left knee fine. And this note runs on well past the width of the row, because a row whose height is the length of what somebody typed is not a bounded row.',
    );

  // The origin, taken away properly.
  //
  // A page-level route is invisible to a service worker's own fetches, and these
  // contexts are opened by `inEngine` rather than by the project, so the worker
  // is allowed to install in them. A route alone let the flush through: the
  // entry uploaded, the row went from Queued to Stored between two assertions,
  // and the offline line never appeared at all. Both doors are shut.
  await context.setOffline(true).catch(() => undefined);
  await context.route('**/*', (route) => route.abort('connectionfailed'));
  const reachable = await page.evaluate(async () => {
    try {
      return (await fetch('/healthz', { method: 'HEAD', cache: 'no-store' })).ok;
    } catch {
      return false;
    }
  });
  expect(reachable, 'the origin must really be unreachable before an offline write means anything').toBe(false);

  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // Queued, and staying queued, which is what makes this the tallest the day
  // card gets: the row keeps its Undo and Edit and the offline line is up.
  // The sheet closes on save, because the write is committed the moment the
  // entry is in IndexedDB. Waited for rather than assumed: while it is up it is
  // `aria-modal`, so everything behind it is out of the accessibility tree and
  // Undo and Edit cannot be found by role however plainly they are drawn. WebKit
  // takes a beat longer over it than Chrome does, and a fold measured with the
  // sheet still over it is a measurement of the sheet.
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.locator('[data-just-logged="queued"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
  await expect(page.locator('.banner.queue')).toBeVisible();
}

test('F27. every element above the trend is bounded, the maxima sum inside 715, and the trend clears the fold in five states and both engines', async () => {
  const readings: Measured[] = [];
  const noticeCopy = COUNTS.map((count) => strings.notices.summary(count));
  const queueCopy = COUNTS.map((count) => `${strings.todayLog.queueTitle} ${strings.todayLog.queueBody(count)}`);

  /**
   * The five states F27 names, in the order they are cheapest to build. Each
   * one says what it costs to reach, because two of them cannot be reached on
   * the owner's install at all.
   */
  const states: Array<{
    name: string;
    build: () => Promise<void>;
    /** What the page has to be put through inside the browser, per engine. */
    inPage?: (page: import('@playwright/test').Page, context: import('@playwright/test').BrowserContext) => Promise<void>;
  }> = [
    {
      name: 'nothing-raised',
      build: async () => {
        anchorScratchDemo(ONE_QUIET_ANCHOR);
        await waitForScratch();
        await ensureScratchOwner();
        // Both syncing sources sending inside the last thirty-six hours, which
        // the demonstration seed never produces on its own: its phone is
        // permanently four days silent. Same door trend-scratch.spec.ts uses.
        landScratchSample('fold-fresh-phone', 'apple_health_shortcut', 'steps', 9412, 'step', 1);
        landScratchSample('fold-fresh-scale', 'withings', 'weight', 85.9, 'kg', 1);
      },
    },
    {
      name: 'every-source-quiet',
      build: async () => {
        anchorScratchDemo(QUIET_ANCHOR);
        await waitForScratch();
        await ensureScratchOwner();
      },
    },
    {
      name: 'open-import-question',
      build: async () => {
        anchorScratchDemo(QUIET_ANCHOR);
        await waitForScratch();
        await ensureScratchOwner();
        await raiseAQuestion(await scratchSession());
      },
    },
    {
      name: 'offline-with-entries-queued',
      build: async () => {
        anchorScratchDemo(QUIET_ANCHOR);
        await waitForScratch();
        await ensureScratchOwner();
        await raiseAQuestion(await scratchSession());
      },
      inPage: async (page, context) => {
        // The queue cannot drain while the origin refuses the write, which is
        // the only state in which an entry sits in it. Only /api/log is taken
        // away; the screen itself still loads.
        await context.route('**/api/log', (route) => route.abort('connectionfailed'));
        await page.reload();
        await page.waitForLoadState('load');
        await queueOneEntry(page);
        await page.reload();
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.banner.queue')).toBeVisible();
      },
    },
    {
      name: 'after-one-quick-log-all-six',
      build: async () => {
        anchorScratchDemo(QUIET_ANCHOR);
        await waitForScratch();
        await ensureScratchOwner();
        await raiseAQuestion(await scratchSession());
      },
      inPage: writeAllSix,
    },
  ];

  for (const state of states) {
    await state.build();
    const jar = await scratchSession();
    const quiet = scratchQuietSources();
    const open = scratchQuery("select count(*) from import_question where state = 'open'");
    console.log(`\nF27  state ${state.name}: ${quiet} quiet source(s), ${open} open question(s)`);

    for (const engine of ENGINES) {
      await inEngine(
        engine,
        { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, serviceWorkers: 'block' },
        async (page, context) => {
          await context.addCookies(cookiesFor(jar));
          await page.goto(`${scratchUrl}/`);
          await page.waitForLoadState('networkidle');
          if (state.inPage) await state.inPage(page, context);

          const read = await measure(page, noticeCopy, queueCopy);
          readings.push({ state: state.name, engine, ...read });

          console.log(
            `F27  ${state.name.padEnd(28)} ${engine.padEnd(6)} trend ends ${String(read.trendBottom).padStart(4)} px, ` +
              `fold ${FOLD}, scrollY ${read.scrollY}`,
          );
          for (const element of read.above) {
            console.log(
              `F27    above the trend  ${String(element.top).padStart(4)}..${String(element.bottom).padStart(4)}  ` +
                `h ${String(element.height).padStart(4)}  ${element.what}`,
            );
          }
          console.log(
            `F27    title ${read.title}  offline line ${read.queue ?? '-'}  notice region ${read.region ?? '-'} ` +
              `(${read.regionNotices})  day card ${read.day}  card padding ${read.cardPadding}  card gap ${read.cardGap}`,
          );
          if (read.queueText) console.log(`F27    the offline line reads: ${read.queueText}`);

          await markTheFold(page);
          await page.screenshot({
            path: `${CAPTURES}f27-${state.name}-${engine}-393x852.png`,
            fullPage: true,
          });
        },
      );
    }
  }

  // Ten readings: five states, two engines.
  console.log(`\nF27  readings: ${readings.length}`);
  expect(readings).toHaveLength(states.length * ENGINES.length);

  /* ---------------------------------------------------- the line, clause by clause */

  for (const reading of readings) {
    const where = `${reading.state} ${reading.engine}`;
    expect(reading.scrollY, `${where} had to scroll`).toBe(0);
    expect(reading.trendBottom, `${where}: the weight trend is under the fold`).toBeLessThanOrEqual(FOLD);

    // "Adherence is never drawn above the weight trend."
    if (reading.adherenceTop !== null) {
      expect(reading.adherenceTop, `${where}: adherence is drawn above the trend`).toBeGreaterThan(
        reading.trendBottom,
      );
    }

    // "The 715 is met at the card padding and the card gap DESIGN.md section 3
    // fixes, measured on the shipped screen: a fold bought by compressing them
    // is a FAIL."
    expect(reading.cardPadding, `${where}: Today's card padding is not section 3's`).toBe(CARD_PADDING);
    expect(reading.cardGap, `${where}: Today's card gap is not section 3's`).toBe(CARD_GAP);
  }
  console.log(
    `F27  card padding ${CARD_PADDING} px and card gap ${CARD_GAP} px on every reading, measured on the shipped screen`,
  );

  /* -------------------------------- each element's maximum, at its extreme count */

  // The notice region, at 1 notice and at 999,999, in both engines and in every
  // state that raises one. One number or the region depends on something.
  const regionHeights = new Set<number>();
  for (const reading of readings) {
    if (reading.region === null) continue;
    regionHeights.add(reading.region);
    for (const count of COUNTS) regionHeights.add(reading.regionByCount[String(count)]);
  }
  console.log(`F27  notice region, every height measured at counts ${COUNTS.join(', ')}: ${[...regionHeights].join(', ')}`);
  expect([...regionHeights], 'the notice region height depends on something').toHaveLength(1);

  // The offline line, at 1 queued entry and at 999,999.
  const queueHeights = new Set<number>();
  for (const reading of readings) {
    if (reading.queue === null) continue;
    queueHeights.add(reading.queue);
    for (const count of COUNTS) queueHeights.add(reading.queueByCount[String(count)]);
  }
  console.log(`F27  offline line, every height measured at queue depths ${COUNTS.join(', ')}: ${[...queueHeights].join(', ')}`);
  expect([...queueHeights], 'the offline line height depends on the queue depth').toHaveLength(1);

  // The title, which takes its height from fixed type on fixed padding.
  const titles = new Set(readings.map((reading) => reading.title));
  console.log(`F27  title header, every height measured: ${[...titles].join(', ')}`);
  expect([...titles], 'the title height depends on something').toHaveLength(1);

  // The day card, at its smallest count of rows and at its largest: the plan's
  // three rows, and the session row beside a write carrying all six values with
  // a note long enough to wrap three times.
  const dayByState = new Map<string, number[]>();
  for (const reading of readings) {
    dayByState.set(reading.state, [...(dayByState.get(reading.state) ?? []), reading.day]);
  }
  for (const [state, heights] of dayByState) {
    console.log(`F27  day card in ${state}: ${heights.join(', ')} px`);
    expect(new Set(heights).size, `the day card differs between engines in ${state}`).toBe(1);
  }
  const dayMax = Math.max(...readings.map((reading) => reading.day));
  const dayMin = Math.min(...readings.map((reading) => reading.day));
  console.log(`F27  day card measured from ${dayMin} px at its smallest to ${dayMax} px at its largest`);

  /* ------------------------------------------------- and the maxima, summed */

  const titleMax = Math.max(...readings.map((reading) => reading.title));
  const queueMax = Math.max(...queueHeights);
  const regionMax = Math.max(...regionHeights);
  // What the weight card spends above its own chart, which is the last thing
  // between the day card and the trend. Measured rather than assumed.
  const weightAbove = Math.max(
    ...readings.map((reading) => {
      const day = reading.above.find((element) => element.what.includes('card.day'))!;
      return reading.trendBottom - day.bottom;
    }),
  );
  const chrome = Math.min(...readings.map((reading) => reading.above[0].top));
  const sum = chrome + titleMax + CARD_GAP + queueMax + CARD_GAP + regionMax + CARD_GAP + dayMax + weightAbove;

  console.log('\nF27  the maxima, and their sum');
  console.log(`F27    scroll padding above the title      ${String(chrome).padStart(4)} px`);
  console.log(`F27    header.title                        ${String(titleMax).padStart(4)} px  fixed type, fixed padding`);
  console.log(`F27    .banner.queue                       ${String(queueMax).padStart(4)} px  one clamped line at any queue depth`);
  console.log(`F27    details.notices                     ${String(regionMax).padStart(4)} px  one clamped summary row whatever it holds`);
  console.log(`F27    section.card.day                    ${String(dayMax).padStart(4)} px  the session row plus the pair a write replaces`);
  console.log(`F27    the weight card above its chart     ${String(weightAbove).padStart(4)} px  label, headline and the chart's own margin`);
  console.log(`F27    three card gaps at ${CARD_GAP} px           ${String(CARD_GAP * 3).padStart(4)} px`);
  console.log(`F27    sum                                 ${String(sum).padStart(4)} px  against a fold of ${FOLD} px`);
  expect(sum, 'the maxima do not sum inside the fold').toBeLessThanOrEqual(FOLD);

  // The worst reading actually taken, beside the sum, so the two can be compared.
  const worst = Math.max(...readings.map((reading) => reading.trendBottom));
  console.log(`F27  the deepest the trend reached in any state or engine: ${worst} px\n`);
  expect(worst).toBeLessThanOrEqual(sum);
});

/**
 * The states named in the line, read back for what they SAY rather than for
 * where they end. F24's queue count and the ruling on where it lives.
 */
test('F24 and C5. the offline line is neutral, one line, under the title, with the count on it', async () => {
  anchorScratchDemo(QUIET_ANCHOR);
  await waitForScratch();
  await ensureScratchOwner();
  const jar = await scratchSession();

  for (const engine of ENGINES) {
    await inEngine(
      engine,
      { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, serviceWorkers: 'block' },
      async (page, context) => {
        await context.addCookies(cookiesFor(jar));
        await context.route('**/api/log', (route) => route.abort('connectionfailed'));
        await page.goto(`${scratchUrl}/`);
        await page.waitForLoadState('load');
        await queueOneEntry(page);
        await page.reload();
        await page.waitForLoadState('domcontentloaded');

        const line = page.locator('.banner.queue');
        await expect(line).toBeVisible();
        const read = await line.evaluate((node) => {
          const style = getComputedStyle(node);
          const title = document.querySelector('header.title')!.getBoundingClientRect();
          const firstCard = document.querySelector('.card')!.getBoundingClientRect();
          const box = node.getBoundingClientRect();
          return {
            text: node.textContent?.trim() ?? '',
            colour: style.color,
            background: style.backgroundColor,
            border: style.borderColor,
            warn: node.classList.contains('w'),
            insideTheNoticeRegion: node.closest('[data-notices]') !== null,
            underTheTitle: box.top >= title.bottom,
            aboveTheFirstCard: box.bottom <= firstCard.top,
            lines: Math.round(box.height / Number.parseFloat(style.lineHeight)),
            warnToken: getComputedStyle(document.documentElement).getPropertyValue('--warn').trim(),
          };
        });

        console.log(`F24  ${engine.padEnd(6)} the line reads: ${read.text}`);
        console.log(
          `F24  ${engine.padEnd(6)} colour ${read.colour}, background ${read.background}, warn class ${read.warn}, ` +
            `inside the notice region ${read.insideTheNoticeRegion}, under the title ${read.underTheTitle}`,
        );

        // The count is on the line, unabridged, with no tap.
        expect(read.text).toContain(strings.todayLog.queueTitle);
        expect(read.text).toContain(strings.todayLog.queueBody(1));
        expect(read.text).toMatch(/\d/);
        // Where DESIGN.md section 4 puts it.
        expect(read.underTheTitle, 'the offline line is not under the title').toBe(true);
        expect(read.aboveTheFirstCard, 'the offline line is not above the first card').toBe(true);
        // And what it is not: a notice, and never --warn.
        expect(read.insideTheNoticeRegion, 'the offline line is inside the notice region').toBe(false);
        expect(read.warn, 'the offline line carries the warn treatment').toBe(false);
        expect(read.background, 'the offline line is painted in the warn colour').not.toContain(read.warnToken);

        await page.screenshot({ path: `${CAPTURES}f24-offline-line-${engine}-393x852.png`, fullPage: true });
      },
    );
  }
});

/** What one keystroke did: the key, what the field held after it, where the caret sat. */
type Keystroke = { key: string; value: string; caret: number | null };

/**
 * A number typed the way a person types one, one key at a time.
 *
 * THIS IS THE TEST AND NOT A DETAIL OF IT. This field was proven four times
 * with `page.locator('#quick-log-waist').fill('99.0')`, which sets the whole
 * value in a single input event and never moves a caret, and four green rounds
 * passed over a field that could not be typed into at all: it was controlled on
 * `waist.toFixed(1)`, so `9` re-rendered as `9.0` with the caret pushed past
 * the decimal, the next `9` landed in the tenths, and `99.0` arrived as `9.1`
 * in Chrome and in WebKit alike. A field is typed into, so the test types.
 *
 * The trace comes back rather than the final value, because what has to be true
 * is true after every keystroke and not only at the end.
 */
async function typeIntoTheWaist(
  page: import('@playwright/test').Page,
  keys: string[],
): Promise<Keystroke[]> {
  const field = page.locator('#quick-log-waist');
  const trace: Keystroke[] = [];
  for (const key of keys) {
    await field.press(key);
    const read = await field.evaluate((node) => ({
      value: (node as HTMLInputElement).value,
      caret: (node as HTMLInputElement).selectionStart,
    }));
    trace.push({ key, ...read });
  }
  return trace;
}

/** The trace as one line per keystroke, in the shape the defect was reported in. */
function traceLines(engine: Engine, what: string, trace: Keystroke[]): string {
  return trace
    .map((step) => `F23  ${engine.padEnd(6)} ${what} "${step.key}" -> "${step.value}" caret ${step.caret}`)
    .join('\n');
}

/**
 * Every character typed so far, and nothing else, after every keystroke.
 *
 * The assertion the old evidence could not make. `expect(trace.map(...))` over
 * the whole run rather than one check at the end: `9.1` is a correct final
 * value for somebody who typed `9.1`, and the defect was that `99.0` produced
 * it.
 */
function typedSoFar(text: string): string[] {
  return [...text].map((_, index) => text.slice(0, index + 1));
}

/**
 * F23's first-ever waist, on an installation that has never held one, and the
 * two things screen 03 frame 3 draws for it.
 *
 * This is the state that un-ticked F23: the stepper is relative, it had nothing
 * to be relative to, and it stepped from zero. Sixty taps to the bottom of the
 * stored band, a hundred and ninety-seven to 99.0, against a line that says six.
 */
test('F23 and C5. a first-ever waist commits in six taps or fewer, from a blank field and not from zero', async () => {
  for (const engine of ENGINES) {
    // Rebuilt per engine, because the first pass stores a waist and the state
    // being graded is an installation that has never held one. Sharing the
    // database between the two would have measured the first-ever screen once
    // and the ordinary one after it, which is the shape of evidence that proves
    // less than it says.
    testStackWithDemoMode('0', 'reset');
    await waitForScratch();
    await ensureScratchOwner();
    expect(scratchQuery("select count(*) from measurement where metric = 'waist'")).toBe('0');
    const jar = await scratchSession();

    await inEngine(
      engine,
      { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, serviceWorkers: 'block' },
      async (page, context) => {
        await context.addCookies(cookiesFor(jar));
        await page.goto(`${scratchUrl}/`);
        await page.waitForLoadState('networkidle');

        let taps = 0;
        await page.getByRole('button', { name: 'Quick log', exact: true }).click();
        taps += 1;
        await expect(page.getByRole('dialog', { name: 'Quick log' })).toBeVisible();

        // Screen 03 frame 3, drawn: the dashed card, the sentence, and a value
        // that is `--` and not a number.
        const empty = page.locator('.sheet .card.empty[data-state="empty"]');
        await expect(empty).toBeVisible();
        console.log(`F23  ${engine.padEnd(6)} the empty card reads: ${(await empty.textContent())?.trim()}`);
        expect(await empty.textContent()).toContain(strings.quickLog.waistEmptyTitle);
        expect(await empty.textContent()).toContain(strings.quickLog.waistEmptyBody);

        const field = page.locator('#quick-log-waist');
        expect(await field.inputValue(), 'the first-ever waist starts at a number').toBe('');
        expect(await field.getAttribute('placeholder')).toBe(strings.quickLog.waistBlank);
        console.log(
          `F23  ${engine.padEnd(6)} the value reads "${await field.getAttribute('placeholder')}" and holds ` +
            `"${await field.inputValue()}", which is blank and not zero`,
        );

        // Neither hand of the stepper offers to move a value that is not there,
        // which is the whole of defect 60: one tap used to queue 0.5 cm and the
        // screen reported it as saved, for a value the band refuses under 30.
        await expect(page.getByRole('button', { name: 'Up half a centimetre' })).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Down half a centimetre' })).toBeDisabled();
        console.log(`F23  ${engine.padEnd(6)} both stepper controls are refused while the field is blank`);

        // And the footer says so in the sheet's own words.
        const footer = page.locator('.sheetfoot .note');
        expect(await footer.textContent()).toContain(strings.quickLog.blankNote);

        await page.screenshot({ path: `${CAPTURES}f23-first-ever-waist-${engine}-393x852.png`, fullPage: true });

        // AND IT IS A TARGET. It shipped 133x40 under DESIGN.md section 2b's
        // 44 px floor, because the sheet draws the value as a display and the
        // build made it a field. 52 px is the quick log's own escalation.
        const box = (await field.boundingBox())!;
        console.log(
          `C5   ${engine.padEnd(6)} the waist field measures ${Math.round(box.width)}x${Math.round(box.height)} px`,
        );
        expect(Math.round(box.height), 'the waist field is under the 44 px floor').toBeGreaterThanOrEqual(44);

        // Tap two: the field. Then the number, and the number is TYPED, one
        // character at a time. The keys are not taps on a control and the count
        // is the same three it always was: raise, field, Save.
        await field.click();
        taps += 1;
        const first = await typeIntoTheWaist(page, ['9', '9', '.', '0']);
        console.log(traceLines(engine, 'first-ever', first));
        expect(
          first.map((step) => step.value),
          'typing 99.0 into an empty field did not produce 99.0',
        ).toEqual(typedSoFar('99.0'));
        expect(
          first.map((step) => step.caret),
          'the caret was moved by something other than the owner',
        ).toEqual([1, 2, 3, 4]);

        await page.getByRole('button', { name: 'Save', exact: true }).click();
        taps += 1;

        console.log(`F23  ${engine.padEnd(6)} a first-ever waist committed in ${taps} taps from Today`);
        expect(taps).toBeLessThanOrEqual(6);

        await expect
          .poll(() => scratchQuery("select count(*) from measurement where metric = 'waist' and source = 'manual'"), {
            timeout: 20_000,
          })
          .toBe('1');

        const stored = scratchQuery(
          "select raw_value || ' ' || unit from measurement where metric = 'waist' order by measured_at desc limit 1",
        );
        console.log(`F23  ${engine.padEnd(6)} stored: ${stored}`);
        expect(stored).toBe('99.0 cm');

        // The stepper works from there, which is the other half of the design:
        // the first number is typed and every one after it is stepped.
        await page.getByRole('button', { name: 'Quick log', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Up half a centimetre' })).toBeEnabled();
        await page.getByRole('button', { name: 'Up half a centimetre' }).click();
        expect(await page.locator('#quick-log-waist').inputValue()).toBe('99.5');
        console.log(`F23  ${engine.padEnd(6)} with a measurement on file one tap moves it to 99.5`);

        // AND A CORRECTION TO A NUMBER ALREADY IN THE FIELD, which is what the
        // second and every later tape reading is. Backspace first, because the
        // keypad this field raises on a phone has one and no select-all: each
        // delete used to be reformatted the same way each keystroke was, so
        // `99.` came straight back as `99.0` and the field could not be emptied
        // either.
        //
        // The tap lands past the last digit, at the right edge of a
        // right-aligned field, which is where a thumb goes to correct a number
        // and which is what puts the caret after it. A value the stepper wrote
        // leaves the caret at 0, and four backspaces at 0 delete nothing: real,
        // measured in both engines, and a tap is how a person gets past it.
        const field2 = (await field.boundingBox())!;
        await field.click({ position: { x: field2.width - 4, y: field2.height / 2 } });
        const caretAfterTap = await field.evaluate((node) => (node as HTMLInputElement).selectionStart);
        console.log(`F23  ${engine.padEnd(6)} a tap at the right edge puts the caret at ${caretAfterTap}`);
        expect(caretAfterTap, 'a tap past the last digit did not put the caret after it').toBe(4);

        const cleared = await typeIntoTheWaist(page, ['Backspace', 'Backspace', 'Backspace', 'Backspace']);
        console.log(traceLines(engine, 'clearing  ', cleared));
        expect(
          cleared.map((step) => step.value),
          'the field could not be emptied one character at a time',
        ).toEqual(['99.', '99', '9', '']);

        const corrected = await typeIntoTheWaist(page, ['9', '1', '.', '4']);
        console.log(traceLines(engine, 'correction', corrected));
        expect(
          corrected.map((step) => step.value),
          'typing 91.4 over an existing value did not produce 91.4',
        ).toEqual(typedSoFar('91.4'));

        await page.screenshot({ path: `${CAPTURES}f23-typed-correction-${engine}-393x852.png`, fullPage: true });
        await page.getByRole('button', { name: 'Save', exact: true }).click();

        await expect
          .poll(
            () =>
              scratchQuery(
                "select raw_value from measurement where metric = 'waist' order by measured_at desc limit 1",
              ),
            { timeout: 20_000 },
          )
          .toBe('91.4');
        console.log(
          `F23  ${engine.padEnd(6)} the corrected reading stored as ` +
            `${scratchQuery("select raw_value || ' ' || unit || ' ' || source from measurement where metric = 'waist' order by measured_at desc limit 1")}, ` +
            `over ${scratchQuery("select count(*) from measurement where metric = 'waist'")} waist rows, ` +
            'both kept, because this table appends',
        );
      },
    );
  }

  // Put the instance back the way the rest of the suite expects it.
  testStackWithDemoMode('1', 'reset');
  await waitForScratch();
});

/**
 * C5. The snapshot read is not allowed to correct the owner.
 *
 * The sheet reads `/api/log` when it opens and fills the waist field with the
 * last stored measurement, and the field is live and editable while that read
 * is in the air, with a skeleton card drawn beside it and nothing saying a
 * value is on its way. So a number typed into it was silently replaced when the
 * answer landed: 91.4 became 98.5, in both engines.
 *
 * `03-quick-log.html` frame 2 captions itself "No spinner, no retry loop, no
 * lost typing", and this is the third of those. What the owner put in the field
 * outranks anything the network has to say about it, however much later it
 * arrives.
 *
 * The read is held for three and a half seconds, which is a slow tailnet and
 * not a fiction: the same delay the C5 loading state is captured at.
 */
test('C5. a waist typed while the snapshot read is in flight survives the answer landing', async () => {
  const TYPED = '91.4';

  for (const engine of ENGINES) {
    // Rebuilt per engine, so both read the same rows and neither inherits the
    // other's writes. Without it the second engine would find the first
    // engine's 91.4 on file and pass whatever the sheet did with it.
    testStackWithDemoMode('1', 'reset');
    await waitForScratch();
    await ensureScratchOwner();

    const onFile = scratchQuery(
      "select raw_value from measurement where metric = 'waist' order by measured_at desc limit 1",
    );
    console.log(`C5   ${engine.padEnd(6)} the last stored waist is ${onFile} cm, and ${TYPED} is typed over it`);
    expect(onFile, 'there is no stored measurement for the read to overwrite the typing with').toMatch(/\d/);
    expect(onFile, 'the number typed is the number on file, so this test cannot fail').not.toBe(TYPED);
    const jar = await scratchSession();

    await inEngine(
      engine,
      { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, serviceWorkers: 'block' },
      async (page, context) => {
        await context.addCookies(cookiesFor(jar));
        // The read, held in the air. The write is not: Save has to reach the
        // origin in the same walk, and holding both would be measuring the
        // queue instead of the field.
        await context.route('**/api/log', async (route) => {
          if (route.request().method() !== 'GET') return route.continue();
          await new Promise((resolve) => setTimeout(resolve, 3500));
          await route.continue().catch(() => undefined);
        });
        await page.goto(`${scratchUrl}/`);
        await page.waitForLoadState('load');

        await page.getByRole('button', { name: 'Quick log', exact: true }).click();
        await expect(page.getByRole('dialog', { name: 'Quick log' })).toBeVisible();
        // The state the defect lives in: the skeleton is up and the field is
        // live beside it.
        await expect(page.locator('.sheet [data-state="loading"]')).toBeVisible();

        const typed = await typeIntoTheWaist(page, [...TYPED]);
        console.log(traceLines(engine, 'mid-read  ', typed));
        expect(typed.map((step) => step.value), 'the field could not be typed into while loading').toEqual(
          typedSoFar(TYPED),
        );
        await page.screenshot({ path: `${CAPTURES}c5-typed-during-read-${engine}-393x852.png`, fullPage: true });

        // The answer lands. Waited for by the response and then by the thing
        // the answer draws, because the field is filled from the same handler
        // that draws it.
        await page.waitForResponse(
          (response) =>
            response.url().includes('/api/log') && response.request().method() === 'GET' && response.ok(),
          { timeout: 20_000 },
        );
        // The waist block's own note, "Last 98.5 cm, 19 Aug", and not the
        // sheet header's date, which is also a `.note.num`.
        const lastMeasured = page.locator('.sheet .field-block .note.num');
        await expect(lastMeasured).toBeVisible();
        const lastLine = (await lastMeasured.textContent())?.trim();

        const held = await page.locator('#quick-log-waist').inputValue();
        console.log(
          `C5   ${engine.padEnd(6)} the read landed saying "${lastLine}" and the field still reads ${held}`,
        );
        expect(held, 'the snapshot replaced what the owner had typed').toBe(TYPED);
        await page.screenshot({ path: `${CAPTURES}c5-read-landed-${engine}-393x852.png`, fullPage: true });

        // And it is the typed number that commits, through the shipped Save.
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect
          .poll(
            () =>
              scratchQuery(
                "select raw_value from measurement where metric = 'waist' and source = 'manual' order by measured_at desc limit 1",
              ),
            { timeout: 20_000 },
          )
          .toBe(TYPED);
        console.log(`C5   ${engine.padEnd(6)} and ${TYPED} is what reached the database`);
      },
    );
  }

  // Put the instance back the way the rest of the suite expects it.
  testStackWithDemoMode('1', 'reset');
  await waitForScratch();
});
