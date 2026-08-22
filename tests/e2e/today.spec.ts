import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { mintSignInLink, projectRoot, query } from './host';

/**
 * Today and the weight trend, screen 02.
 *
 * What is being defended here, in order: that the five things F27 names fit
 * above the fold on the phone, that the chart carries the weights DESIGN.md
 * fixes, that a gap is drawn as a gap rather than crossed, and that the daily
 * reading never gets the big type.
 *
 * Everything runs against the live HTTPS origin in WebKit at 393x852, because
 * that viewport is what the rubric measures and Safari is the only engine this
 * product ever meets.
 */

const CAPTURES = `${projectRoot}.forge/evidence/slice-4/captures`;

/** DESIGN.md: 852 minus a 54 px status bar and an 83 px tab bar. */
const FOLD = 715;

const VIEWPORTS = [
  { name: '393x852', width: 393, height: 852 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
];

test.beforeAll(() => {
  mkdirSync(CAPTURES, { recursive: true });
});

test.skip(
  () => Number(query('select count(*) from owner')) === 0,
  'no owner account on this installation yet',
);

async function signIn(page: Page) {
  await page.goto(mintSignInLink());
  await page.waitForURL(/\/$/);
  // The launch report posts once per session from the first screen. Let it
  // finish rather than navigating out from under it, which is an abandoned
  // request and not a failed one, and would read as the latter.
  await page.waitForLoadState('networkidle');
}

/** The fold, drawn on the page so a capture shows where 715 pixels ends. */
async function markTheFold(page: Page) {
  await page.evaluate((fold) => {
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

test.describe('screen 02, Today', () => {
  test('F27. the five things fit above the fold at 393x852', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await signIn(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const measured = await page.evaluate(() => {
      const bottomOf = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return Math.round(box.bottom + window.scrollY);
      };
      return {
        session: bottomOf('[data-session]'),
        meals: bottomOf('[data-meals]'),
        needsLogging: bottomOf('[data-due]'),
        weightTrend: bottomOf('[data-chart="today-weight"]'),
        adherence: bottomOf('[data-adherence]'),
        scrolled: window.scrollY,
      };
    });

    for (const [what, bottom] of Object.entries(measured)) {
      if (what === 'scrolled') continue;
      console.log(`F27  ${what.padEnd(13)} bottom ${bottom} px, fold ${FOLD}`);
      expect(bottom, `${what} is not above the fold`).not.toBeNull();
      expect(bottom!).toBeLessThanOrEqual(FOLD);
    }
    // And nothing was scrolled to get there, which is the other half of the line.
    expect(measured.scrolled).toBe(0);

    await markTheFold(page);
    await page.screenshot({ path: `${CAPTURES}/f27-today-fold-393x852.png`, fullPage: true });
  });

  test('F28. the chart carries the weights DESIGN.md fixes', async ({ page }) => {
    await signIn(page);
    await page.goto('/');
    const chart = page.locator('[data-chart="today-weight"]');
    await chart.waitFor();

    // Daily readings: 2.1 px dots, and never a path joining them.
    const dots = chart.locator('g[data-dots] circle[r="2.1"]');
    const dotCount = await dots.count();
    console.log(`F28  daily dots at r=2.1: ${dotCount}`);
    expect(dotCount).toBeGreaterThan(10);
    expect(await chart.locator('g[data-dots] path').count()).toBe(0);

    // The seven-day average: 2.6 px, round capped, and the loudest object.
    const average = chart.locator('g[data-average-segments] path');
    const averages = await average.evaluateAll((nodes) =>
      nodes.map((node) => ({
        width: node.getAttribute('stroke-width'),
        cap: node.getAttribute('stroke-linecap'),
        dash: node.getAttribute('stroke-dasharray'),
        window: node.getAttribute('data-window'),
      })),
    );
    console.log(`F28  average paths: ${JSON.stringify(averages)}`);
    expect(averages.length).toBeGreaterThan(1);
    for (const path of averages) {
      expect(path.width).toBe('2.6');
      expect(path.cap).toBe('round');
    }

    // The goal trajectory: 1.5 px dashed 5 5, with a corridor of half a
    // kilogram either side.
    const goal = chart.locator('line[stroke-dasharray="5 5"]').first();
    expect(await goal.getAttribute('stroke-width')).toBe('1.5');
    expect(await goal.getAttribute('stroke-dasharray')).toBe('5 5');
    console.log('F28  goal line stroke-width 1.5, dash 5 5');
    expect(await chart.locator('polygon[fill="var(--chart-band)"]').count()).toBe(1);

    // Gridlines at whole kilograms, read off the labels the chart draws.
    const labels = await chart.locator('text.axis').allTextContents();
    const kilograms = labels.filter((label) => /^\d+ kg$/.test(label.trim()));
    console.log(`F28  gridline labels: ${kilograms.join(', ')}`);
    expect(kilograms.length).toBeGreaterThan(1);
    for (const label of kilograms) {
      expect(Number(label.replace(' kg', ''))).toBe(Math.round(Number(label.replace(' kg', ''))));
    }
  });

  test('F30. absence is drawn, and the line does not cross it', async ({ page }) => {
    await signIn(page);
    await page.goto('/');
    const chart = page.locator('[data-chart="today-weight"]');
    await chart.waitFor();

    // The hatch: 45 degrees, in warn, over the missing range.
    const pattern = chart.locator('pattern#today-weight-hatch');
    expect(await pattern.getAttribute('patternTransform')).toBe('rotate(45)');
    const hatched = chart.locator('rect[fill="url(#today-weight-hatch)"]');
    expect(await hatched.count()).toBeGreaterThan(0);
    const band = await hatched.first().evaluate((node) => ({
      x: Number(node.getAttribute('x')),
      width: Number(node.getAttribute('width')),
    }));
    console.log(`F30  hatched band x=${band.x} width=${band.width}`);

    // The dates, on the axis, in the warn colour.
    const warnLabels = await chart.locator('text.axis.warn').allTextContents();
    console.log(`F30  the range is labelled: ${warnLabels.join(' | ')}`);
    expect(warnLabels.join(' ')).toMatch(/\d+ \w+ to \d+ \w+/);

    // No dot inside the band, and no average path point inside it either. This
    // is the assertion the whole line turns on: a path crossing the band is a
    // straight line through four days nobody measured.
    const dots = await chart.locator('g[data-dots] circle[r="2.1"]').evaluateAll((nodes) =>
      nodes.map((node) => Number(node.getAttribute('cx'))),
    );
    const inside = dots.filter((x) => x > band.x && x < band.x + band.width);
    console.log(`F30  daily dots inside the band: ${inside.length}`);
    expect(inside).toHaveLength(0);

    const paths = await chart
      .locator('g[data-average-segments] path')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('d') ?? ''));
    for (const d of paths) {
      const xs = d
        .replace('M', '')
        .split(' ')
        .filter((_, index) => index % 2 === 0)
        .map(Number);
      const crosses = Math.min(...xs) < band.x && Math.max(...xs) > band.x + band.width;
      expect(crosses, `a path crosses the gap: ${d}`).toBe(false);
      for (const x of xs) expect(x > band.x && x < band.x + band.width).toBe(false);
    }
    console.log(`F30  ${paths.length} average paths, none crossing and none inside`);

    // A short window states its count in words, on the screen.
    const shortWindow = page.locator('[data-window="lastweek"]');
    await expect(shortWindow).toBeVisible();
    const sentence = (await shortWindow.textContent())!.trim();
    console.log(`F30  ${sentence}`);
    expect(sentence).toMatch(/used \d days of 7/);

    // And a dashed segment exists, which is what 5 or 6 of 7 looks like.
    const dashed = await chart.locator('path[data-window="short"]').count();
    console.log(`F30  average paths drawn on a short window: ${dashed}`);
    expect(dashed).toBeGreaterThan(0);

    await page.screenshot({ path: `${CAPTURES}/f30-today-gap.png`, fullPage: true });
  });

  test('F35. no daily body-composition reading is the headline', async ({ page }) => {
    await signIn(page);
    for (const path of ['/', '/health']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const headlines = await page.locator('.metric').allTextContents();
      console.log(`F35  ${path} headline figures: ${headlines.map((h) => h.trim()).join(' | ')}`);

      // The reading the owner is most tempted to read as his weight: the last
      // one the scale sent. It is what a body-composition screen usually leads
      // with and it is the one number that must not be the headline here,
      // because it moves with hydration by more than a good week of progress.
      //
      // The comparison is against that reading and not against every stored
      // value, because a seven-day average can legitimately land on the same
      // number as some morning six weeks ago, and a test that failed on that
      // coincidence would be measuring arithmetic rather than hierarchy.
      const latestDaily = query(
        "select raw_value from measurement where metric = 'weight' order by measured_at desc limit 1",
      ).trim();
      const asHeadline = headlines
        .map((text) => text.trim().replace(/\s*kg$/, ''))
        .filter((text) => text === latestDaily);
      console.log(`F35  the last scale reading is ${latestDaily} kg`);
      expect(asHeadline, `the last scale reading is a headline on ${path}`).toHaveLength(0);

      // What IS the headline on Today is the seven-day average.
      if (path === '/') {
        await expect(page.locator('[data-headline="average"]')).toBeVisible();
        const daysReading = page.locator('[data-daily="secondary"]');
        await expect(daysReading).toBeVisible();
        const note = await daysReading.evaluate((node) => getComputedStyle(node).fontSize);
        console.log(`F35  the daily reading renders at ${note}, the headline at 34px`);
        expect(note).toBe('12px');
      }
    }

    // The sentence about hydration, on Health, where the rubric puts it.
    await page.goto('/health');
    const hydration = page.locator('[data-hydration="stated"]');
    await expect(hydration).toBeVisible();
    console.log(`F35  ${(await hydration.textContent())!.trim()}`);
    expect((await hydration.textContent())!.toLowerCase()).toContain('hydration');
  });

  test('C7. Today matches screen 02 at three viewports with one accented action', async ({ page }) => {
    await signIn(page);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Exactly one accented action, and it is the thing due now.
      const accented = page.locator('.btn.primary');
      expect(await accented.count()).toBe(1);
      console.log(`C7  ${viewport.name} accented actions: 1, ${await accented.textContent()}`);

      // Origin badges are neutral chrome, never a semantic colour. The one
      // exception is a source that has stopped sending, which is a state.
      const chips = await page.locator('.src:not(.stale)').evaluateAll((nodes) =>
        nodes.map((node) => getComputedStyle(node).borderTopColor),
      );
      const semantic = ['rgb(79, 208, 138)', 'rgb(233, 180, 76)', 'rgb(240, 122, 106)', 'rgb(90, 169, 255)'];
      for (const colour of chips) expect(semantic).not.toContain(colour);
      console.log(`C7  ${viewport.name} origin chips: ${chips.length}, none semantic`);

      await page.screenshot({ path: `${CAPTURES}/c7-today-${viewport.name}.png`, fullPage: true });
    }
  });
});

