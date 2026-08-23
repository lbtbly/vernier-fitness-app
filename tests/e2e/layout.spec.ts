import { expect, test, type Page } from './fixtures';
import { mintSignInLink, query } from './host';

/**
 * Two properties of the shipped layout, and both exist because one CSS rule
 * already slipped past a green suite twice.
 *
 * THE FIRST IS THAT NO SCREEN SCROLLS SIDEWAYS. A column that can be dragged
 * off-centre is not a small thing on a phone: the owner sees bare page ground
 * beside every card and nothing tells him what he did. It shipped because
 * `clip-path` hides the paint and not the layout, and a `<table>` will not lay
 * out narrower than its own min-content whatever `width` says, so a hidden
 * chart table 406 px wide sat inside a 361 px card and took the document with
 * it. Nothing in the suite looked at the document's width, so nothing saw it.
 * This does, on every screen, at all three viewports, and it names the widest
 * offending element when it fails so the next one takes a minute rather than a
 * verification.
 *
 * THE SECOND IS THAT THE FIX DID NOT COST THE ACCESSIBILITY TREE. `display:
 * none` also stops the sideways scroll, and it takes every chart table out of
 * the tree with it, which is C8's whole line. So the tables are read back out
 * of the platform's own accessibility tree over the DevTools protocol, by the
 * captions they carry, rather than out of a class name or a computed style.
 * What a class is called is not evidence of what a screen reader is handed.
 */

const VIEWPORTS = [
  { name: '393x852', width: 393, height: 852 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
];

test.skip(
  () => Number(query('select count(*) from owner')) === 0,
  'no owner account on this installation yet',
);

async function signIn(page: Page) {
  await page.goto(mintSignInLink());
  await page.waitForURL(/\/$/);
  await page.waitForLoadState('networkidle');
}

/** The document's own width against the viewport's, plus whoever overflowed. */
async function widths(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const edge = root.clientWidth;
    const over = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .map((node) => {
        const box = node.getBoundingClientRect();
        return {
          what: `${node.tagName.toLowerCase()}${node.className ? `.${String(node.className).split(' ').join('.')}` : ''}`,
          right: Math.round(box.right + window.scrollX),
          width: Math.round(box.width),
        };
      })
      .filter((entry) => entry.right > edge + 1)
      .sort((left, right) => right.right - left.right)
      .slice(0, 5);
    return { scrollWidth: root.scrollWidth, clientWidth: edge, over };
  });
}

test.describe('the layout does not scroll sideways', () => {
  test('no screen is wider than the viewport at any of the three sizes', async ({ page }) => {
    await signIn(page);
    const valueId = query(
      "select id from measurement where seed = true and metric = 'weight' order by measured_at desc limit 1",
    ).trim();
    const sourceId = query(
      'select source_record_id from measurement where seed = true order by measured_at desc limit 1',
    ).trim();

    const screens = [
      { path: '/', name: 'Today' },
      { path: '/health', name: 'Health' },
      { path: '/train', name: 'Train' },
      { path: '/eat', name: 'Eat' },
      { path: '/settings', name: 'Settings' },
      { path: `/value/${valueId}`, name: 'a value' },
      { path: `/source/${sourceId}`, name: 'a source' },
    ];

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const screen of screens) {
        await page.goto(screen.path);
        await page.waitForLoadState('networkidle');
        const measured = await widths(page);
        console.log(
          `SIDEWAYS  ${viewport.name} ${screen.name.padEnd(8)} scrollWidth ${measured.scrollWidth}, clientWidth ${measured.clientWidth}`,
        );
        for (const entry of measured.over) {
          console.log(`SIDEWAYS      overflowing: ${entry.what} ends at ${entry.right}, ${entry.width} px wide`);
        }
        expect(
          measured.scrollWidth,
          `${screen.name} at ${viewport.name} is ${measured.scrollWidth - measured.clientWidth} px wider than its viewport. Widest: ${measured.over.map((entry) => entry.what).join(', ') || 'nothing measurable'}`,
        ).toBeLessThanOrEqual(measured.clientWidth);
      }

      // And the quick-log sheet, which is the one surface that is not a route.
      await page.goto('/');
      await page.getByRole('button', { name: 'Quick log', exact: true }).click();
      await page.locator('.sheet').first().waitFor();
      const sheet = await widths(page);
      console.log(
        `SIDEWAYS  ${viewport.name} quick log scrollWidth ${sheet.scrollWidth}, clientWidth ${sheet.clientWidth}`,
      );
      expect(sheet.scrollWidth).toBeLessThanOrEqual(sheet.clientWidth);
      await page.locator('.sheet [aria-label="Close the quick log"]').first().click();
    }
  });

  /**
   * The other half of the same fix, read from the platform.
   *
   * Chromium only: `Accessibility.getFullAXTree` is the tree Chrome hands an
   * assistive technology, and there is no equivalent protocol on WebKit. What
   * is asked here is not "does this element have a class" but "does the
   * platform's tree hold a table whose name is this chart's caption".
   */
  test('every chart table is still in the platform accessibility tree', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the accessibility tree is read over the DevTools protocol');
    await signIn(page);

    const seen: string[] = [];
    for (const path of ['/', '/health']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      // What the page says it draws: one hidden table per chart, by caption.
      const captions = await page
        .locator('[data-chart-table] caption')
        .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? ''));
      expect(captions.length).toBeGreaterThan(0);

      const client = await page.context().newCDPSession(page);
      await client.send('Accessibility.enable');
      const tree = (await client.send('Accessibility.getFullAXTree')) as {
        nodes: Array<{
          role?: { value?: string };
          name?: { value?: string };
          ignored?: boolean;
        }>;
      };
      await client.detach();

      const live = tree.nodes.filter((node) => !node.ignored);
      const tables = live
        .filter((node) => node.role?.value === 'table')
        .map((node) => node.name?.value ?? '');
      const rows = live.filter((node) => node.role?.value === 'row').length;
      const cells = live.filter((node) => node.role?.value === 'cell').length;
      const headers = live.filter((node) => node.role?.value === 'rowheader').length;
      const absent = live.filter((node) => node.name?.value === 'No reading').length;

      console.log(
        `TREE  ${path}: ${tables.length} table(s) in the platform tree, ${rows} rows, ${headers} row headers, ${cells} cells`,
      );
      for (const caption of captions) {
        console.log(`TREE      expects a table named: ${caption}`);
        expect(tables, `the platform tree has no table named "${caption}"`).toContain(caption);
        seen.push(`${path} ${caption}`);
      }
      expect(rows).toBeGreaterThan(20);
      expect(headers).toBeGreaterThan(20);
      expect(cells).toBeGreaterThan(20);
      // A day with no reading is a row that says so, and it is a row the tree
      // holds rather than a row the markup claims.
      console.log(`TREE  ${path}: cells reading "No reading": ${absent}`);
      expect(absent).toBeGreaterThan(0);
    }
    console.log(`TREE  tables read out of the platform tree: ${seen.length}`);
    expect(seen.length).toBeGreaterThanOrEqual(5);
  });
});

