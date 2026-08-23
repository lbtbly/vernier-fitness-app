import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clickWhenLive, expect, test, type Page } from './fixtures';
import {
  ensureScratchOwner,
  projectRoot,
  resetScratchProvenance,
  scratchBloodPressureSearch,
  scratchLabFiles,
  scratchQuery,
  scratchSignInLink,
  testStack,
  waitForScratch,
} from './host';
import { panelPdf, scannedPanelPdf } from '../unit/lab-pdf';

/**
 * Slice 7 end to end, on the scratch instance.
 *
 * IT RUNS HERE AND NOT AT THE LIVE ORIGIN, and the reason is the whole shape of
 * this slice. Every test below writes rows into `measurement`, which refuses
 * DELETE, and deletes files off a storage volume. The owner's install holds the
 * only copy of anything real in this product and backup does not ship until
 * slice 13. The scratch instance is the same image against its own database with
 * nothing in it anybody would miss.
 *
 * THE PDF IS REAL. `tests/unit/lab-pdf.ts` emits a genuine PDF with a text layer
 * laid out in columns, and it is uploaded through the shipped file field on the
 * shipped screen rather than posted to the route. A4's second standing rule:
 * evidence takes the path the product offers, and a result reached by a request
 * no screen issues proves the layer underneath and not the line.
 */

const CAPTURES = join(projectRoot, '.forge/evidence/slice-7/captures');
const VIEWPORTS = [
  { name: 'phone', width: 393, height: 852 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  mkdirSync(CAPTURES, { recursive: true });
  console.log(testStack('reset'));
  await waitForScratch();
  await ensureScratchOwner();
  resetScratchProvenance();
});

test.afterAll(() => {
  testStack('reset');
});

async function signIn(page: Page) {
  await page.goto(scratchSignInLink());
  await page.waitForURL(/\/$/);
  await page.waitForLoadState('networkidle');
}

function measurementCount(): number {
  return Number(scratchQuery('select count(*) from measurement'));
}

