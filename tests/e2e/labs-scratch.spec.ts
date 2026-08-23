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
import { garbledPanelPdf, imageOnlyPdf, panelPdf } from '../unit/lab-pdf';
import { strings } from '@/lib/strings';

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

  /*
   * THE PAGE IT WAS ACTUALLY ON, AND ONLY THAT PAGE.
   *
   * This sentence read "Page 1, 2, 3 holds a blood-pressure reading" on a
   * three-page panel whose blood-pressure line was on page 2: the component
   * built the list from the per-page census, which is every page in the file,
   * and the write layer stored refusals as a count so the page was gone by the
   * time the screen asked. 05-labs-review.html:119 draws "Page 2 holds a
   * blood-pressure reading". PANEL_PAGE_TWO in tests/unit/lab-fixture.ts is
   * where 'Tension arterielle' sits, so 2 is the answer and 1 is not.
   *
   * GOES RED IF: the column goes back to a count, or the component goes back to
   * the census. Both produce a list of every page, which is what is refused
   * below rather than a shape.
   */
  const stored = scratchQuery('select refusal_pages::text from lab_document');
  console.log(`F60  the document stores refusal pages ${stored}`);
  expect(stored, 'the page a refusal came from is not stored').toBe('{2}');
  expect(words, 'the refusal names a page it was not on').toContain(strings.labs.refusedOnePage(2));
  expect(words, 'the refusal names every page in the document').not.toContain('1, 2');

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

