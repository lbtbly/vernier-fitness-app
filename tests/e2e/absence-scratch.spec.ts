import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import {
  anchorScratchDemo,
  ensureScratchOwner,
  projectRoot,
  scratchQuery,
  scratchSignInLink,
  testStackWithDemoMode,
  waitForScratch,
} from './host';
import { strings } from '@/lib/strings';

/**
 * F30, on an installation where absence still exists.
 *
 * WHY THIS FILE EXISTS. F30's clauses were proven on the owner's own install
 * against the demonstration seed's authored hole at anchor offsets 10 to 13.
 * That hole is gone and it cannot come back: `measurement` refuses DELETE, and
 * the Withings demonstration import fills any day the seed left empty, because
 * its own day rule inserts wherever no reading stands. Four rows keyed
 * `demo:4100028:1` to `demo:4100031:1` sit on 9, 10, 11 and 12 August 2026 on
 * that database for ever, and on 23 August the thirty-day window behind Today
 * held thirty readings and no gap at all.
 *
 * `.forge/RULING-DEMO-COLLISION.md` section 5 ruled this before it happened:
 * F30 is not falsified, "what changes is where it is re-observed ... the owner's
 * install may stop being the place to photograph it". So it is re-observed here,
 * on the scratch instance, where the anchor can be moved and the seed re-run.
 *
 * WHAT IS SEEDED, AND WHY THIS ANCHOR. `anchorScratchDemo(1)` puts the
 * demonstration anchor on yesterday. `src/lib/demo-series.ts` leaves offsets 10
 * to 13 empty, so the four silent days land eleven to fourteen days back, inside
 * the thirty-day window with readings on both sides of them; the continuation's
 * own quiet run does not start until eight days after the anchor, so there is
 * exactly one hole in view and it is the authored one. Every number below is
 * derived from the chart's own hidden data table rather than from that
 * arithmetic, so a seed that changed shape shows up as a failed derivation
 * rather than as a green run over different data.
 *
 * GOES RED IF: the line is bridged across the hole, a dot or an average vertex
 * appears on a day the table says has no reading, the hatch stops being drawn at
 * 45 degrees or stops naming its dates, or the average is drawn on a window of
 * fewer than five days.
 */

const CAPTURES = `${projectRoot}.forge/evidence/slice-5/absence/`;

/** The anchor that puts the authored hole inside the window. */
const GAP_ANCHOR = 1;

/** DESIGN.md section 4, and `src/lib/trend.ts`: three days is a gap. */
const GAP_DAYS = 3;

/** The rolling window, and the two thresholds F30 names. */
const WINDOW = 7;
const DRAWN_AT = 5;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  mkdirSync(CAPTURES, { recursive: true });
  testStackWithDemoMode('1', 'reset');
  await waitForScratch();
  await ensureScratchOwner();
  const anchor = anchorScratchDemo(GAP_ANCHOR);
  await waitForScratch();
  await ensureScratchOwner();
  console.log(`absence  the demonstration anchor is ${anchor}`);
  console.log(
    `absence  the instance holds ${scratchQuery(
      "select count(*) from measurement where metric = 'weight'",
    )} weight reading(s), ` +
      `${scratchQuery("select count(*) from measurement where metric = 'weight' and not seed")} of them not seeded`,
  );
});

async function signIn(page: Page) {
  await page.goto(scratchSignInLink());
  await page.waitForURL(/\/$/);
  await page.waitForLoadState('networkidle');
}

/** One row per day, read off the visually hidden table the chart itself prints. */
type TableDay = { when: string; value: string; hasReading: boolean };

async function theTableUnder(page: Page, id: string): Promise<TableDay[]> {
  const rows = await page
    .locator(`[data-chart-table="${id}"] tbody tr`)
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        when: node.querySelector('th')?.textContent?.trim() ?? '',
        value: node.querySelector('td')?.textContent?.trim() ?? '',
      })),
    );
  return rows.map((row) => ({ ...row, hasReading: row.value !== strings.trend.noReading }));
}

/** Every run of empty days three long or more, taken from the table. */
function runsOfAbsence(days: TableDay[], minimum = GAP_DAYS) {
  const runs: Array<{ from: number; to: number }> = [];
  let start = -1;
  days.forEach((day, index) => {
    if (!day.hasReading) {
      if (start === -1) start = index;
      return;
    }
    if (start !== -1 && index - start >= minimum) runs.push({ from: start, to: index - 1 });
    start = -1;
  });
  if (start !== -1 && days.length - start >= minimum) runs.push({ from: start, to: days.length - 1 });
  return runs;
}

