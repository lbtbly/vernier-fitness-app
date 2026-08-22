import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import {
  ensureScratchOwner,
  projectRoot,
  scratchQuery,
  scratchSignInLink,
  testStack,
  testStackWithDemoMode,
  waitForScratch,
} from './host';

/**
 * The two states the owner's own installation cannot be put into: a database
 * with none of the five body signals in it, and a source that stopped sending
 * exactly thirty-five and exactly thirty-seven hours ago.
 *
 * Both run on the scratch instance, which is the same image against its own
 * database with nothing in it anybody would miss. The owner's install holds
 * demonstration history and, from slice 5, real Withings readings; putting it
 * into these states would mean writing rows into a table that refuses DELETE.
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT. It proves what the screens render for
 * a given data state, walked in a real browser on the shipped build. The rows
 * are placed by SQL rather than by an ingest, because the shortcut ingest is
 * slice 6 and the Withings sync is slice 5: there is no shipped route that
 * delivers an Apple Health sample yet. That is stated here rather than left for
 * somebody to notice.
 */

const CAPTURES = `${projectRoot}.forge/evidence/slice-4/captures`;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  mkdirSync(CAPTURES, { recursive: true });
  // Demonstration mode off, so the five signals are genuinely absent rather
  // than hidden. An empty screen over an empty database is exactly what F32's
  // second half is about.
  console.log(testStackWithDemoMode('0', 'reset'));
  await waitForScratch();
  await ensureScratchOwner();
});

test.afterAll(() => {
  // Put the scratch instance back the way the rest of the suite expects it.
  testStack('reset');
});

async function signIn(page: Page) {
  await page.goto(scratchSignInLink());
  await page.waitForURL(/\/$/);
  await page.waitForLoadState('networkidle');
}

async function openHealth(page: Page) {
  await page.goto('/health');
  await page.waitForLoadState('networkidle');
}

async function openToday(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}

/**
 * One phone payload and one reading in it, landed at a chosen age.
 *
 * The measurement's source is `apple_health_shortcut`, so the generated `seed`
 * column is false and the composite foreign key demands a source record that is
 * also not seeded. Nothing here can pretend to be demonstration data or the
 * reverse; the database refuses both.
 */
function landASample(slug: string, hoursAgo: number, steps: number) {
  scratchQuery(`
    insert into source_record (id, source, kind, reference, occurred_at, import_version, detail, seed)
    values ('${slug}-src', 'apple_health_shortcut', 'shortcut_payload', '9${hoursAgo}',
            now() - interval '${hoursAgo} hours', '2026-08-3', '[]'::jsonb, false)
    on conflict (id) do nothing
  `);
  scratchQuery(`
    insert into measurement (
      id, metric, raw_value, raw_unit, value, unit, time_zone, source, measured_at,
      confidence, import_version, dedup_decision, dedup_reason, source_record_id, root_id
    ) values (
      '${slug}', 'steps', '${steps}', 'step', ${steps}, 'step', 'Europe/Paris',
      'apple_health_shortcut', now() - interval '${hoursAgo} hours', 'measured_device',
      '2026-08-3', 'unique', 'The first reading of this metric on this day.', '${slug}-src', '${slug}'
    ) on conflict (id) do nothing
  `);
  const age = scratchQuery(
    `select round(extract(epoch from now() - max(measured_at)) / 3600) from measurement where source = 'apple_health_shortcut'`,
  );
  console.log(`landed ${slug}: the newest phone sample is now ${age} hours old`);
  return Number(age);
}

test('F32. with nothing stored, all five signals name their own absence and none renders zero', async ({
  page,
}) => {
  expect(scratchQuery('select count(*) from measurement')).toBe('0');
  await signIn(page);
  await openHealth(page);

  // The population this walk covers, printed, because a clean walk over an
  // empty screen reads exactly like a clean walk over a full one.
  const cards = await page.locator('[data-card]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-card')),
  );
  console.log(`F32  cards on the screen: ${cards.join(', ')}`);

  const absent: Record<string, string> = {};
  for (const [name, selector] of [
    ['steps', '[data-empty="steps"]'],
    ['sleep', '[data-empty="sleep"]'],
    ['resting heart rate', '[data-empty="resting"]'],
    ['recovery', '[data-empty="recovery"]'],
    ['VO2 max', '[data-empty="vo2"]'],
  ] as const) {
    const card = page.locator(selector);
    await expect(card).toBeVisible();
    const text = (await card.textContent())!.trim().replace(/\s+/g, ' ');
    absent[name] = text;
    console.log(`F32  ${name}: ${text}`);
    // Absence is named, and nothing is standing in for it.
    expect(text.length).toBeGreaterThan(10);
    expect(text).not.toMatch(/\b0\b/);
  }
  expect(Object.keys(absent)).toHaveLength(5);

  // And no zero reached the screen anywhere on it, which is the clause that
  // matters: a zero for a missing value is a claim about the owner's day.
  const zeros = await page
    .locator('.metric, .big, [data-signal] .num')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? '').filter((text) => /^0([ .].*)?$/.test(text)));
  console.log(`F32  figures reading zero anywhere on the screen: ${zeros.length}`);
  expect(zeros).toEqual([]);

  await page.screenshot({ path: `${CAPTURES}/f32-health-signals-absent.png`, fullPage: true });
});