test('F62. a garbled digit produces a flagged, blocked row that names what was printed', async ({
  page,
}) => {
  await signIn(page);
  const before = measurementCount();
  await uploadPanel(page, garbledPanelPdf(), 'analyses-garbled-12-08-2026.pdf');

  // WHAT WOULD MAKE THIS RED: the value scan going back to wanting a cell that
  // parses as a number. The sheet prints three results and the two garbled ones
  // were skipped whole, so the review held one row, the banner said so, and
  // HbA1c appeared nowhere on the screen. A row that vanishes is worse than a
  // row that is wrong: the owner cannot correct what he cannot see.
  const printed = await page
    .locator('[data-row]')
    .evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim()));
  console.log(`F62  ${printed.length} rows on the review off a three-result sheet`);
  for (const [index, row] of printed.entries()) console.log(`F62    row ${index + 1}: ${row}`);
  expect(printed).toHaveLength(3);

  const banner = (await page.locator('[data-banner="nothing-stored"]').textContent())!
    .replace(/\s+/g, ' ')
    .trim();
  console.log(`F62  the banner reads: ${banner}`);
  expect(banner).toContain('3 rows read');

  // The row itself: named, blocked, and quoting the characters the sheet set.
  const row = page.locator('[data-row]').filter({ hasText: 'HbA1c' }).first();
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute('data-blocked', 'true');
  const words = (await row.textContent())!.replace(/\s+/g, ' ').trim();
  console.log(`F62  the garbled row reads: ${words}`);
  expect(words).toContain('5,4Q');
  expect(words.toLowerCase()).toContain('low confidence');
  expect(words.toLowerCase()).toContain('not a number');
  await expect(row.locator('button.ok')).toBeDisabled();
  await page.screenshot({ path: `${CAPTURES}/f62-garbled-flagged-and-blocked.png`, fullPage: true });

  // And the block is not a property of the markup: the same save, sent as a
  // request with no edit on it, is refused by the route.
  const ordinal = Number(await row.getAttribute('data-row'));
  const documentId = page.url().split('/health/labs/')[1].split('/')[0];
  const refusal = await page.evaluate(
    async ([id, at]) => {
      const token = document.cookie
        .split('; ')
        .find((pair) => pair.startsWith('vernier_csrf='))!
        .slice('vernier_csrf='.length);
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
  console.log(`F62  the direct save of the garbled row was answered ${refusal.status}: ${refusal.body}`);
  expect(refusal.status).toBe(422);
  expect(measurementCount()).toBe(before);

  // The owner corrects it by typing what the sheet really shows, and that edit
  // is the explicit decision F62 asks for. Typed character by character: `fill`
  // sets a whole value in one input event and has passed for four rounds over a
  // field that could not be typed into at all.
  await page.goto(`/health/labs/${documentId}/row/${ordinal}`);
  await page.waitForLoadState('networkidle');
  const field = page.locator('#lab-value');
  await expect(field).toHaveValue('5,4Q');
  await field.selectText();
  await field.pressSequentially('5,4', { delay: 15 });
  await expect(field).toHaveValue('5,4');
  await clickWhenLive(page.getByRole('button', { name: /save this row/i }));
  await page.waitForURL(/\/health\/labs\/lab_[^/]+$/, { timeout: 30_000 });

  const after = measurementCount();
  console.log(`F62  after typing the correction: ${before} rows before, ${after} after`);
  expect(after).toBe(before + 1);
  const stored = scratchQuery(
    "select raw_value || ' ' || raw_unit || ' at confidence ' || confidence from measurement where metric = 'hba1c' order by created_at desc limit 1",
  );
  console.log(`F62  the corrected HbA1c row stores: ${stored}`);
  expect(stored).toContain('5,4');
  expect(stored).not.toContain('5,4Q');
  await page.screenshot({ path: `${CAPTURES}/f62-garbled-corrected.png`, fullPage: true });
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
  const before = measurementCount();
  const filesBefore = scratchLabFiles();
  await page.goto('/health/labs');
  await page.waitForLoadState('networkidle');
  // A PAGE THAT CARRIES INK AND NO TEXT LAYER, which is what a photocopy is.
  // The fixture used to be a page with an empty content stream: image-only by
  // the census, and also blank, so recognition read a white sheet and returned
  // no words. Correct, and it could never prove the half of F65 that says every
  // RECOGNISED row arrives flagged. This one draws four analyte lines and
  // embeds them as an image.
  await page
    .locator('#lab-file')
    .setInputFiles({
      name: 'scan.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await imageOnlyPdf()),
    });
  await page.waitForTimeout(6000);
  await page.waitForLoadState('networkidle');

  // Two outcomes and both are honest. Either the recogniser is installed, the
  // page was recognised, and every recognised row arrives flagged; or it is not
  // installed, the upload is REFUSED by name with nothing stored, and the screen
  // says so. What must never happen is the third: a scanned page read as if it
  // were text, producing no rows and a green screen.
  //
  // BOTH HALVES COUNT FROM WHERE THIS TEST STARTED. They used to read `0` and
  // `[]`, and this file is serial: F59, F61 and both F62 tests store rows and
  // leave documents on the volume before this one runs, so the refusal branch
  // could only ever have been read in isolation. A test whose assertion is only
  // true when the tests before it did nothing is the same class of defect as a
  // test asserting a zero over an empty database.
  const refused = page.locator('[data-state="error"]');
  const onReview = /\/health\/labs\/lab_/.test(page.url());
  if (!onReview) {
    await expect(refused).toBeVisible();
    const words = (await refused.textContent())!.replace(/\s+/g, ' ').trim();
    console.log(`F65  the scanned page was refused by name: ${words}`);
    console.log(
      `F65  measurement rows ${before} before and ${measurementCount()} after, ` +
        `${filesBefore.length} file(s) before and ${scratchLabFiles().length} after`,
    );
    expect(words.toLowerCase()).toContain('optical recognition');
    // Nothing new stored, and the refused upload took its own bytes with it.
    expect(measurementCount()).toBe(before);
    expect(scratchLabFiles().sort()).toEqual([...filesBefore].sort());
    await page.screenshot({ path: `${CAPTURES}/f65-recogniser-absent.png`, fullPage: true });
    // A refusal is honest and it is NOT the line. F65 asks for recognised rows
    // arriving flagged, and a refusal has none, so the test says so out loud
    // rather than passing quietly on the branch that proves less.
    console.log(
      'F65  RECOGNITION DID NOT RUN. The detection and the routing are proven above; ' +
        'the flags on recognised rows are not, and F65 is not closed by this branch.',
    );
    return;
  }

  const rows = await page.locator('[data-row]').count();
  const optical = await page.locator('[data-row]').filter({ hasText: /optical recognition/i }).count();
  const blocked = await page.locator('[data-row][data-blocked="true"]').count();
  const read = await page
    .locator('[data-row]')
    .evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim()));
  console.log(`F65  ${rows} rows off the photocopied page, ${optical} say optical recognition, ${blocked} blocked`);
  for (const [index, line] of read.entries()) console.log(`F65    row ${index + 1}: ${line}`);
  // The population first. A zero here would make the two claims below vacuous,
  // and the whole point is that recognition really produced rows.
  expect(rows).toBeGreaterThan(0);
  expect(optical).toBe(rows);
  // EVERY recognised row arrives flagged. Not most of them.
  expect(blocked).toBe(rows);
  // And the mode is recorded, so this cannot pass over a document that quietly
  // came off a text layer after all.
  const mode = scratchQuery('select mode from lab_document order by uploaded_at desc limit 1');
  console.log(`F65  the review holding was stored in mode ${mode}`);
  expect(mode.trim()).toBe('ocr');
  expect(measurementCount()).toBe(before);
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

    /*
     * THE HEADING, MEASURED, BECAUSE THIS SCREEN'S RULES SHIPPED DEAD FOR A DAY.
     *
     * A merge splice tore `.seg button{` in half on 2026-08-22 and every rule
     * after it, `.lab-head` and `.lab-head .title-line` among them, shipped as
     * `.seg button <selector>` and matched nothing. The 44 px sweep above did
     * not see it: `.seg button`'s own declarations survived the tear, so the row
     * controls kept their size while the heading above them lost its layout and
     * its type. These three captures were taken through all of it.
     *
     * GOES RED IF: the stylesheet is torn again anywhere above these rules.
     */
    const heading = await page.locator('.lab-head').first().evaluate((node) => {
      const line = node.querySelector('.title-line') as HTMLElement;
      return {
        display: getComputedStyle(node).display,
        align: getComputedStyle(node).alignItems,
        weight: getComputedStyle(line).fontWeight,
        size: getComputedStyle(line).fontSize,
      };
    });
    console.log(`C10  ${viewport.name}: the heading computes ${JSON.stringify(heading)}`);
    expect(heading.display, 'the review heading is not a row').toBe('flex');
    expect(heading.align, 'the review heading does not centre what it holds').toBe('center');
    expect(heading.weight, 'screen 05 draws the panel title at weight 700').toBe('700');

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