/** How many of the seven days ending at `index` carried a reading. */
function windowCount(days: TableDay[], index: number): number {
  let held = 0;
  for (let step = 0; step < WINDOW; step += 1) {
    const at = index - step;
    if (at < 0) return -1;
    if (days[at].hasReading) held += 1;
  }
  return held;
}

test('F30. a four-day hole breaks the line, is hatched at 45 degrees and names its dates', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/');
  const chart = page.locator('[data-chart="today-weight"]');
  await chart.waitFor();

  // The population, printed before anything is asserted about it. A4's first
  // standing rule: a zero closes nothing unless the run says what it walked.
  const days = await theTableUnder(page, 'today-weight');
  const withReading = days.filter((day) => day.hasReading).length;
  const runs = runsOfAbsence(days);
  console.log(
    `F30  the chart's own table holds ${days.length} day(s), ${withReading} with a reading, ` +
      `${days.length - withReading} without`,
  );
  console.log(
    `F30  runs of ${GAP_DAYS} days or more with nothing in them: ` +
      (runs.length === 0
        ? 'none'
        : runs.map((run) => `${days[run.from].when} to ${days[run.to].when}`).join(', ')),
  );
  expect(days.length, 'the chart drew no table, so there is no population to read').toBeGreaterThan(20);
  expect(withReading, 'the seeded window holds no readings at all').toBeGreaterThan(20);
  expect(runs, 'the seeded window holds no hole, so nothing here would be measuring absence').toHaveLength(1);
  expect(runs[0].to - runs[0].from + 1, 'the authored hole is not four days long').toBe(4);

  // The hatch: 45 degrees, one band per run, and no band without a run.
  const pattern = chart.locator('pattern#today-weight-hatch');
  expect(await pattern.getAttribute('patternTransform')).toBe('rotate(45)');
  const hatched = chart.locator('rect[fill="url(#today-weight-hatch)"]');
  const bands = await hatched.evaluateAll((nodes) =>
    nodes.map((node) => ({
      x: Number(node.getAttribute('x')),
      width: Number(node.getAttribute('width')),
    })),
  );
  console.log(`F30  hatched bands: ${JSON.stringify(bands)}`);
  expect(bands, 'one hatched band per run of absence, and never one without a run').toHaveLength(runs.length);
  const band = bands[0];

  // The dates, named, in the warn colour, and they are the run's own dates.
  const warnLabels = await chart.locator('text.axis.warn').allTextContents();
  console.log(`F30  the range is labelled: ${warnLabels.join(' | ')}`);
  expect(warnLabels).toContain(
    strings.stale.affectedRange(days[runs[0].from].when, days[runs[0].to].when),
  );

  // No dot inside the band, and every dot the chart drew stands on a day the
  // table says holds a reading. That second half is the clause about
  // interpolated, carried-forward and zero-filled points: a fabricated point
  // would be a dot on a date printed as "No reading".
  const dots = await chart.locator('g[data-dots] a').evaluateAll((nodes) =>
    nodes.map((node) => ({
      at: node.getAttribute('data-reading') ?? '',
      cx: Number(node.querySelector('circle')?.getAttribute('cx')),
    })),
  );
  const inside = dots.filter((dot) => dot.cx > band.x && dot.cx < band.x + band.width);
  console.log(`F30  ${dots.length} daily dots drawn, ${inside.length} of them inside the band`);
  expect(dots, 'a dot per stored reading, and never a dot for a day with none').toHaveLength(withReading);
  expect(inside).toHaveLength(0);

  // And the average, which is the line the rubric says may not cross.
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

  // The sentence under the card, naming the same hole.
  const note = page.locator('[data-gap]').first();
  await expect(note).toBeVisible();
  console.log(`F30  the card says: ${(await note.textContent())!.trim()}`);

  await page.screenshot({ path: `${CAPTURES}f30-today-seeded-gap.png`, fullPage: true });
});