test('F34. a source is stale past thirty-six hours, and the chip clears when a fresher sample lands', async ({
  page,
}) => {
  await signIn(page);

  // Thirty-seven hours: the chip, its age, its cause, and the hatched range.
  const at37 = landASample('stale-thirty-seven', 37, 8123);
  expect(at37).toBe(37);
  await openHealth(page);
  const chip = page.locator('.src.stale[data-stale="apple_health_shortcut"]').first();
  await expect(chip).toBeVisible();
  const chipText = (await chip.textContent())!.trim();
  const cause = (await page.locator('[data-stale-cause="apple_health_shortcut"]').first().textContent())!.trim();
  console.log(`F34  at 37 hours the chip reads "${chipText}" and the cause reads "${cause}"`);
  expect(chipText).toContain('37 hours old');
  expect(cause.length).toBeGreaterThan(20);
  // The affected range, hatched on the chart the source feeds.
  const hatched = page.locator('[data-chart="health-steps"] rect[fill="url(#health-steps-hatch)"]');
  console.log(`F34  hatched ranges on the activity chart: ${await hatched.count()}`);
  expect(await hatched.count()).toBeGreaterThan(0);
  await page.screenshot({ path: `${CAPTURES}/f34-thirty-seven-hours.png`, fullPage: true });

  // Thirty-five hours, which is a fresher sample landing: the chip clears.
  const at35 = landASample('stale-thirty-five', 35, 9440);
  expect(at35).toBe(35);
  await openHealth(page);
  console.log(`F34  at 35 hours the warn chip count is ${await page.locator('.src.stale').count()}`);
  expect(await page.locator('.src.stale').count()).toBe(0);
  /*
   * The notice region, on the screen that draws one.
   *
   * This assertion used to sit on the line above, counting `[data-notices]` on
   * `/health`. `NoticeRegion` is rendered by `src/app/(shell)/page.tsx` and by
   * nothing else, so that count was 0 whatever the staleness was and the
   * assertion could not fail. It read exactly like a real check, which is what
   * made it worth moving rather than deleting: A4's first standing rule says a
   * zero is evidence only beside the population it covered, and the population
   * here is Today.
   *
   * So it is asked on Today, where the region does render, where it renders one
   * line per quiet source, and where it can fail. The population is printed
   * beside the zero, which is the other half of the same rule.
   */
  await openToday(page);
  const raised = await page.locator('[data-notices]').count();
  const quiet = await page.locator('[data-notice="stale"]').count();
  console.log(`F34  on Today at 35 hours: ${raised} notice region(s), ${quiet} quiet-source notice(s)`);
  expect(raised).toBe(0);
  // Absence is still drawn: thirty-five hours with no sample is still a hole in
  // the chart, it is simply not old enough to be worth a warning.
  console.log(
    `F34  and the chart still hatches what is missing: ${await page
      .locator('[data-chart="health-steps"] rect[fill="url(#health-steps-hatch)"]')
      .count()} range(s)`,
  );
  await page.screenshot({ path: `${CAPTURES}/f34-thirty-five-hours.png`, fullPage: true });

  // A sample from this minute: nothing stale, nothing hatched at the end.
  const now = landASample('stale-fresh', 0, 10250);
  expect(now).toBe(0);
  await openHealth(page);
  console.log(`F34  after a fresh sample the warn chip count is ${await page.locator('.src.stale').count()}`);
  expect(await page.locator('.src.stale').count()).toBe(0);
  await expect(page.locator('[data-card="activity"] .metric')).toContainText('10,250');
  await page.screenshot({ path: `${CAPTURES}/f34-after-a-fresh-sample.png`, fullPage: true });
});
