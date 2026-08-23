import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import {
  ensureScratchOwner,
  projectRoot,
  scratchQuery,
  scratchSignInLink,
  testStack,
  waitForScratch,
} from './host';
import { scanJpeg } from '../../src/lib/jpeg';
import { exifApp1Segment, jpegWithGps } from '../unit/jpeg-fixture';
import { strings } from '../../src/lib/strings';

/**
 * Screen 09, the recipe box and the takeaway slots, walked in a browser.
 *
 * IT RUNS ON THE SCRATCH INSTANCE, and for the reason `nutrition.spec.ts` gives:
 * everything here needs a write. A photograph, an estimate, a confirmed meal,
 * three corrections, two imported recipes and two second-portion answers would
 * all land in the owner's own day if this drove the live origin.
 *
 * THE SCRATCH INSTANCE RUNS ANTHROPIC IN DEMONSTRATION MODE WITH A RATE TABLE.
 * No key, so nothing leaves this machine. Rates, so a demonstration call is
 * priced and the ledger accumulates, which is the only way the monthly ceiling
 * can be shown refusing a call on an installation that has no key at all. The
 * cap is 0.03 USD, which the third call crosses.
 *
 * WHAT WOULD MAKE THESE GO RED. The photograph test reads the STORED BYTES back
 * through the app's own route and scans them here, in the test process, rather
 * than believing what the server said about them. The abandonment test prints
 * the row count it walked. The three-edit test reads the row after each edit
 * rather than after the third. And the consent test asserts an empty request
 * log at the database, not a hidden button.
 */

const CAPTURES = `${projectRoot}.forge/evidence/slice-10/captures`;

const VIEWPORTS = [
  { name: '393x852', width: 393, height: 852 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  mkdirSync(CAPTURES, { recursive: true });
  console.log(testStack('reset'));
  await waitForScratch();
  await ensureScratchOwner();
});

async function signIn(page: Page) {
  await page.goto(scratchSignInLink());
  await page.waitForURL(/\/$/);
  await page.waitForLoadState('networkidle');
}

/**
 * Types a value into a field, one keystroke at a time.
 *
 * NEVER `fill()`. A fill sets the whole value in one input event and passed for
 * four rounds of this project over a field that could not be typed into at all.
 */
async function typeInto(page: Page, selector: string, value: string) {
  const field = page.locator(selector);
  await field.click();
  await field.press('Meta+A').catch(() => undefined);
  await field.press('Control+A').catch(() => undefined);
  await field.press('Backspace');
  await field.pressSequentially(value, { delay: 15 });
  await expect(field).toHaveValue(value);
}

async function turnOnPhotoAnalysis(page: Page) {
  await page.goto('/settings/ai');
  await page.waitForLoadState('networkidle');
  const control = page.locator('[data-switch="photo_analysis"]');
  if ((await control.getAttribute('aria-checked')) !== 'true') {
    await control.click();
    await expect(control).toHaveAttribute('aria-checked', 'true');
  }
}

/**
 * Puts a REAL photograph carrying a REAL GPS directory on the file input.
 *
 * It has to be a picture a browser can decode, because the whole point is that
 * the shipped `downscaleToJpeg` decodes it and draws it onto a canvas. So the
 * page draws a 4032 x 3024 frame, encodes it to JPEG, and splices an APP1 EXIF
 * segment in after the start marker, which is exactly where a camera puts one.
 * `setInputFiles` cannot do this: the bytes have to be made in the browser.
 *
 * It returns what was actually put on the input, so the test can scan it here
 * and prove the file going IN carried a location before proving the file coming
 * OUT does not.
 */