/**
 * C5. NOTHING SCOPED TO A SCREEN REACHES INSIDE THE QUICK-LOG SHEET.
 *
 * THE DEFECT THIS EXISTS FOR. `QuickLog` is mounted inside `section.card.day`,
 * because the day card's own rows are its children and a write replaces them.
 * The sheet was rendered in place, so its ancestry read `div.sheet <
 * section.card.day < div.today`, and three Today rules crossed into screen 03
 * through it. Measured identically in Chrome and WebKit at all three viewports:
 *
 *   .card.day .actions      the error card's action row 8 px under its sub,
 *                           where `00-patterns.html` line 159 draws 12
 *   .card.day .actions .btn Try again back at 44 px, losing the 52 px
 *                           escalation `.sheet .btn` gives every button here
 *   .card.day .btn.primary  Save 27 px below the foot divider, where
 *                           `03-quick-log.html` line 64 draws 12 and no margin
 *
 * That is defect 52's mechanism un-fixed, at three new properties. The fix is
 * the ancestry: the sheet is portalled to `document.body`, so a rule that means
 * to reach it has to name it.
 *
 * WHY THE GUARD IS HERE. This file exists because one CSS rule already slipped
 * past a green suite twice, and it is the one place in the suite that walks the
 * shipped origin in both engines at all three viewports. Slices 5 to 9 are
 * adding to Today right now; every rule they add to `.card.day` is a rule that
 * used to reach in here.
 *
 * GOES RED IF: the portal is removed, the sheet is mounted inside any card
 * again, or any of the three properties above moves off the number screen 03
 * and screen 00 fix for it. It is read only: it raises the sheet, measures, and
 * never presses Save.
 */
