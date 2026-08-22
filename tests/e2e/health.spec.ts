import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { mintSignInLink, projectRoot, query } from './host';

/**
 * Health, screen 04, and the two lines that only this screen can prove: the
 * goal is editable and the trajectory redraws, and a point on a chart walks
 * back to the record it came from in two taps.
 *
 * The goal edit writes to the owner's own installation, through the shipped
 * form, because that is the route the rubric describes and the only route a
 * person has. The spec puts it back afterwards and checks that it went back.
 */

const CAPTURES = `${projectRoot}.forge/evidence/slice-4/captures`;

const VIEWPORTS = [
  { name: '393x852', width: 393, height: 852 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
];

test.describe.configure({ mode: 'serial' });

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
  await page.waitForLoadState('networkidle');
}

/** Where the goal line ends on the right of the body chart, to one decimal. */
async function trajectoryEnd(page: Page): Promise<number> {
  return Number(
    await page
      .locator('[data-chart="health-body"] line[stroke-dasharray="5 5"]')
      .first()
      .getAttribute('y2'),
  );
}

test.describe('screen 04, Health', () => {
  test('F31. weight and waist share one axis, and a point reaches its source in two taps', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/health');
    const chart = page.locator('[data-chart="health-body"]');
    await chart.waitFor();

    // One svg, one time axis, two series. Sharing the axis is what makes the
    // four silent days cut through both bands in the same place.
    const weightDots = chart.locator('g[data-dots] circle[r="2.1"]');
    const waistPoints = chart.locator('g[data-points] circle[r="2.6"], g[data-points] circle[r="3.8"]');
    console.log(
      `F31  one chart holds ${await weightDots.count()} weight readings and ${await waistPoints.count()} waist readings`,
    );
    expect(await weightDots.count()).toBeGreaterThan(10);
    expect(await waistPoints.count()).toBeGreaterThan(1);
    expect(await page.locator('[data-chart="health-body"]').count()).toBe(1);

    // The gap cuts both bands: two hatched rectangles from one gap, one in each
    // band, at the same x.
    const bands = await chart.locator('rect[fill="url(#health-body-hatch)"]').evaluateAll((nodes) =>
      nodes.map((node) => ({ x: node.getAttribute('x'), y: node.getAttribute('y') })),
    );
    console.log(`F31  hatched bands: ${JSON.stringify(bands)}`);
    expect(bands.length).toBe(2);
    expect(bands[0].x).toBe(bands[1].x);
    expect(bands[0].y).not.toBe(bands[1].y);

    // Tap 1: a point on the waist series opens its value sheet.
    await waistPoints.last().click();
    await page.waitForURL(/\/value\//);
    const valueUrl = page.url();
    console.log(`F31  tap 1 reached ${valueUrl.replace(/^https:\/\/[^/]+/, '')}`);
    // The value sheet, arrived at: the stored number, its correction history
    // and the second tap all on it.
    await expect(page.locator('.sheet-head .metric')).toBeVisible();
    await expect(page.getByText('Correction history', { exact: true })).toBeVisible();

    // Tap 2: the source record that carried it.
    await page.getByRole('link', { name: 'Open the source', exact: true }).click();
    await page.waitForURL(/\/source\//);
    console.log(`F31  tap 2 reached ${page.url().replace(/^https:\/\/[^/]+/, '')}`);
    await expect(page.getByText('Rows from this record', { exact: true })).toBeVisible();

    // And the same walk from a weight dot, because F31 says either.
    await page.goto('/health');
    await chart.locator('g[data-dots] a').last().click();
    await page.waitForURL(/\/value\//);
    console.log(`F31  a weight dot reached ${page.url().replace(/^https:\/\/[^/]+/, '')}`);
    await page.getByRole('link', { name: 'Open the source', exact: true }).click();
    await page.waitForURL(/\/source\//);
    console.log(`F31  and its source ${page.url().replace(/^https:\/\/[^/]+/, '')}`);
  });

  test('F32. five signals render their value, and none of them renders zero', async ({ page }) => {
    await signIn(page);
    await page.goto('/health');
    await page.waitForLoadState('networkidle');

    const present: Record<string, string> = {};
    for (const [name, selector] of [
      ['steps', '[data-card="activity"] .metric'],
      ['sleep', '[data-card="sleep"] .metric'],
      ['resting heart rate', '[data-card="heart"] .metric'],
      ['recovery', '[data-signal="recovery"] .num'],
      ['VO2 max', '[data-signal="vo2"] .num'],
    ] as const) {
      const value = (await page.locator(selector).first().textContent())!.trim();
      present[name] = value;
      expect(value).not.toBe('0');
      expect(value).not.toBe('');
    }
    console.log(`F32  present: ${JSON.stringify(present)}`);
    expect(Object.keys(present)).toHaveLength(5);

    await page.screenshot({ path: `${CAPTURES}/f32-health-signals-present.png`, fullPage: true });
  });

  test('F33. adherence is a count over its denominator and matches the seed', async ({ page }) => {
    await signIn(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    for (const days of [7, 28]) {
      const onScreen = (
        await page.locator(`[data-adherence-window="${days}"]`).textContent()
      )!.trim();
      // The hand computation, off the rows the demonstration seed wrote.
      const planned = query(
        `select count(*) from planned_session where planned_for >= date_trunc('day', now()) - interval '${days - 1} days'`,
      ).trim();
      const completed = query(
        `select count(*) from planned_session where state = 'completed' and planned_for >= date_trunc('day', now()) - interval '${days - 1} days'`,
      ).trim();
      console.log(`F33  ${days} days: screen "${onScreen}", database ${completed} of ${planned}`);
      expect(onScreen).toBe(`${completed} of ${planned}`);
      // A count and not a percentage: the denominator is on the screen.
      expect(onScreen).toMatch(/^\d+ of \d+$/);
      expect(Number(planned)).toBeGreaterThan(0);
    }
  });

  test('C8. every chart carries a hidden table, a title and a description', async ({ page }) => {
    await signIn(page);
    const seen: string[] = [];
    for (const path of ['/', '/health']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const charts = await page.locator('svg.chart').evaluateAll((nodes) =>
        nodes.map((node) => {
          const id = node.getAttribute('data-chart') ?? '';
          const table = node.parentElement?.querySelector('table');
          return {
            id,
            role: node.getAttribute('role'),
            labelledBy: node.getAttribute('aria-labelledby'),
            title: node.querySelector('title')?.textContent ?? '',
            desc: node.querySelector('desc')?.textContent ?? '',
            rows: table ? table.querySelectorAll('tbody tr').length : 0,
            columns: table ? table.querySelectorAll('thead th').length : 0,
            caption: table?.querySelector('caption')?.textContent ?? '',
          };
        }),
      );
      expect(charts.length).toBeGreaterThan(0);
      for (const chart of charts) {
        console.log(
          `C8  ${path} ${chart.id}: role=${chart.role}, ${chart.rows} data rows in ${chart.columns} columns`,
        );
        console.log(`C8      title: ${chart.title}`);
        console.log(`C8      desc:  ${chart.desc}`);
        expect(chart.role).toBe('img');
        expect(chart.labelledBy).toBe(`${chart.id}-title ${chart.id}-desc`);
        expect(chart.title.length).toBeGreaterThan(10);
        expect(chart.desc.length).toBeGreaterThan(30);
        expect(chart.rows).toBeGreaterThan(5);
        expect(chart.caption.length).toBeGreaterThan(10);
        seen.push(`${path} ${chart.id}`);
      }
    }
    console.log(`C8  charts walked: ${seen.length} (${seen.join(', ')})`);
    expect(seen.length).toBeGreaterThanOrEqual(5);

    // What a screen reader is handed, as the accessibility tree sees it: rows
    // of dates and values, not one summary string. A day with no reading is a
    // row saying so, which is the whole point of drawing absence.
    await page.goto('/health');
    await page.waitForLoadState('networkidle');
    await page.locator('[data-chart="health-body"]').waitFor();
    const table = page.locator('[id="health-body-table"]');

    // First: the three things that would take this table OUT of the
    // accessibility tree, and none of them is true of it. `display: none`,
    // `visibility: hidden` and `aria-hidden` are what actually hide content
    // from a screen reader; a clip path is not, which is the whole reason the
    // visually-hidden pattern exists.
    const hiding = await table.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        display: style.display,
        visibility: style.visibility,
        ariaHidden: node.getAttribute('aria-hidden'),
        clipPath: style.clipPath,
        position: style.position,
      };
    });
    console.log(`C8  what hides it from the eye and not from the tree: ${JSON.stringify(hiding)}`);
    expect(hiding.display).not.toBe('none');
    expect(hiding.visibility).not.toBe('hidden');
    expect(hiding.ariaHidden).toBeNull();
    expect(hiding.clipPath).toContain('inset');

    // Then the semantics themselves. Playwright's role engine skips a subtree
    // clipped to one pixel, because it decides visibility from geometry, so the
    // clip is lifted for the length of this read and put back. What is being
    // graded is the structure a screen reader walks: rows, row headers and
    // cells, not one summary string.
    await table.evaluate((node) => node.classList.remove('visually-hidden'));
    const rowCount = await table.getByRole('row').count();
    const cellCount = await table.getByRole('cell').count();
    const snapshot = await table.ariaSnapshot();
    const missing = await table.getByText('No reading').count();
    await table.evaluate((node) => node.classList.add('visually-hidden'));

    console.log(`C8  the weight table exposes ${rowCount} rows and ${cellCount} cells to the tree`);
    console.log('C8  what the accessibility tree holds, first twelve lines:');
    for (const line of snapshot.split('\n').slice(0, 12)) console.log(`C8      ${line}`);
    expect(rowCount).toBeGreaterThan(20);
    expect(cellCount).toBeGreaterThan(30);
    // A day with no reading is a row that says so, which is the whole point of
    // handing a chart's data to a reader who cannot see the hatching.
    console.log(`C8  rows reading "No reading": ${missing}, which is the gap spoken`);
    expect(missing).toBeGreaterThan(0);
    expect(snapshot).toContain('rowheader');
  });

  test('C7. Health matches screen 04 at three viewports with one accented action', async ({
    page,
  }) => {
    await signIn(page);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/health');
      await page.waitForLoadState('networkidle');

      const accented = page.locator('.btn.primary');
      expect(await accented.count()).toBe(1);
      console.log(`C7  ${viewport.name} accented actions: 1, ${await accented.textContent()}`);

      const chips = await page.locator('.src:not(.stale)').evaluateAll((nodes) =>
        nodes.map((node) => getComputedStyle(node).borderTopColor),
      );
      const semantic = ['rgb(79, 208, 138)', 'rgb(233, 180, 76)', 'rgb(240, 122, 106)', 'rgb(90, 169, 255)'];
      for (const colour of chips) expect(semantic).not.toContain(colour);
      console.log(`C7  ${viewport.name} origin chips: ${chips.length}, none semantic`);

      await page.screenshot({ path: `${CAPTURES}/c7-health-${viewport.name}.png`, fullPage: true });
    }
  });

  /**
   * F29, last in the file and serial, because it is the one test here that
   * writes. It goes through the shipped form, reads the trajectory off the
   * rendered markup before and after, and puts the goal back the way it found
   * it.
   */
  test('F29. the goal is visible on Today, editable from Health, and redraws', async ({ page }) => {
    await signIn(page);

    const stored = query('select target_value, to_char(target_at, \'YYYY-MM-DD\') from goal').split('|');
    const originalValue = Number(stored[0]);
    const originalDate = stored[1].trim();
    console.log(`F29  the stored goal is ${originalValue} kg on ${originalDate}`);

    // Visible on Today, in words, with its target and its date.
    await page.goto('/');
    const onToday = (await page.locator('[data-goal-line="today"]').textContent())!.trim();
    console.log(`F29  Today says: ${onToday}`);
    expect(onToday).toContain(originalValue.toFixed(1));

    await page.goto('/health');
    const before = await trajectoryEnd(page);
    await page.screenshot({ path: `${CAPTURES}/f29-goal-before.png`, fullPage: true });

    // Editable from Health: change both fields and save.
    await page.locator('#goal-value').fill('74.0');
    await page.locator('#goal-date').fill('2027-06-30');
    await page.getByRole('button', { name: 'Save the goal', exact: true }).click();
    await page.locator('[data-goal="saved"]').waitFor();
    await page.waitForLoadState('networkidle');

    const after = await trajectoryEnd(page);
    console.log(`F29  the trajectory ends at y=${before} before and y=${after} after`);
    expect(after).not.toBe(before);
    const changed = (await page.locator('[data-goal-line="health"]').textContent())!.trim();
    console.log(`F29  Health now says: ${changed}`);
    expect(changed).toContain('74.0');
    await page.screenshot({ path: `${CAPTURES}/f29-goal-after.png`, fullPage: true });

    // And Today redrew on its next load, which is the "within one page load"
    // half of the line: nothing is cached, the line is arithmetic over two
    // points and is computed where it is drawn.
    await page.goto('/');
    const todayAfter = (await page.locator('[data-goal-line="today"]').textContent())!.trim();
    console.log(`F29  Today now says: ${todayAfter}`);
    expect(todayAfter).toContain('74.0');

    // Put it back, through the same form, and check the database agrees.
    await page.goto('/health');
    await page.locator('#goal-value').fill(originalValue.toFixed(1));
    await page.locator('#goal-date').fill(originalDate);
    await page.getByRole('button', { name: 'Save the goal', exact: true }).click();
    await page.locator('[data-goal="saved"]').waitFor();
    const restored = query('select target_value, to_char(target_at, \'YYYY-MM-DD\') from goal');
    console.log(`F29  restored to ${restored}`);
    expect(restored.trim()).toBe(`${originalValue}|${originalDate}`);
  });
});