async function choosePhoto(page: Page): Promise<Uint8Array> {
  const bytes = await page.evaluate(async (exif: number[]) => {
    const canvas = document.createElement('canvas');
    canvas.width = 4032;
    canvas.height = 3024;
    const context = canvas.getContext('2d')!;
    // Something with edges in it, so the encoder produces a real picture rather
    // than one flat colour that compresses to nothing.
    context.fillStyle = '#8a6b3f';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#d8623a';
    context.beginPath();
    context.arc(2000, 1500, 900, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#2f6b3a';
    context.fillRect(300, 2200, 3400, 500);

    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((made) => resolve(made!), 'image/jpeg', 0.9),
    );
    const encoded = new Uint8Array(await blob.arrayBuffer());

    // SOI, then the camera's own APP1, then everything the encoder wrote.
    const withExif = new Uint8Array(2 + exif.length + encoded.length - 2);
    withExif.set(encoded.subarray(0, 2), 0);
    withExif.set(Uint8Array.from(exif), 2);
    withExif.set(encoded.subarray(2), 2 + exif.length);

    const file = new File([withExif], 'lunch.jpg', { type: 'image/jpeg' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = document.querySelector('#meal-photo') as HTMLInputElement;
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return [...withExif];
  }, [...exifApp1Segment()]);

  await page.locator('[data-photo="ready"]').waitFor();
  return Uint8Array.from(bytes);
}

/** The estimate screen, from a photograph that carried a location. */
async function sendPhoto(page: Page): Promise<Uint8Array> {
  await page.goto('/eat/estimate');
  await page.waitForLoadState('networkidle');
  const chosen = await choosePhoto(page);
  await page.locator('[data-action="send"]').click();
  await page.locator('[data-meal-estimate="estimate"]').waitFor();
  return chosen;
}

test('F94 with photo analysis off, no request is made and no ledger row is written', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/settings/ai');
  await page.waitForLoadState('networkidle');

  // Off is the default: the consent row ships with four falses, so the first
  // assertion is that nothing has been agreed to before anything is sent.
  for (const category of [
    'photo_analysis',
    'menu_generation',
    'health_explanations',
    'calendar_titles',
  ]) {
    await expect(page.locator(`[data-switch="${category}"]`)).toHaveAttribute(
      'aria-checked',
      'false',
    );
  }

  const before = Number(scratchQuery('select count(*) from usage_ledger'));

  /*
   * The request the screen will not make, made anyway, with the switch off.
   * A disabled control proves nothing about a server, so this posts a real
   * photograph at the real endpoint and expects a refusal.
   */
  const csrf = await page.evaluate(() =>
    document.cookie
      .split('; ')
      .find((pair) => pair.startsWith('vernier_csrf='))
      ?.slice('vernier_csrf='.length),
  );
  const answer = await page.evaluate(
    async ([token, bytes]) => {
      const form = new FormData();
      form.append(
        'photo',
        new Blob([new Uint8Array(bytes as number[])], { type: 'image/jpeg' }),
        'meal.jpg',
      );
      form.append('slot', 'lunch');
      const response = await fetch('/api/meals/estimate', {
        method: 'POST',
        headers: { 'x-vernier-csrf': token as string },
        body: form,
      });
      return { status: response.status, body: await response.text() };
    },
    [csrf, [...jpegWithGps(1092, 819)]] as const,
  );

  expect(answer.status).toBe(403);
  expect(answer.body).toContain(strings.api.meals.consentOff);

  const after = Number(scratchQuery('select count(*) from usage_ledger'));
  console.log(`F94: usage_ledger rows before ${before}, after ${after}, over the whole table`);
  expect(after).toBe(before);
  expect(Number(scratchQuery('select count(*) from ai_call'))).toBe(0);

  // And the four switches move independently: turning one on leaves three off.
  await page.locator('[data-switch="menu_generation"]').click();
  await expect(page.locator('[data-switch="menu_generation"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  for (const category of ['photo_analysis', 'health_explanations', 'calendar_titles']) {
    await expect(page.locator(`[data-switch="${category}"]`)).toHaveAttribute(
      'aria-checked',
      'false',
    );
  }
  expect(scratchQuery('select photo_analysis, menu_generation from ai_consent')).toBe('f|t');

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.screenshot({ path: `${CAPTURES}/consent-settings-${viewport.name}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 393, height: 852 });
});

test('F93 the photo is 1092 px, re-encoded on the device, and stored with zero tags', async ({
  page,
}) => {
  await signIn(page);
  await turnOnPhotoAnalysis(page);

  const chosen = await sendPhoto(page);

  /*
   * The file that went IN carried a location. Scanned here, in this process,
   * off the exact bytes the browser put on the input: a test that only ever
   * looked at clean files would pass over a scanner that finds nothing, which
   * is the failure class this run keeps finding.
   */
  const originalScan = scanJpeg(chosen);
  console.log(
    `F93: the photograph chosen carries ${originalScan.markerNames.join(' ')}, ` +
      `${originalScan.width}x${originalScan.height}, exif ${originalScan.exif}, gps ${originalScan.gps}`,
  );
  expect(originalScan.gps).toBe(true);
  expect(originalScan.exif).toBe(true);
  expect(Math.max(originalScan.width ?? 0, originalScan.height ?? 0)).toBe(4032);

  const photoId = scratchQuery('select photo_id from ai_call order by created_at desc limit 1');
  expect(photoId).toMatch(/^meal_/);

  // The STORED bytes, read back through the app's own route and scanned here.
  const stored = await page.evaluate(async (id) => {
    const response = await fetch(`/api/meals/photo/${id}`);
    return [...new Uint8Array(await response.arrayBuffer())];
  }, photoId);
  const storedScan = scanJpeg(Uint8Array.from(stored));

  console.log(
    `F93: stored ${storedScan.width}x${storedScan.height}, segments ${storedScan.markerNames.join(' ')}, ` +
      `metadata segments ${storedScan.metadataSegments}`,
  );
  expect(storedScan.ok).toBe(true);
  expect(Math.max(storedScan.width ?? 0, storedScan.height ?? 0)).toBe(1092);
  expect(storedScan.exif).toBe(false);
  expect(storedScan.gps).toBe(false);
  expect(storedScan.xmp).toBe(false);
  expect(storedScan.metadataSegments).toBe(0);
  expect(storedScan.markerNames.filter((name) => name.startsWith('APP'))).toHaveLength(0);
});

test('F95 F96 the estimate is a range, and abandoning it leaves zero rows', async ({ page }) => {
  await signIn(page);
  await turnOnPhotoAnalysis(page);

  const entriesBefore = Number(scratchQuery('select count(*) from meal_entry'));
  await sendPhoto(page);

  // Demonstration mode, badged as demonstration, with no key anywhere.
  await expect(page.locator('[data-meal-estimate="estimate"]')).toBeVisible();
  await expect(page.getByText(strings.meals.demoChip, { exact: true }).first()).toBeVisible();

  // Every portion is a range, and the totals are a range.
  const portions = page.locator('[data-portion="photo"]');
  const count = await portions.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const text = (await portions.nth(index).textContent()) ?? '';
    console.log(`F96: portion ${index + 1} of ${count} reads "${text}"`);
    expect(text).toMatch(/\d+ to \d+ g/);
  }
  const totals = (await page.locator('[data-total="range"]').textContent()) ?? '';
  expect(totals).toMatch(/\d+ to \d+/);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.screenshot({ path: `${CAPTURES}/estimate-ranges-${viewport.name}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 393, height: 852 });

  // Abandon it. Not a discard button: leave the screen, which is what a person
  // who changes his mind actually does.
  await page.goto('/eat');
  await page.waitForLoadState('networkidle');

  const entriesAfter = Number(scratchQuery('select count(*) from meal_entry'));
  const items = Number(scratchQuery('select count(*) from meal_entry_item'));
  const calls = Number(scratchQuery('select count(*) from ai_call'));
  console.log(
    `F96: meal_entry ${entriesBefore} before, ${entriesAfter} after; meal_entry_item ${items}; ` +
      `ai_call ${calls}, which is the record of the call that was paid for and not a meal`,
  );
  expect(entriesAfter).toBe(entriesBefore);
  expect(items).toBe(0);
  // The call itself IS recorded, because it cost money. That is the honest half
  // of "nothing is stored": the day did not move, and the spend is not hidden.
  expect(calls).toBeGreaterThan(0);
});

test('F97 after confirmation and three edits the entry still says estimate and reaches the reply in two taps', async ({
  page,
}) => {
  await signIn(page);
  await turnOnPhotoAnalysis(page);
  await sendPhoto(page);

  await page.locator('[data-action="save"]').click();
  await page.waitForURL(/\/eat\/entry\//);
  const rootId = scratchQuery(
    'select root_id from meal_entry order by created_at desc limit 1',
  );
  expect(rootId).toMatch(/^meal_entry_/);

  const shape = () =>
    scratchQuery(
      `select origin || '|' || confidence || '|' || coalesce(ai_call_id, 'none') || '|' || coalesce(photo_id, 'none')
       from meal_entry where root_id = '${rootId}' order by correction_index desc limit 1`,
    );
  const stored = shape();
  console.log(`F97: after confirmation the row reads ${stored}`);
  expect(stored).toMatch(/^photo_estimate\|estimated\|aicall_/);

  // Three edits, and the row is read after each one rather than after the third.
  for (const [index, value] of ['800', '820', '760'].entries()) {
    // Each correction lands on the new row's own screen, which is where the
    // next one is raised from. No reload between them: this is the walk a
    // person takes.
    await page.waitForLoadState('networkidle');
    await typeInto(page, '#entry-kcal', value);
    await typeInto(page, '#entry-reason', `Edit ${index + 1}`);
    await page.locator('[data-action="correct"]').click();
    await page.waitForURL(/\/eat\/entry\//);
    await page.waitForLoadState('networkidle');

    const after = shape();
    const chain = Number(
      scratchQuery(`select count(*) from meal_entry where root_id = '${rootId}'`),
    );
    console.log(`F97: after edit ${index + 1} the row reads ${after}, chain length ${chain}`);
    expect(after).toMatch(/^photo_estimate\|estimated\|aicall_/);
    expect(chain).toBe(index + 2);
    await expect(page.locator('[data-still-estimate="true"]')).toBeVisible();
  }

  // The original is still readable, struck through, after three corrections.
  await expect(page.getByText(strings.provenance.original, { exact: true })).toBeVisible();

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.screenshot({ path: `${CAPTURES}/entry-saved-${viewport.name}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 393, height: 852 });

  /*
   * THE TWO-TAP WALK, COUNTED. Tap 1 is the row on the Eat screen, which opens
   * this entry. Tap 2 is the one control on it, which lands on the source
   * record where the photograph is drawn and the model's own reply is read
   * back. Two clicks, no more, after three corrections.
   */
  await page.goto('/eat');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-entry]').first().click();
  await page.waitForURL(/\/eat\/entry\//);
  await page.locator('[data-tap="2"]').click();
  await page.waitForURL(/\/source\//);
  await expect(page.locator('[data-photo="stored"] img')).toBeVisible();
  await expect(page.getByText(strings.provenance.fields['source.field.modelNote'])).toBeVisible();
  await expect(page.getByText(strings.meals.demoNote)).toBeVisible();
});

test('F90 F91 two recipes of two portions become four meals, and each asks separately', async ({
  page,
}) => {
  await signIn(page);

  const lines = [
    '200 g potatoes',
    '2 salmon fillets',
    '150 g green beans',
    '1 tbsp olive oil',
  ].join('\n');

  // 1. Typed in. The same parser the other three end in.
  await page.goto('/eat/import');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-kind="manual"]').click();
  await page.locator('#box-text').click();
  await page.locator('#box-text').pressSequentially(lines, { delay: 5 });
  await typeInto(page, '#box-name', 'Salmon with green beans');
  await typeInto(page, '#box-servings', '2');
  await page.locator('[data-action="import"]').click();
  await page.locator('[data-state="imported"]').waitFor();

  // 2. A pasted link. Read as a string: nothing is fetched.
  await page.locator('[data-kind="link"]').click();
  await typeInto(page, '#box-link', 'https://www.example.com/recipes/chicken-and-potatoes-12ab34cd');
  await typeInto(page, '#box-name', 'Chicken and potatoes');
  await page.locator('#box-text').isVisible().catch(() => false);
  await typeInto(page, '#box-servings', '2');
  await page.locator('[data-action="import"]').click();
  await page.locator('[data-state="imported"]').waitFor();

  const recipes = Number(
    scratchQuery("select count(*) from recipe where origin = 'recipe_box'"),
  );
  const placed = Number(
    scratchQuery("select count(*) from meal_entry where origin = 'recipe_box'"),
  );
  console.log(`F90: ${recipes} box recipes imported, ${placed} meals placed`);
  expect(recipes).toBe(2);
  expect(placed).toBe(4);

  // Two questions, answered separately, and the answers are stored per recipe.
  await page.goto('/eat');
  await page.waitForLoadState('networkidle');
  const cards = page.locator('[data-box-recipe]');
  await expect(cards).toHaveCount(2);

  await cards.nth(0).locator('[data-answer="next_day"]').click();
  await expect(cards.nth(0)).toHaveAttribute('data-answered', 'next_day');
  await cards.nth(1).locator('[data-answer="frozen"]').click();
  await expect(cards.nth(1)).toHaveAttribute('data-answered', 'frozen');

  const answers = scratchQuery(
    'select second_portion_answer from recipe_box_item order by created_at',
  );
  console.log(`F90: the two stored answers are ${answers.replace('\n', ' and ')}`);
  expect(answers.split('\n').sort()).toEqual(['frozen', 'next_day']);

  // The frozen portion left the week as a correction, not as a deletion.
  const frozen = Number(
    scratchQuery("select count(*) from meal_entry where state = 'frozen'"),
  );
  expect(frozen).toBe(1);
  expect(
    Number(scratchQuery("select count(*) from meal_entry where origin = 'recipe_box'")),
  ).toBeGreaterThan(4);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.screenshot({ path: `${CAPTURES}/box-week-${viewport.name}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 393, height: 852 });
});

test('F92 two takeaway meals are proposed as dish types with a search link and no stored menu', async ({
  page,
}) => {
  await signIn(page);

  // A target is what the proposal is computed against.
  await page.goto('/eat/targets');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-sex="male"]').click();
  await typeInto(page, '#target-age', '44');
  await typeInto(page, '#target-height', '182');
  await typeInto(page, '#target-weight', '92');
  await page.locator('[data-level="light"]').click();
  await typeInto(page, '#target-rate', '0.50');
  await page.locator('[data-action="save-target"]').click().catch(() => undefined);
  await page.waitForLoadState('networkidle');

  await page.goto('/eat');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-action="propose"]').first().click();
  await page.locator('[data-slot="1"]').waitFor();

  const slots = page.locator('[data-slot]');
  await expect(slots).toHaveCount(2);

  const urls = await page.locator('[data-search="true"]').evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLAnchorElement).href),
  );
  console.log(`F92: the two generated links are ${urls.join(' and ')}`);
  for (const url of urls) {
    const parsed = new URL(url);
    expect(parsed.host).toBe('www.ubereats.com');
    expect(parsed.pathname).toBe('/search');
    expect([...parsed.searchParams.keys()]).toEqual(['q']);
  }

  // No menu row anywhere, and the population is the whole table list.
  const tables = scratchQuery(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
  ).split('\n');
  console.log(`F92: ${tables.length} tables in this database: ${tables.join(', ')}`);
  expect(tables.length).toBeGreaterThan(20);
  for (const name of tables) {
    expect(name).not.toMatch(/menu|price|restaurant/);
  }
  const columns = scratchQuery(
    "select table_name || '.' || column_name from information_schema.columns where table_schema = 'public' and (column_name like '%price%' or column_name like '%menu%' or column_name like '%restaurant%')",
  );
  console.log(`F92: columns naming a menu, a price or a restaurant: ${columns || 'none'}`);
  expect(columns).toBe('');

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.screenshot({ path: `${CAPTURES}/takeaway-${viewport.name}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 393, height: 852 });
});

test('F98 the monthly ceiling refuses the call, and the ledger says so', async ({ page }) => {
  await signIn(page);
  await turnOnPhotoAnalysis(page);

  /*
   * The scratch instance is capped at 0.03 USD with the demonstration priced at
   * the rates in scripts/test-stack.sh. Earlier tests in this file have already
   * spent some of it, so this walks until the refusal arrives rather than
   * assuming which call it lands on, and prints every attempt.
   */
  let refused = false;
  for (let attempt = 1; attempt <= 8 && !refused; attempt += 1) {
    await page.goto('/eat/estimate');
    await page.waitForLoadState('networkidle');
    await choosePhoto(page);
    await page.locator('[data-action="send"]').click();

    const error = page.locator('.card.error[data-state="error"]');
    const estimate = page.locator('[data-meal-estimate="estimate"]');
    await Promise.race([
      error.waitFor({ timeout: 30_000 }).catch(() => undefined),
      estimate.waitFor({ timeout: 30_000 }).catch(() => undefined),
    ]);
    refused = await error.isVisible();
    const spent = scratchQuery(
      "select round(sum(cost_usd)::numeric, 4) from usage_ledger where outcome = 'charged'",
    );
    console.log(`F98: attempt ${attempt}, refused ${refused}, spent so far ${spent} USD`);
  }

  expect(refused).toBe(true);
  await expect(page.getByText(strings.meals.ceilingReachedTitle)).toBeVisible();

  const rows = scratchQuery(
    "select outcome || ' ' || input_tokens || ' ' || output_tokens || ' ' || cost_usd from usage_ledger order by created_at",
  );
  console.log(`F98: the ledger for this month reads\n${rows}`);
  expect(rows).toContain('refused_over_ceiling');

  // A refused call carries no output tokens and no cost, and the call table has
  // no row for it, because nothing was sent.
  const refusals = Number(
    scratchQuery(
      "select count(*) from usage_ledger where outcome = 'refused_over_ceiling' and (cost_usd <> 0 or output_tokens <> 0)",
    ),
  );
  expect(refusals).toBe(0);
  const charged = Number(
    scratchQuery("select count(*) from usage_ledger where outcome = 'charged'"),
  );
  const calls = Number(scratchQuery('select count(*) from ai_call'));
  console.log(`F98: ${charged} charged row(s) and ${calls} call row(s), which must be equal`);
  expect(calls).toBe(charged);
});

test('F99 with the provider unreachable the Eat tab still renders and the estimate names the cause', async ({
  page,
}) => {
  await signIn(page);
  await turnOnPhotoAnalysis(page);

  // The provider, blocked at the browser. The demonstration path never opens a
  // socket, so what is simulated here is the request to this machine failing,
  // which is what the owner sees when anything between him and the estimate is
  // down.
  await page.route('**/api/meals/estimate', (route) => route.abort('failed'));

  await page.goto('/eat/estimate');
  await page.waitForLoadState('networkidle');
  await choosePhoto(page);
  await page.locator('[data-action="send"]').click();

  const error = page.locator('.card.error[data-state="error"]');
  await error.waitFor();
  await expect(error.locator('[data-authored="platform"]')).toBeVisible();
  await expect(page.getByText(strings.meals.errorBodyRest)).toBeVisible();
  await page.screenshot({ path: `${CAPTURES}/estimate-provider-down.png`, fullPage: true });

  await page.unroute('**/api/meals/estimate');

  // And the rest of the tab is unaffected: the week, the meals and the list.
  await page.goto('/eat');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-card="today"]')).toBeVisible();
  await expect(page.locator('[data-box-week="open"]').or(page.locator('.card.empty'))).toBeVisible();
  await page.goto('/eat/shopping');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('body')).toBeVisible();
  await page.screenshot({ path: `${CAPTURES}/eat-with-provider-down.png`, fullPage: true });
});