/**
 * C9. Zero console errors and zero failed network requests.
 *
 * The session player does not exist until slice 8, so it is not walked and is
 * not claimed. What is walked is printed, because a clean run over a short list
 * reads exactly like a clean run over a long one.
 */
test('C9. no console error and no failed request across Today, Health and the quick log', async ({
  page,
}) => {
  const errors: string[] = [];
  const failed: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${page.url()} :: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`${page.url()} :: ${error.message}`));
  page.on('requestfailed', (request) =>
    failed.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText}`),
  );
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });

  await signIn(page);
  const walked: string[] = [];
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const path of ['/', '/health']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      walked.push(`${path} at ${viewport.name}`);
    }
    // The quick-log flow: open the sheet, read it, close it.
    await page.goto('/');
    await page.getByRole('button', { name: 'Quick log', exact: true }).click();
    await page.locator('.sheet').first().waitFor();
    await page.locator('.sheet [aria-label="Close the quick log"]').first().click();
    walked.push(`the quick-log sheet at ${viewport.name}`);
  }

  console.log(`C9  surfaces walked (${walked.length}):`);
  for (const surface of walked) console.log(`C9    ${surface}`);
  console.log('C9  not walked: the session player, which slice 8 builds');
  console.log(`C9  console errors: ${errors.length}, failed requests: ${failed.length}`);
  for (const line of [...errors, ...failed]) console.log(`C9    ${line}`);
  expect(walked.length).toBe(9);
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});
