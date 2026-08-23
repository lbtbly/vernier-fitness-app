import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { mintSignInLink, projectRoot, query } from './host';
import { strings } from '@/lib/strings';

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

/** What the chart's own table prints on a day with nothing in it. */
const NO_READING = strings.trend.noReading;

/** DESIGN.md section 4, and src/lib/trend.ts: three days with nothing is a gap. */
const GAP_DAYS = 3;

/** The rolling window, and the count below which it is not drawn at all. */
const AVERAGE_WINDOW = 7;
const AVERAGE_MINIMUM = 5;

/** Every run of empty days three long or more, taken from a chart's own table. */
function runsOfAbsence(hasReading: boolean[], minimum = GAP_DAYS) {
  const runs: Array<{ from: number; to: number }> = [];
  let start = -1;
  hasReading.forEach((held, index) => {
    if (!held) {
      if (start === -1) start = index;
      return;
    }
    if (start !== -1 && index - start >= minimum) runs.push({ from: start, to: index - 1 });
    start = -1;
  });
  if (start !== -1 && hasReading.length - start >= minimum) {
    runs.push({ from: start, to: hasReading.length - 1 });
  }
  return runs;
}

/**
 * How many of the seven days ending at `index` carried a reading, or -1 where
 * the window runs off the front of the table and the chart has no window to
 * draw on at all.
 */