test('F30. the average is dashed at 5 or 6 of 7, undrawn below 5, and states its count', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/');
  const chart = page.locator('[data-chart="today-weight"]');
  await chart.waitFor();
  const days = await theTableUnder(page, 'today-weight');

  // What the seven-day window behind every column actually held, computed from
  // the table rather than from the seed's arithmetic.
  const whole: string[] = [];
  const short: string[] = [];
  const tooShort: string[] = [];
  days.forEach((day, index) => {
    const held = windowCount(days, index);
    if (held < 0) return;
    if (held === WINDOW) whole.push(day.when);
    else if (held >= DRAWN_AT) short.push(day.when);
    else tooShort.push(day.when);
  });
  console.log(
    `F30  windows of ${WINDOW}: ${whole.length} whole, ${short.length} at 5 or 6, ` +
      `${tooShort.length} under 5 (${tooShort.join(', ')})`,
  );
  // Each of the three has to exist, or the assertions below cover nothing.
  expect(whole.length, 'no whole window in the seeded data').toBeGreaterThan(0);
  expect(short.length, 'no window of 5 or 6, so the dashed clause covers nothing').toBeGreaterThan(0);
  expect(tooShort.length, 'no window under 5, so the undrawn clause covers nothing').toBeGreaterThan(0);

  const segments = await chart
    .locator('g[data-average-segments] path')
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        window: node.getAttribute('data-window'),
        dash: node.getAttribute('stroke-dasharray'),
        width: node.getAttribute('stroke-width'),
      })),
    );
  console.log(`F30  average segments: ${JSON.stringify(segments)}`);
  expect(segments.length, 'the average was drawn as one unbroken path over a hole').toBeGreaterThan(1);
  const dashed = segments.filter((segment) => segment.window === 'short');
  expect(dashed.length, 'no segment is drawn on the short-window treatment').toBeGreaterThan(0);
  for (const segment of dashed) {
    expect(segment.dash, 'a short window is drawn as a solid line').not.toBeNull();
  }
  for (const segment of segments.filter((each) => each.window === 'whole')) {
    expect(segment.dash, 'a whole window is drawn dashed').toBeNull();
  }

  // The count, in words, on the card. It is the half of the line that keeps a
  // short window on screen at all rather than blank.
  const sentence = page.locator('[data-window="lastweek"]');
  await expect(sentence).toBeVisible();
  const read = (await sentence.textContent())!.trim();
  console.log(`F30  ${read}`);
  expect(read).toMatch(/used \d days of 7/);
  const stated = Number(read.match(/used (\d) days of 7/)![1]);
  // Last week's average is the point one window back, which is the day at
  // index length - 1 - 7 in the table. The screen has to state that day's own
  // count and not a rounder number.
  const lastWeek = windowCount(days, days.length - 1 - WINDOW);
  console.log(`F30  the table says that day's window held ${lastWeek} of ${WINDOW}`);
  expect(stated, 'the stated count is not the count the table holds').toBe(lastWeek);

  await page.screenshot({ path: `${CAPTURES}f30-average-over-the-gap.png`, fullPage: true });
});

test('F31. the same hole cuts both bands on Health, in the same place', async ({ page }) => {
  await signIn(page);
  await page.goto('/health');
  const chart = page.locator('[data-chart="health-body"]');
  await chart.waitFor();

  const days = await theTableUnder(page, 'health-body');
  const runs = runsOfAbsence(days);
  console.log(
    `F31  the weight table under the body chart holds ${days.length} day(s), ` +
      `${days.filter((day) => day.hasReading).length} with a reading, ${runs.length} hole(s)`,
  );
  expect(runs, 'the seeded window holds no hole, so nothing here would be measuring one').toHaveLength(1);

  // Two rectangles from one hole: one in the weight band, one in the waist
  // band, at the same x and at different heights. That is what sharing an axis
  // buys and it is what the rubric line is about.
  const bands = await chart.locator('rect[fill="url(#health-body-hatch)"]').evaluateAll((nodes) =>
    nodes.map((node) => ({ x: node.getAttribute('x'), y: node.getAttribute('y') })),
  );
  console.log(`F31  hatched bands: ${JSON.stringify(bands)}`);
  expect(bands).toHaveLength(runs.length * 2);
  expect(bands[0].x).toBe(bands[1].x);
  expect(bands[0].y).not.toBe(bands[1].y);

  await page.screenshot({ path: `${CAPTURES}f31-health-one-hole-two-bands.png`, fullPage: true });
});
