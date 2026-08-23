import { mkdirSync } from 'node:fs';
import { countWhenDrawn, expect, retypeInto, test, type Page } from './fixtures';
import {
  ensureScratchOwner,
  projectRoot,
  scratchAttempt,
  scratchQuery,
  scratchSignInLink,
  testStack,
  waitForScratch,
} from './host';

/**
 * The shopping list, screen 10, walked in a browser.
 *
 * ON THE SCRATCH INSTANCE, FOR THE SAME REASON nutrition.spec.ts is: every
 * assertion here needs a write. A confirmed week, a ticked box, an adjusted
 * quantity and an item marked in stock are all rows in the owner's database, and
 * driving this at the live origin would empty his trolley on every run.
 *
 * WHAT F88 AND F89 ACTUALLY ASK FOR, AND HOW EACH IS PROVEN HERE:
 *
 *   F88  one list grouped by aisle, adjustable quantities, and CHECK BOXES THAT
 *        SURVIVE A PAGE RELOAD. The reload is a real reload, and the assertion
 *        reads the column as well as the screen, so a tick held only in React
 *        state fails.
 *   F89  box-supplied and in-stock items render as VISIBLY DEDUCTED, showing the
 *        original quantity struck through, RATHER THAN DISAPPEARING. Every
 *        assertion below looks for the row. The obvious implementation, which is
 *        to filter it out, fails all of them.
 */

const CAPTURES = `${projectRoot}.forge/evidence/slice-9/captures`;

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
 * Typed one keystroke at a time, never `fill()`, and emptied with a real
 * select-all first.
 *
 * `Meta+A` reads as a SHIFTED A in Playwright, so the clear this used to do
 * selected nothing, the Backspace after it deleted nothing, and the value typed
 * next went in front of the value already there: "0.330.33" in `#target-rate`,
 * which is where F88 failed.
 */
async function typeInto(page: Page, selector: string, value: string) {
  await retypeInto(page.locator(selector), value);
}

/**
 * A target, a week, every meal accepted, and the list built from it.
 *
 * Every step goes through the shipped screens rather than through SQL, because
 * a list built by an insert proves the renderer and not the product.
 */
async function buildAWeek(page: Page) {
  await page.goto('/eat/targets');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-sex="male"]').click();
  await typeInto(page, '#target-age', '38');
  await typeInto(page, '#target-height', '183');
  await typeInto(page, '#target-weight', '89.0');
  await page.locator('[data-level="light"]').click();
  await typeInto(page, '#target-rate', '0.33');
  await page.locator('[data-control="save-target"]').click();
  await expect(page.locator('[data-target="saved"]')).toBeVisible();

  await typeInto(page, '#generate-max-cook', '60');
  await page.locator('[data-control="generate-week"]').click();
  await page.waitForURL(/\/eat$/);
  await page.waitForLoadState('networkidle');

  // Accept every meal, one at a time, which is the only way this product has.
  //
  // `countWhenDrawn` rather than `count`, because /eat has a loading.tsx and
  // `networkidle` fires while the skeleton is still the screen. This counted 0
  // against a page that read "Building next week".
  const rows = page.locator('[data-meal]');
  const total = await countWhenDrawn(rows);
  expect(total).toBeGreaterThan(0);
  for (let index = 0; index < total; index += 1) {
    await rows.nth(index).locator('[data-control="accept"]').click();
    await page.waitForLoadState('networkidle');
  }
  const accepted = Number(scratchQuery("select count(*) from planned_meal where state = 'accepted'"));
  console.log(`accepted ${accepted} of ${total} meals, one at a time`);
  expect(accepted).toBe(total);

  await page.locator('.stickybar .btn.primary').click();
  await page.waitForLoadState('networkidle');
}

