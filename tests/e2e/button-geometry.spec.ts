import { expect, test, type Page } from '@playwright/test';
import { mintSignInLink, query } from './host';

/**
 * Button geometry, measured on the live origin rather than read off a
 * stylesheet.
 *
 * C16 was filed against the shipped `.btn` base: 44 px and 15 px, transcribed
 * from 00-patterns.html, which .forge/DESIGN.md section 2b now rules is the
 * outlier on that rule. The base is 48 and 16. 44 px is the floor a control may
 * not go under, which is the right size for a close cross and never the size of
 * a primary action.
 *
 * The escalations are deliberate and this test is what keeps them from drifting
 * back: the gate at 52, the quick-log sheet at 52, an icon button 44 square.
 */

async function measure(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = getComputedStyle(node);
      return {
        label: node.getAttribute('aria-label') ?? node.textContent?.trim().slice(0, 30) ?? '',
        classes: node.className,
        minHeight: style.minHeight,
        height: `${Math.round(node.getBoundingClientRect().height)}px`,
        fontSize: style.fontSize,
      };
    }),
  );
}

test('the gate keeps its 52 px escalation', async ({ page }) => {
  await page.goto('/sign-in');
  const buttons = await measure(page, '.gate .btn');
  for (const button of buttons) {
    console.log(`gate  ${button.minHeight}  ${button.fontSize}  ${button.label}`);
    expect(button.minHeight).toBe('52px');
    expect(button.fontSize).toBe('16px');
  }
  expect(buttons.length).toBeGreaterThan(0);
});

test('every shell button sits on the 48 px, 16 px base', async ({ page }) => {
  test.skip(Number(query('select count(*) from owner')) === 0, 'no owner account on this installation yet');
  await page.goto(mintSignInLink());

  for (const path of ['/', '/settings', '/health', '/train', '/eat']) {
    await page.goto(path);
    const buttons = await measure(page, '.btn:not(.icon)');
    for (const button of buttons) {
      console.log(`${path}  ${button.minHeight}  ${button.fontSize}  ${button.label}`);
      // The sheet escalates to 52. Everything else is the base.
      expect(['48px', '52px']).toContain(button.minHeight);
      expect(button.fontSize).toBe('16px');
    }
  }

  // The three quiet buttons on the operator panel are what C16 measured at
  // 44 and 15. They are the base now.
  await page.goto('/settings');
  const quiet = await measure(page, '.btn.quiet');
  console.log(`operator panel quiet buttons: ${JSON.stringify(quiet)}`);
  for (const button of quiet) {
    expect(button.minHeight).toBe('48px');
    expect(button.fontSize).toBe('16px');
  }
});

test('an icon button is 44 square, which is the floor and not the target', async ({ page }) => {
  test.skip(Number(query('select count(*) from owner')) === 0, 'no owner account on this installation yet');
  await page.goto(mintSignInLink());
  await page.goto('/');
  await page.getByRole('button', { name: 'Quick log' }).click();

  const icons = await measure(page, '.btn.icon');
  console.log(`icon buttons: ${JSON.stringify(icons)}`);
  expect(icons.length).toBeGreaterThan(0);
  for (const icon of icons) {
    expect(icon.height).toBe('44px');
  }
});