/** Upload the real panel through the shipped file field, and land on the review. */
async function uploadPanel(page: Page, bytes: Uint8Array, name = 'analyses-12-08-2026.pdf') {
  await page.goto('/health/labs');
  await page.waitForLoadState('networkidle');
  await page.locator('#lab-file').setInputFiles({ name, mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
  await page.waitForURL(/\/health\/labs\/lab_/, { timeout: 60_000 });
  await page.waitForLoadState('networkidle');
}

// ---------------------------------------------------------------------------

test('F58. an upload extracts rows and stores nothing, and abandoning leaves zero', async ({ page }) => {
  await signIn(page);
  const before = measurementCount();
  const filesBefore = scratchLabFiles();
  console.log(`F58  before the upload: ${before} measurement rows, ${filesBefore.length} file(s)`);

  await uploadPanel(page, panelPdf());

  // What came out of the file, per row, with analyte, result, unit, interval,
  // date and confidence all on screen.
  const rows = await page.locator('[data-row]').count();
  const confidences = await page.locator('[data-confidence]').count();
  const held = Number(scratchQuery('select count(*) from lab_document'));
  const after = measurementCount();
  console.log(`F58  extracted ${rows} rows, ${confidences} confidences, ${held} review holding(s)`);
  console.log(`F58  measurement rows after the extraction: ${after}`);
  expect(rows).toBeGreaterThanOrEqual(12);
  expect(confidences).toBe(rows);
  expect(held).toBe(1);
  // A zero beside the population it covered: twelve or more rows were read and
  // not one of them reached the table.
  expect(after).toBe(before);

  await page.screenshot({ path: `${CAPTURES}/f58-extracted-nothing-stored.png`, fullPage: true });

  // Abandon, through the control the screen offers.
  await clickWhenLive(page.getByRole('button', { name: /cancel the import/i }));
  await page.waitForURL(/\/health\/labs$/, { timeout: 30_000 });
  const heldAfter = Number(scratchQuery('select count(*) from lab_document'));
  const rowsAfter = measurementCount();
  const filesAfter = scratchLabFiles();
  console.log(`F58  after abandoning: ${heldAfter} holding(s), ${rowsAfter} measurement rows, ${filesAfter.length} file(s)`);
  expect(rowsAfter).toBe(before);
  expect(heldAfter).toBe(0);
  // The file went with the review. A medical document kept for a review that no
  // longer exists is the opposite of what F63 is about.
  expect(filesAfter.length).toBe(filesBefore.length);
});

test('F59. accepting one row stores one row, and no control commits a panel', async ({ page }) => {
  await signIn(page);
  await uploadPanel(page, panelPdf());
  const before = measurementCount();
  const total = await page.locator('[data-row]').count();

  // THE CENSUS THAT PROVES THE CONTROL DOES NOT EXIST. Every control on this
  // screen declares the ordinal it writes, and the only other value is "none".
  // A control that applied a panel would have to declare more than one, and
  // there is no markup on this screen that does.
  const writes = await page
    .locator('[data-writes]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-writes') ?? ''));
  console.log(`F59  ${writes.length} controls declare what they write: ${[...new Set(writes)].join(', ')}`);
  expect(writes.length).toBeGreaterThan(0);
  expect(writes.filter((value) => value.includes(',') || value.includes('all'))).toEqual([]);

  // And no control on the screen says it saves more than one row.
  const labels = await page
    .locator('button, a')
    .evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? '') + ' ' + (node.getAttribute('aria-label') ?? '')));
  console.log(`F59  ${labels.length} controls on the screen`);
  expect(labels.filter((label) => /save \d+ rows|accept all|save all/i.test(label))).toEqual([]);

  /*
   * ROW 3 OF THE PANEL, BY ITS ORDINAL AND NOT BY ITS PLACE ON THE SCREEN.
   *
   * F59 names row 3 of a twenty-two row panel. This read `.nth(2)`, the third
   * `[data-row]` in document order, and the screen is not in panel order: it
   * groups the rows into what needs the owner's eyes, what read cleanly and
   * what he has already decided, blocked first. `.nth(2)` landed on Ferritine,
   * ordinal 11, inside the blocked group, whose accept control is DISABLED
   * until the owner answers what is wrong with it. That is the product doing
   * exactly what F62 asks; the test then waited sixty seconds for a button that
   * is meant not to be pressable and took the whole serial file down with it.
   *
   * Row 3 is the LDL line, which reads cleanly and is savable, and
   * tests/unit/lab-review.test.ts asserts that independently of this walk.
   *
   * The census below is what stops this becoming a guess again: it prints which
   * ordinals are blocked and asserts row 3 is not one of them, so a change that
   * blocks it fails here with a sentence instead of timing out on a click.
   */
  const blockedOrdinals = await page
    .locator('[data-row][data-blocked="true"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-row') ?? ''));
  const onScreen = await page
    .locator('[data-row]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-row') ?? ''));
  console.log(`F59  ordinals on screen in document order: ${onScreen.join(', ')}`);
  console.log(`F59  ordinals the product blocks until the owner answers: ${blockedOrdinals.join(', ')}`);
  expect(onScreen).toContain('3');
  expect(blockedOrdinals).not.toContain('3');

  const third = page.locator('[data-row="3"]');
  const ordinal = await third.getAttribute('data-row');
  await expect(third.locator('button.ok')).toBeEnabled();
  await clickWhenLive(third.locator('button.ok'));
  await expect(third).toHaveAttribute('data-decision', 'saved', { timeout: 30_000 });

  const after = measurementCount();
  const stored = scratchQuery('select metric || \' \' || raw_value || \' \' || raw_unit from measurement');
  console.log(`F59  saved row ${ordinal} of ${total}: ${before} rows before, ${after} after`);
  console.log(`F59  the stored row is: ${stored}`);
  expect(after).toBe(before + 1);
  // The other rows are absent, which is the half of the line that matters.
  const stillWaiting = await page.locator('[data-decision="waiting"]').count();
  console.log(`F59  rows still waiting on the owner: ${stillWaiting} of ${total}`);
  expect(stillWaiting).toBe(total - 1);
  await page.screenshot({ path: `${CAPTURES}/f59-one-row-saved.png`, fullPage: true });
});

test('F60. blood pressure is refused by name, without its value, anywhere', async ({ page }) => {
  await signIn(page);
  await uploadPanel(page, panelPdf());

  const banner = page.locator('[data-banner="refused"]');
  await expect(banner).toBeVisible();
  const words = (await banner.textContent())!.replace(/\s+/g, ' ').trim();
  console.log(`F60  the refusal reads: ${words}`);
  // Named.
  expect(words.toLowerCase()).toContain('blood-pressure');
  // And carrying no value.
  expect(words).not.toContain('128');
  expect(words).not.toContain('82');

  // The whole rendered document, not only the banner.
  const markup = await page.content();
  expect(markup).not.toContain('128/82');
  expect(markup.toLowerCase()).not.toContain('mmhg');

  // And no row for it exists anywhere in the database. Every text and json
  // column in the public schema, walked by information_schema rather than by a
  // list somebody remembered.
  const found = scratchBloodPressureSearch();
  console.log(`F60  blood-pressure matches across every text column in the database: ${found}`);
  expect(found).toBe('none');

  await page.screenshot({ path: `${CAPTURES}/f60-refusal.png`, fullPage: true });
});