test.describe('F88: one list, grouped by aisle, whose ticks survive a reload', () => {
  test('the list builds from the confirmed week and is grouped the way a shop is walked', async ({
    page,
  }) => {
    await signIn(page);
    await buildAWeek(page);

    await page.goto('/eat/shopping');
    await page.waitForLoadState('networkidle');

    const aisles = await page.locator('[data-aisle]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-aisle')),
    );
    const items = Number(scratchQuery('select count(*) from shopping_item'));
    console.log(`shopping list: ${items} lines across aisles ${aisles.join(', ')}`);
    expect(items).toBeGreaterThan(0);
    expect(aisles.length).toBeGreaterThan(1);
    // Produce is by the door, so it is first when it is present at all.
    if (aisles.includes('produce')) expect(aisles[0]).toBe('produce');

    await expect(page.locator('[data-card="counts"]')).toBeVisible();
  });

  test('a tick survives a page reload, in the column as well as on the screen', async ({ page }) => {
    await signIn(page);
    await page.goto('/eat/shopping');
    await page.waitForLoadState('networkidle');

    const first = page.locator('[data-deduction="none"]').first();
    const id = await first.getAttribute('data-item');
    expect(id).toBeTruthy();
    if (!id) return;

    expect(scratchQuery(`select checked from shopping_item where id = '${id}'`)).toBe('f');
    await first.locator('.boxtap').click();
    await expect(first.locator('[aria-checked="true"]')).toBeVisible();
    // The write goes through the offline outbox, so give the flusher its turn.
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => scratchQuery(`select checked from shopping_item where id = '${id}'`), {
        timeout: 10_000,
      })
      .toBe('t');

    await page.reload();
    await page.waitForLoadState('networkidle');
    const after = page.locator(`[data-item="${id}"]`);
    await expect(after.locator('[aria-checked="true"]')).toBeVisible();
    console.log(`tick on ${id} survived a reload`);
  });

  test('a quantity is adjustable, and the adjustment survives a reload', async ({ page }) => {
    await signIn(page);
    await page.goto('/eat/shopping');
    await page.waitForLoadState('networkidle');

    const row = page.locator('[data-deduction="none"]').first();
    const id = await row.getAttribute('data-item');
    expect(id).toBeTruthy();
    if (!id) return;

    const before = Number(scratchQuery(`select quantity from shopping_item where id = '${id}'`));
    await row.locator('.qty button').last().click();
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => Number(scratchQuery(`select quantity from shopping_item where id = '${id}'`)), {
        timeout: 10_000,
      })
      .toBeGreaterThan(before);

    await page.reload();
    await page.waitForLoadState('networkidle');
    const after = Number(scratchQuery(`select quantity from shopping_item where id = '${id}'`));
    console.log(`quantity on ${id}: ${before} -> ${after}, and it held across a reload`);
    expect(after).toBeGreaterThan(before);
  });
});