test.describe('no screen rule reaches inside the quick-log sheet', () => {
  /** `03-quick-log.html` line 64, `00-patterns.html` lines 32 and 159. */
  const FOOT_PADDING_TOP = '12px';
  const SAVE_BELOW_THE_DIVIDER = 12;
  const ACTIONS_MARGIN_TOP = '12px';
  const SHEET_BUTTON_MIN_HEIGHT = '52px';

  /** The sheet's ancestry and the three properties, in one read. */
  async function readTheSheet(page: Page) {
    return page.evaluate(() => {
      const round = (value: number) => Math.round(value * 10) / 10;
      const sheet = document.querySelector<HTMLElement>('.sheet')!;
      const foot = sheet.querySelector<HTMLElement>('.sheetfoot')!;
      const footStyle = getComputedStyle(foot);
      const save = foot.querySelector<HTMLElement>('.btn.primary')!;
      const ancestry: string[] = [];
      for (let hop = sheet.parentElement; hop; hop = hop.parentElement) {
        ancestry.push(
          `${hop.tagName.toLowerCase()}${hop.className ? `.${String(hop.className).trim().split(/\s+/).join('.')}` : ''}`,
        );
      }
      return {
        ancestry: ancestry.join(' < '),
        insideAScreenCard: Boolean(sheet.closest('.card')),
        width: round(sheet.getBoundingClientRect().width),
        x: round(sheet.getBoundingClientRect().x),
        saveMarginTop: getComputedStyle(save).marginTop,
        saveMinHeight: getComputedStyle(save).minHeight,
        footPaddingTop: footStyle.paddingTop,
        saveBelowTheDivider: round(
          save.getBoundingClientRect().top -
            (foot.getBoundingClientRect().top + parseFloat(footStyle.borderTopWidth)),
        ),
        actions: [...sheet.querySelectorAll<HTMLElement>('.actions')].map((node) => {
          const previous = node.previousElementSibling;
          return {
            marginTop: getComputedStyle(node).marginTop,
            gapAboveIt: previous
              ? round(node.getBoundingClientRect().top - previous.getBoundingClientRect().bottom)
              : null,
            buttons: [...node.querySelectorAll<HTMLElement>('.btn')].map((button) => ({
              label: (button.getAttribute('aria-label') ?? button.textContent ?? '').trim(),
              height: round(button.getBoundingClientRect().height),
              minHeight: getComputedStyle(button).minHeight,
            })),
          };
        }),
      };
    });
  }

  test('the sheet hangs off the document and keeps screen 03 geometry', async ({ page }) => {
    await signIn(page);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Loaded, which is the state the foot is graded in.
      await page.getByRole('button', { name: 'Quick log', exact: true }).click();
      await page.locator('.sheet').first().waitFor();
      const loaded = await readTheSheet(page);
      console.log(
        `SHEET ${viewport.name} loaded  ancestry ${loaded.ancestry}, ${loaded.width}/${loaded.x}, ` +
          `foot padding-top ${loaded.footPaddingTop}, Save margin-top ${loaded.saveMarginTop} at ` +
          `${loaded.saveBelowTheDivider} px below the divider`,
      );
      expect(
        loaded.insideAScreenCard,
        `the sheet is inside a card at ${viewport.name} (${loaded.ancestry}), so that card's rules reach into screen 03`,
      ).toBe(false);
      expect(loaded.ancestry).toBe('body < html');
      expect(loaded.footPaddingTop).toBe(FOOT_PADDING_TOP);
      expect(loaded.saveMarginTop, 'the sheet foot never writes a margin on Save').toBe('0px');
      expect(loaded.saveBelowTheDivider).toBe(SAVE_BELOW_THE_DIVIDER);
      expect(loaded.saveMinHeight).toBe(SHEET_BUTTON_MIN_HEIGHT);
      await page.locator('.sheet [aria-label="Close the quick log"]').first().click();

      // The error state, which is the only one that draws an action row, and
      // the state neither C5 check had ever measured. The snapshot request is
      // taken away and nothing else is: the screen behind it still loads, and
      // nothing here writes.
      await page.route('**/api/log', (route) => route.abort('connectionfailed'));
      await page.getByRole('button', { name: 'Quick log', exact: true }).click();
      await page.locator('.sheet [data-state="error"]').first().waitFor({ timeout: 20_000 });
      const failed = await readTheSheet(page);
      console.log(
        `SHEET ${viewport.name} error   ancestry ${failed.ancestry}, ${failed.width}/${failed.x}, ` +
          `actions ${failed.actions
            .map(
              (row) =>
                `margin-top ${row.marginTop} drawn at ${row.gapAboveIt} px, ` +
                row.buttons.map((button) => `${button.label} ${button.height} px min ${button.minHeight}`).join(' '),
            )
            .join(' | ')}`,
      );
      expect(failed.insideAScreenCard).toBe(false);
      // A state change never reflows the sheet: screen 00's own rule.
      expect(failed.width).toBe(loaded.width);
      expect(failed.x).toBe(loaded.x);
      expect(failed.actions, 'the error state drew no action row, so nothing below was measured').toHaveLength(1);
      for (const row of failed.actions) {
        expect(row.marginTop, 'the error card action row lost its 12 px').toBe(ACTIONS_MARGIN_TOP);
        expect(row.gapAboveIt).toBe(Number(ACTIONS_MARGIN_TOP.replace('px', '')));
        for (const button of row.buttons) {
          expect(
            button.minHeight,
            `${button.label} lost the sheet's 52 px escalation to a rule that outranks .sheet .btn`,
          ).toBe(SHEET_BUTTON_MIN_HEIGHT);
          expect(button.height).toBeGreaterThanOrEqual(52);
        }
      }
      await page.unroute('**/api/log');
      await page.locator('.sheet [aria-label="Close the quick log"]').first().click();
    }

    await page.setViewportSize({ width: 393, height: 852 });
  });
});