function windowCount(days: Array<{ value: string }>, index: number, absent: string): number {
  let held = 0;
  for (let step = 0; step < AVERAGE_WINDOW; step += 1) {
    const at = index - step;
    if (at < 0) return -1;
    if (days[at].value !== absent) held += 1;
  }
  return held;
}

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
  /**
   * F27 on the owner's own installation, at the state his own data is in.
   *
   * The amended line's five states, its per-element maxima and its sum are
   * graded in tests/e2e/notices.spec.ts, on the scratch instance, because two of
   * the five cannot be reached here on demand and one of them means writing rows
   * into a table that refuses DELETE. What this test holds is the same line
   * against the install that matters: the four things it names inside 715 px
   * with nothing scrolled, adherence below the trend, and the fold met at
   * section 3's card geometry rather than bought by squeezing it.
   */
  test('F27. the four things fit above the fold at 393x852, with adherence below the trend', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await signIn(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const measured = await page.evaluate(() => {
      const boxOf = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { top: Math.round(box.top + window.scrollY), bottom: Math.round(box.bottom + window.scrollY) };
      };
      const day = document.querySelector('.card.day')!;
      const style = getComputedStyle(day);
      return {
        session: boxOf('[data-session]'),
        meals: boxOf('[data-meals]'),
        needsLogging: boxOf('[data-due]'),
        weightTrend: boxOf('[data-chart="today-weight"]'),
        adherence: boxOf('[data-adherence]'),
        cardPadding: Number.parseFloat(style.paddingTop),
        cardGap: Number.parseFloat(style.marginBottom),
        scrolled: window.scrollY,
      };
    });

    // The four the line names. Adherence is not one of them any more: A5 struck
    // that clause because three approved artifacts put adherence below the fold
    // and the rubric line that put it above was the odd one out.
    for (const what of ['session', 'meals', 'needsLogging', 'weightTrend'] as const) {
      const box = measured[what];
      console.log(`F27  ${what.padEnd(13)} bottom ${box?.bottom} px, fold ${FOLD}`);
      expect(box, `${what} is not drawn at all`).not.toBeNull();
      expect(box!.bottom, `${what} is not above the fold`).toBeLessThanOrEqual(FOLD);
    }
    // And nothing was scrolled to get there, which is the other half of the line.
    expect(measured.scrolled).toBe(0);

    // "Adherence is never drawn above the weight trend." Screen 02's own order,
    // and the move the old wording made cheapest is a FAIL under the new one.
    console.log(
      `F27  adherence opens at ${measured.adherence?.top} px, the trend ends at ${measured.weightTrend?.bottom} px`,
    );
    expect(measured.adherence, 'adherence is not drawn').not.toBeNull();
    expect(measured.adherence!.top, 'adherence is drawn above the weight trend').toBeGreaterThan(
      measured.weightTrend!.bottom,
    );

    // "The 715 is met at the card padding and the card gap DESIGN.md section 3
    // fixes, measured on the shipped screen."
    console.log(`F27  Today's card padding ${measured.cardPadding} px, card gap ${measured.cardGap} px`);
    expect(measured.cardPadding).toBe(16);
    expect(measured.cardGap).toBe(12);

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

  /**
   * F30, on the owner's own installation, over the series it actually holds.
   *
   * THIS TEST USED TO REQUIRE A HATCHED BAND AND IT CANNOT ANY MORE. The band it
   * looked for came from the four days the demonstration seed leaves empty at
   * anchor offsets 10 to 13. The Withings demonstration import inserts on any
   * day no reading stands on, so on 23 August 2026 it filled all four, keyed
   * demo:4100028:1 to demo:4100031:1, and `measurement` refuses DELETE. The
   * thirty-day window behind Today has held thirty readings ever since. A test
   * that demands a hole on an install where no hole can be made again is a test
   * that fails on the data rather than on the product, and it was the third
   * failure of that shape on this run.
   *
   * `.forge/RULING-DEMO-COLLISION.md` section 5 ruled the move: F30 is not
   * falsified, it is re-observed where a hole can still be seeded, which is
   * tests/e2e/absence-scratch.spec.ts on the scratch instance. The hatch, its
   * angle, its date labels, the break in the line and the dashed short window
   * are all asserted there over a seeded four-day hole.
   *
   * WHAT IS LEFT HERE IS NOT WEAKER, IT IS DIFFERENT. The clause this install
   * can still fail is the one about invention: no interpolated, carried-forward
   * or zero-filled point appears in the rendered path. That is asserted against
   * the chart's own hidden data table, day by day, over a population this test
   * prints before it asserts anything. And the hatch is still graded, both ways:
   * one band per run of absence the table holds, and never a band without one.
   *
   * GOES RED IF: the chart draws a dot on a day the table calls "No reading",
   * draws fewer dots than the table holds readings, hatches a range that is not
   * absent, leaves a run of three absent days unhatched, or draws the average
   * across a window of fewer than five days.
   */
  test('F30. absence is drawn, and the line does not cross it', async ({ page }) => {
    await signIn(page);
    await page.goto('/');
    const chart = page.locator('[data-chart="today-weight"]');
    await chart.waitFor();

    // The population, printed before anything is claimed about it.
    const days = await page
      .locator('[data-chart-table="today-weight"] tbody tr')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          when: node.querySelector('th')?.textContent?.trim() ?? '',
          value: node.querySelector('td')?.textContent?.trim() ?? '',
        })),
      );
    const held = days.filter((day) => day.value !== NO_READING);
    const runs = runsOfAbsence(days.map((day) => day.value !== NO_READING));
    console.log(
      `F30  the chart's own table holds ${days.length} day(s), ${held.length} with a reading, ` +
        `${days.length - held.length} without`,
    );
    console.log(
      `F30  runs of three days or more with nothing in them: ` +
        (runs.length === 0
          ? 'none in this window, and the hatch is graded against that'
          : runs.map((run) => `${days[run.from].when} to ${days[run.to].when}`).join(', ')),
    );
    expect(days.length, 'the chart drew no table, so there is no population to read').toBeGreaterThan(20);
    expect(held.length, 'the window holds no readings at all').toBeGreaterThan(20);

    // The hatch, graded in both directions against that population: one band per
    // run, and never a band without a run. The 45 degrees is a property of the
    // pattern and is asserted whether or not a band uses it today.
    const pattern = chart.locator('pattern#today-weight-hatch');
    expect(await pattern.getAttribute('patternTransform')).toBe('rotate(45)');
    const bands = await chart
      .locator('rect[fill="url(#today-weight-hatch)"]')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          x: Number(node.getAttribute('x')),
          width: Number(node.getAttribute('width')),
        })),
      );
    console.log(`F30  hatched bands: ${bands.length} for ${runs.length} run(s) of absence`);
    expect(bands.length, 'the hatch and the holes in the table disagree').toBe(runs.length);
    for (const run of runs) {
      const label = strings.stale.affectedRange(days[run.from].when, days[run.to].when);
      console.log(`F30  the range is labelled: ${label}`);
      expect(await chart.locator('text.axis.warn').allTextContents()).toContain(label);
    }

    // AND THE TABLE IS CHECKED AGAINST THE DATABASE, not against the chart.
    //
    // The hidden table and the dots are both built from the same `days` array,
    // so counting one against the other would prove that a component agrees
    // with itself. What F30's clause about interpolated, carried-forward and
    // zero-filled points actually asserts is that the screen holds no reading
    // the database does not: so the days holding a stored weight are counted in
    // Postgres, over the same thirty-day window `windowDays` builds, and the
    // screen has to hold exactly that many.
    const storedDays = Number(
      query(`select count(distinct (measured_at at time zone 'Europe/Paris')::date)
             from measurement
             where metric = 'weight'
               and (measured_at at time zone 'Europe/Paris')::date
                   > (now() at time zone 'Europe/Paris')::date - 30`).trim(),
    );
    const dots = await chart.locator('g[data-dots] a').evaluateAll((nodes) =>
      nodes.map((node) => ({
        at: node.getAttribute('data-reading') ?? '',
        cx: Number(node.querySelector('circle')?.getAttribute('cx')),
      })),
    );
    console.log(
      `F30  the database holds weight on ${storedDays} of the last 30 days; ` +
        `the table shows ${held.length} and the chart draws ${dots.length} dots`,
    );
    expect(storedDays, 'the window holds no stored weight at all, so nothing here is measured').toBeGreaterThan(20);
    expect(held.length, 'the table shows more or fewer days than the database holds').toBe(storedDays);
    expect(dots.length, 'the chart drew a different number of dots than the database holds days').toBe(
      storedDays,
    );
    expect(new Set(dots.map((dot) => dot.at)).size, 'two dots claim the same day').toBe(dots.length);

    // Nothing inside any band, dots or average vertices alike.
    for (const band of bands) {
      const insideBand = dots.filter((dot) => dot.cx > band.x && dot.cx < band.x + band.width);
      console.log(`F30  daily dots inside the band at x=${band.x}: ${insideBand.length}`);
      expect(insideBand, 'a dot is drawn inside a range the table says is empty').toEqual([]);
    }

    const paths = await chart
      .locator('g[data-average-segments] path')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('d') ?? ''));
    for (const d of paths) {
      const xs = d
        .replace('M', '')
        .split(' ')
        .filter((_, index) => index % 2 === 0)
        .map(Number);
      for (const band of bands) {
        const crosses = Math.min(...xs) < band.x && Math.max(...xs) > band.x + band.width;
        expect(crosses, `a path crosses the gap: ${d}`).toBe(false);
        for (const x of xs) expect(x > band.x && x < band.x + band.width).toBe(false);
      }
    }
    console.log(`F30  ${paths.length} average paths, none crossing and none inside`);

    // The average, against the windows the table itself holds. Below five days
    // of seven it is not drawn at all, so the number of vertices it draws is a
    // fact the table can predict: one per drawable day, less any drawable day
    // that stands alone between two undrawable ones, because a run of one point
    // is not a path. Geometry-free on purpose, so this holds at any viewport.
    const vertices = new Set<number>();
    for (const d of paths) {
      const xs = d
        .replace('M', '')
        .split(' ')
        .filter((_, index) => index % 2 === 0)
        .map(Number);
      for (const x of xs) vertices.add(x);
    }
    const counts = days.map((_, index) => windowCount(days, index, NO_READING));
    const drawable = counts.map((count) => count >= AVERAGE_MINIMUM);
    const alone = drawable.filter(
      (yes, index) => yes && !drawable[index - 1] && !drawable[index + 1],
    ).length;
    const expected = drawable.filter(Boolean).length - alone;
    console.log(
      `F30  windows under five days: ${counts.filter((count) => count >= 0 && count < AVERAGE_MINIMUM).length}, ` +
        `at five or six: ${counts.filter((count) => count === 5 || count === 6).length}, ` +
        `whole: ${counts.filter((count) => count === AVERAGE_WINDOW).length}`,
    );
    console.log(`F30  the average draws ${vertices.size} vertices where the table predicts ${expected}`);
    expect(
      vertices.size,
      'the average is drawn on more days than the table has windows of five or more',
    ).toBe(expected);

    await page.screenshot({ path: `${CAPTURES}/f30-today-absence.png`, fullPage: true });
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