test.describe('F89: a deducted line is struck through, not removed', () => {
  test('an item the recipe box supplies keeps its row, its quantity and its reason', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/eat/shopping');
    await page.waitForLoadState('networkidle');

    const boxLines = Number(
      scratchQuery("select count(*) from shopping_item where deduction = 'box'"),
    );
    console.log(`shopping list: ${boxLines} line(s) the recipe box supplies`);
    // The population, so a passing assertion is not a walk over nothing.
    expect(boxLines).toBeGreaterThan(0);

    const box = page.locator('[data-deduction="box"]').first();
    await expect(box).toBeVisible();
    await expect(box).toHaveClass(/off/);
    await expect(box.locator('[data-struck]')).toBeVisible();
    const text = await box.innerText();
    console.log(`box-supplied line:\n${text}`);
    expect(text).toContain('recipe box');
    // No tick control on it: it is already covered, and the row says so.
    await expect(box.locator('.boxtap')).toHaveCount(0);

    await page.screenshot({ path: `${CAPTURES}/shopping-box-deduction.png`, fullPage: true });
  });

  test('marking an item in stock deducts it in place rather than removing it', async ({ page }) => {
    await signIn(page);
    await page.goto('/eat/shopping');
    await page.waitForLoadState('networkidle');

    const row = page.locator('[data-deduction="none"]').first();
    const id = await row.getAttribute('data-item');
    const aliasId = scratchQuery(`select alias_id from shopping_item where id = '${id}'`);
    expect(aliasId.length).toBeGreaterThan(0);

    await row.locator('button[aria-label^="Open"]').click();
    const sheet = page.locator('[data-sheet]');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Where this comes from');
    await sheet.locator('[data-control="in-stock"]').click();
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => Number(scratchQuery(`select count(*) from stock_item where alias_id = '${aliasId}'`)), {
        timeout: 10_000,
      })
      .toBe(1);

    // Rebuild the list, which is what the confirm control does, and the line is
    // deducted rather than gone.
    await page.goto('/eat');
    await page.waitForLoadState('networkidle');
    await page.locator('.stickybar a.btn.primary, .stickybar button.btn.primary').first().click();
    await page.waitForLoadState('networkidle');
    await page.goto('/eat/shopping');
    await page.waitForLoadState('networkidle');

    const stockLines = Number(
      scratchQuery("select count(*) from shopping_item where deduction = 'stock'"),
    );
    const totalLines = Number(scratchQuery('select count(*) from shopping_item'));
    console.log(`after marking in stock: ${stockLines} stock deduction(s) of ${totalLines} lines`);
    expect(totalLines).toBeGreaterThan(0);
    expect(stockLines).toBeGreaterThan(0);

    const stock = page.locator('[data-deduction="stock"]').first();
    await expect(stock).toBeVisible();
    await expect(stock).toHaveClass(/off/);
    await expect(stock.locator('[data-struck]')).toBeVisible();
    const text = await stock.innerText();
    console.log(`in-stock line:\n${text}`);
    expect(text).toContain('In stock');

    await page.screenshot({ path: `${CAPTURES}/shopping-stock-deduction.png`, fullPage: true });
  });

  test('a deducted line is refused a tick, and the refusal says why', async ({ page }) => {
    await signIn(page);
    await page.goto('/eat/shopping');
    await page.waitForLoadState('networkidle');
    // The database refuses it as well as the route, so no future handler can
    // tick a line the box already brought.
    // `scratchAttempt` rather than `scratchQuery`, for the same reason
    // withings.spec.ts and demo-seed.spec.ts already reach for it: a `raise
    // notice` goes to stderr, and `scratchQuery` returns stdout, which for a
    // DO block is the word "DO" and nothing else. The refusal being read back
    // here would never have been in the string.
    const refusal = scratchAttempt(
      `do $$ begin
         begin
           update shopping_item set checked = true where deduction <> 'none';
           raise notice 'a deducted line was ticked';
         exception when others then
           raise notice 'refused: %', sqlerrm;
         end;
       end $$;`,
    );
    console.log(`ticking a deducted line: ${refusal}`);
    expect(refusal).toContain('shopping_item_deducted_is_not_checked');
  });
});

test.describe('C12: the shopping list matches screen 10 at three viewports', () => {
  test('three captures, each showing an aisle group and a deducted line', async ({ page }) => {
    await signIn(page);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/eat/shopping');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[data-card="counts"]')).toBeVisible();
      await expect(page.locator('[data-aisle]').first()).toBeVisible();
      await expect(page.locator('[data-deduction="box"]').first()).toBeVisible();
      await page.screenshot({
        path: `${CAPTURES}/10-shopping-list-${viewport.name}.png`,
        fullPage: true,
      });
    }
  });

  test('the 28 px checkbox glyph sits inside a 44 px target', async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('/eat/shopping');
    await page.waitForLoadState('networkidle');

    const tap = page.locator('.boxtap').first();
    const glyph = tap.locator('.box');
    const tapBox = await tap.boundingBox();
    const glyphBox = await glyph.boundingBox();
    console.log(`checkbox: target ${tapBox?.width}x${tapBox?.height}, glyph ${glyphBox?.width}x${glyphBox?.height}`);
    expect(tapBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(tapBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(Math.round(glyphBox?.width ?? 0)).toBe(28);
    expect(Math.round(glyphBox?.height ?? 0)).toBe(28);

    // And the row it sits in is the 56 px screen 10 draws.
    const row = page.locator('.item').first();
    const rowBox = await row.boundingBox();
    expect(rowBox?.height ?? 0).toBeGreaterThanOrEqual(56);
  });
});