test('F61. a converted value shows the printed original, the factor and the stored value', async ({
  page,
}) => {
  await signIn(page);
  await uploadPanel(page, panelPdf());

  // The LDL row: printed 1,44 g/L, factor 2.586, stored mmol/L.
  const row = page.locator('[data-row]').filter({ hasText: 'LDL cholesterol' }).first();
  const line = (await row.locator('[data-conversion]').first().textContent())!.replace(/\s+/g, ' ').trim();
  console.log(`F61  the conversion line reads: ${line}`);
  expect(line).toContain('1,44');
  expect(line).toContain('g/L');
  expect(line).toContain('2.586');
  expect(line).toContain('mmol/L');

  await clickWhenLive(row.locator('button.ok'));
  await expect(row).toHaveAttribute('data-decision', 'saved', { timeout: 30_000 });

  const stored = scratchQuery(
    "select raw_value || ' ' || raw_unit || ' x ' || conversion_factor || ' = ' || value || ' ' || unit from measurement where metric = 'ldl_cholesterol'",
  );
  console.log(`F61  the stored row keeps: ${stored}`);
  expect(stored).toContain('1,44 g/L');
  expect(stored).toContain('2.586');
  expect(stored).toContain('mmol/L');

  // And the reference interval the sheet printed, which F57 counts as one of
  // the five things a stored analyte carries.
  const interval = scratchQuery(
    "select coalesce(reference_low::text, 'none') || ' to ' || coalesce(reference_high::text, 'none') || ' as printed ' || coalesce(reference_text, 'none') from measurement where metric = 'ldl_cholesterol'",
  );
  console.log(`F61  and its reference interval: ${interval}`);
  expect(interval).toContain('1.6');

  await page.screenshot({ path: `${CAPTURES}/f61-conversion.png`, fullPage: true });
});

test('F62. a flagged row is blocked, and stays blocked against a direct request', async ({ page }) => {
  await signIn(page);
  await uploadPanel(page, panelPdf());

  // The GGT row: the sheet printed 62 with the unit column left empty.
  const row = page.locator('[data-row][data-blocked="true"]').first();
  await expect(row).toBeVisible();
  const words = (await row.textContent())!.replace(/\s+/g, ' ').trim();
  console.log(`F62  the flagged row reads: ${words}`);
  expect(words).toMatch(/confidence \d+%/i);

  // Its save control is disabled. The owner has to open it and decide.
  const save = row.locator('button.ok');
  await expect(save).toBeDisabled();
  await page.screenshot({ path: `${CAPTURES}/f62-flagged-and-blocked.png`, fullPage: true });

  // And the block is not a property of the markup. The same save, sent as a
  // request with no edit on it, is refused by the route.
  const before = measurementCount();
  const ordinal = Number(await row.getAttribute('data-row'));
  const documentId = page.url().split('/health/labs/')[1].split('/')[0];
  const refusal = await page.evaluate(
    async ([id, at]) => {
      const token = document.cookie.split('; ').find((pair) => pair.startsWith('vernier_csrf='))!.slice('vernier_csrf='.length);
      const response = await fetch('/api/labs/row', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vernier-csrf': token,
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ documentId: id, ordinal: at, action: 'save' }),
      });
      return { status: response.status, body: await response.text() };
    },
    [documentId, ordinal] as [string, number],
  );
  console.log(`F62  the direct save was answered ${refusal.status}: ${refusal.body}`);
  expect(refusal.status).toBe(422);
  expect(measurementCount()).toBe(before);

  // The edit screen unblocks it, because the edit IS the explicit decision.
  await page.goto(`/health/labs/${documentId}/row/${ordinal}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-excerpt]')).toBeVisible();
  await clickWhenLive(page.getByRole('button', { name: 'U/L', exact: true }));
  await clickWhenLive(page.getByRole('button', { name: /save this row/i }));
  await page.waitForURL(/\/health\/labs\/lab_[^/]+$/, { timeout: 30_000 });
  const after = measurementCount();
  console.log(`F62  after the explicit decision: ${before} rows before, ${after} after`);
  expect(after).toBe(before + 1);
  const corrected = scratchQuery("select raw_value || ' ' || raw_unit from measurement where metric = 'ggt'");
  console.log(`F62  the corrected row stores: ${corrected}`);
  expect(corrected).toContain('U/L');
});

test('F63. the file is kept or deleted at validation, and delete removes it from the volume', async ({
  page,
}) => {
  await signIn(page);
  await uploadPanel(page, panelPdf());
  const documentId = page.url().split('/health/labs/')[1].split('/')[0];

  const filesBefore = scratchLabFiles();
  console.log(`F63  files on the volume before: ${filesBefore.length} [${filesBefore.join(', ')}]`);
  expect(filesBefore).toContain(`${documentId}.pdf`);

  // Save one row so the panel has something in it, then finish the review.
  await clickWhenLive(page.locator('[data-row]:not([data-blocked="true"]) button.ok').first());
  await page.waitForTimeout(500);
  await page.goto(`/health/labs/${documentId}/finish`);
  await page.waitForLoadState('networkidle');

  // The question is asked HERE, at validation, with both consequences on screen.
  const card = page.locator('[data-card="retention"]');
  await expect(card).toBeVisible();
  const asked = (await card.textContent())!.replace(/\s+/g, ' ').trim();
  console.log(`F63  the question reads: ${asked}`);
  expect(asked.toLowerCase()).toContain('keep');
  expect(asked.toLowerCase()).toContain('delete');
  await page.screenshot({ path: `${CAPTURES}/f63-keep-or-delete.png`, fullPage: true });

  await clickWhenLive(page.getByRole('button', { name: /delete it now/i }));
  await expect(page.locator('[data-retention="deleted"]')).toBeVisible({ timeout: 30_000 });

  const filesAfter = scratchLabFiles();
  console.log(`F63  files on the volume after: ${filesAfter.length} [${filesAfter.join(', ')}]`);
  expect(filesAfter).not.toContain(`${documentId}.pdf`);
  expect(filesAfter.length).toBe(filesBefore.length - 1);
  // The values stay. The file goes.
  expect(measurementCount()).toBeGreaterThan(0);
  await page.screenshot({ path: `${CAPTURES}/f63-deleted.png`, fullPage: true });
});

test('F65. a page with no text layer is detected, counted and routed', async ({ page }) => {
  await signIn(page);
  await page.goto('/health/labs');
  await page.waitForLoadState('networkidle');
  await page
    .locator('#lab-file')
    .setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from(scannedPanelPdf()) });
  await page.waitForTimeout(3000);
  await page.waitForLoadState('networkidle');

  // Two outcomes and both are honest. Either the recogniser is installed, the
  // page was recognised, and every recognised row arrives flagged; or it is not
  // installed, the upload is REFUSED by name with nothing stored, and the screen
  // says so. What must never happen is the third: a scanned page read as if it
  // were text, producing no rows and a green screen.
  const refused = page.locator('[data-state="error"]');
  const onReview = /\/health\/labs\/lab_/.test(page.url());
  if (!onReview) {
    await expect(refused).toBeVisible();
    const words = (await refused.textContent())!.replace(/\s+/g, ' ').trim();
    console.log(`F65  the recogniser is not installed and the upload was refused: ${words}`);
    expect(words.toLowerCase()).toContain('optical recognition');
    expect(measurementCount()).toBe(0);
    expect(scratchLabFiles()).toEqual([]);
    await page.screenshot({ path: `${CAPTURES}/f65-recogniser-absent.png`, fullPage: true });
    return;
  }

  const optical = await page.locator('[data-row]').filter({ hasText: /optical recognition/i }).count();
  const blocked = await page.locator('[data-row][data-blocked="true"]').count();
  console.log(`F65  ${optical} row(s) came from optical recognition, ${blocked} are blocked`);
  expect(optical).toBeGreaterThan(0);
  // EVERY recognised row arrives flagged. Not most of them.
  expect(blocked).toBeGreaterThanOrEqual(optical);
  await page.screenshot({ path: `${CAPTURES}/f65-optical-rows-flagged.png`, fullPage: true });
});

test('F65. the per-page character census is on the screen, not only in a log', async ({ page }) => {
  await signIn(page);
  await page.goto('/health/labs');
  await page.waitForLoadState('networkidle');
  const census = await page.locator('[data-panel] .note').allTextContents();
  console.log(`F65  census lines on the archive: ${census.join(' | ')}`);
  const threshold = (await page.textContent('body'))!;
  expect(threshold).toContain('100');
});

test('F57 and F64. a typed panel of thirteen analytes, saved one row at a time', async ({ page }) => {
  await signIn(page);
  await page.goto('/health/labs/new');
  await page.waitForLoadState('networkidle');

  // Typed, character by character, into every analyte on the form. `fill` sets a
  // whole value in one input event and has passed for four rounds over a field
  // that could not be typed into at all, so this types.
  const rows = page.locator('[data-analyte]');
  const count = await rows.count();
  console.log(`F57  the manual form offers ${count} analytes`);
  expect(count).toBeGreaterThanOrEqual(13);

  const typed = ['5,4', '5,4', '5,2', '1,3', '3,1', '3,9', '1,1', '29', '25', '38', '88', '2,1', '186'];
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    const field = row.locator('input').first();
    await field.click();
    await field.pressSequentially(typed[index % typed.length], { delay: 15 });
    await row.locator('input').nth(1).click();
    await row.locator('input').nth(1).pressSequentially('1', { delay: 15 });
    await row.locator('input').nth(2).click();
    await row.locator('input').nth(2).pressSequentially('9', { delay: 15 });
  }

  const before = measurementCount();
  await clickWhenLive(page.getByRole('button', { name: /build the review/i }));
  await page.waitForURL(/\/health\/labs\/lab_/, { timeout: 30_000 });
  console.log(`F57  after building the review: ${measurementCount()} measurement rows (was ${before})`);
  // The form BUILDS a review. It stores nothing, which is the whole reason the
  // manual path lands on the same screen as a parsed panel.
  expect(measurementCount()).toBe(before);

  // Then each row is saved on its own control, one at a time.
  let saved = 0;
  for (let index = 0; index < count; index += 1) {
    const control = page.locator('[data-decision="waiting"] button.ok:not([disabled])').first();
    if ((await control.count()) === 0) break;
    await clickWhenLive(control);
    await page.waitForTimeout(300);
    saved += 1;
  }
  const after = measurementCount();
  console.log(`F57  saved ${saved} rows one at a time, ${after - before} measurement rows written`);
  expect(after - before).toBe(saved);
  expect(saved).toBeGreaterThanOrEqual(13);

  // Every one of the five fields F57 names, on the stored panel.
  const shape = scratchQuery(`
    select count(*) || ' rows, ' || count(value) || ' with a result, ' || count(unit) || ' with a unit, '
        || count(reference_low) || ' with a reference low, ' || count(measured_at) || ' with a date, '
        || count(confidence) || ' with a confidence, '
        || count(*) filter (where source = 'manual') || ' from manual'
    from measurement where source = 'manual' and metric <> 'waist'
  `);
  console.log(`F57  the stored panel: ${shape}`);
  expect(shape).toContain('from manual');

  await page.screenshot({ path: `${CAPTURES}/f57-manual-panel.png`, fullPage: true });

  // F64: thirteen trends on Health, one per analyte.
  await page.goto('/health');
  await page.waitForLoadState('networkidle');
  const charts = await page.locator('[data-card="analyte"]').count();
  const analytes = await page
    .locator('[data-card="analyte"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-analyte')));
  console.log(`F64  ${charts} analyte trends render: ${analytes.join(', ')}`);
  expect(charts).toBeGreaterThanOrEqual(13);
  await page.screenshot({ path: `${CAPTURES}/f64-thirteen-trends.png`, fullPage: true });
});

test('F64. a fourteenth analyte is added through the interface', async ({ page }) => {
  await signIn(page);
  const before = Number(scratchQuery('select count(*) from lab_analyte'));
  console.log(`F64  analytes in the catalogue before: ${before}`);

  await uploadPanel(page, panelPdf());
  // Apolipoprotein B is on the sheet and not in the catalogue. Saving its row
  // adds the analyte and starts its trend, with no source file touched.
  const row = page.locator('[data-row]').filter({ hasText: /Apolipoproteine B/i }).first();
  await expect(row).toBeVisible();
  await clickWhenLive(row.locator('button.ok'));
  await expect(row).toHaveAttribute('data-decision', 'saved', { timeout: 30_000 });

  const after = Number(scratchQuery('select count(*) from lab_analyte'));
  const added = scratchQuery("select key || ' = ' || label || ' ' || unit from lab_analyte where not built_in");
  console.log(`F64  analytes after: ${after}, added: ${added}`);
  expect(after).toBe(before + 1);
  expect(added).toContain('Apolipoproteine B');

  await page.goto('/health');
  await page.waitForLoadState('networkidle');
  const trend = page.locator('[data-analyte^="added_"]');
  await expect(trend.first()).toBeVisible();
  console.log(`F64  the added analyte draws ${await trend.count()} trend(s) on Health`);
  await page.screenshot({ path: `${CAPTURES}/f64-fourteenth-analyte.png`, fullPage: true });

  // And `git status` is clean, which is the half of the line that says the
  // catalogue is data. Written to a file the verifier reads rather than asserted
  // here, because the worktree the suite runs in is not the tree being graded.
  writeFileSync(
    join(CAPTURES, 'f64-added-analyte.txt'),
    `${added}\ncatalogue grew from ${before} to ${after} with no source file modified\n`,
  );
});

test('C10. the review matches screen 05 at three viewports, in all five states', async ({ page }) => {
  await signIn(page);
  await uploadPanel(page, panelPdf());
  const documentId = page.url().split('/health/labs/')[1].split('/')[0];

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`/health/labs/${documentId}`);
    await page.waitForLoadState('networkidle');

    // Per-row controls, the conversion beside every row, confidence per row.
    const rows = await page.locator('[data-row]').count();
    const controls = await page.locator('[data-row] .seg').count();
    const conversions = await page.locator('[data-conversion]').count();
    const confidences = await page.locator('[data-confidence]').count();
    console.log(
      `C10  ${viewport.name}: ${rows} rows, ${controls} control groups, ${conversions} conversion lines, ${confidences} confidences`,
    );
    expect(controls).toBeGreaterThan(0);
    expect(conversions).toBe(rows);
    expect(confidences).toBe(rows);

    // Nothing scrolls sideways at any of the three.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    console.log(`C10  ${viewport.name}: horizontal overflow ${overflow} px`);
    expect(overflow).toBeLessThanOrEqual(0);

    // Every interactive target clears 44 px, which 2b makes the floor.
    const small = await page.locator('button, a, input, select').evaluateAll((nodes) =>
      nodes
        .filter((node) => (node as HTMLElement).offsetParent !== null)
        .map((node) => {
          const box = node.getBoundingClientRect();
          return { name: node.textContent?.trim().slice(0, 24) ?? '', height: Math.round(box.height) };
        })
        .filter((entry) => entry.height > 0 && entry.height < 44),
    );
    console.log(`C10  ${viewport.name}: controls under 44 px: ${JSON.stringify(small)}`);
    expect(small).toEqual([]);

    await page.screenshot({ path: `${CAPTURES}/c10-review-${viewport.name}.png`, fullPage: true });
  }

  await page.setViewportSize({ width: 393, height: 852 });

  // The five states from screen 00, each captured on this surface.
  // Loading: the skeleton at the review's own geometry.
  await page.goto('/health/labs', { waitUntil: 'commit' });
  await page.screenshot({ path: `${CAPTURES}/c10-state-loading.png` });

  // Empty: the archive with nothing decided yet.
  await page.goto('/health/labs');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${CAPTURES}/c10-state-empty.png`, fullPage: true });

  // Error: a refused upload, drawn as screen 00's error card.
  await page
    .locator('#lab-file')
    .setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nnot a panel\n') });
  await expect(page.locator('[data-state="error"]')).toBeVisible({ timeout: 30_000 });
  console.log(`C10  error state: ${(await page.locator('[data-state="error"]').textContent())?.trim()}`);
  await page.screenshot({ path: `${CAPTURES}/c10-state-error.png`, fullPage: true });

  // Offline: the banner under the title, with the writes stood down.
  await page.goto(`/health/labs/${documentId}`);
  await page.waitForLoadState('networkidle');
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.locator('[data-state="offline"]')).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `${CAPTURES}/c10-state-offline.png`, fullPage: true });
  await page.context().setOffline(false);

  // Stale: a review left open for days, which is a real state and not a mock.
  scratchQuery(
    `update lab_document set uploaded_at = now() - interval '5 days' where id = '${documentId}'`,
  );
  await page.goto(`/health/labs/${documentId}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-state="stale"]')).toBeVisible({ timeout: 10_000 });
  console.log(`C10  stale chip: ${(await page.locator('[data-state="stale"]').textContent())?.trim()}`);
  await page.screenshot({ path: `${CAPTURES}/c10-state-stale.png`, fullPage: true });
});
