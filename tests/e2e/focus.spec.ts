import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { projectRoot } from './host';

/**
 * C4's keyboard traversal. Every interactive element on the gate shows a 2 px
 * --focus outline at 2 px offset, and the way to prove it is to walk the screen
 * with the Tab key and read the computed style at every stop.
 *
 * This one runs in Chrome rather than WebKit, and the reason is worth writing
 * down: Safari on macOS only moves sequential focus to buttons and links when
 * Full Keyboard Access is on, which is a setting on the owner's machine and not
 * a property of this app. The rule under test is one CSS declaration that every
 * engine applies the same way, and the WebKit run still proves it on the fields
 * it does reach.
 */

const CAPTURES = `${projectRoot}.forge/evidence/slice-2/captures`;

test.beforeAll(() => {
  mkdirSync(CAPTURES, { recursive: true });
});

async function interactiveElements(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('a[href], button, input, select, [tabindex]')]
      .filter((element) => !element.closest('.visually-hidden'))
      .map((element) => `${element.tagName.toLowerCase()}.${(element as HTMLElement).className || 'plain'}`),
  );
}

test('every interactive element on the gate carries a 2 px focus outline at 2 px offset', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Use the backup password' }).click();

  const names = await interactiveElements(page);
  expect(names.length).toBeGreaterThan(0);

  const seen: Array<{ element: string; outline: string; offset: string }> = [];
  for (let step = 0; step < names.length + 2; step += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) return null;
      const style = getComputedStyle(element);
      return {
        element: `${element.tagName.toLowerCase()}.${element.className || 'plain'}`,
        outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
        offset: style.outlineOffset,
      };
    });
    if (focused && !seen.some((stop) => stop.element === focused.element)) seen.push(focused);
  }

  expect(seen.length).toBeGreaterThanOrEqual(names.length);
  for (const stop of seen) {
    expect(stop.outline).toBe('2px solid rgb(143, 196, 255)');
    expect(stop.offset).toBe('2px');
  }

  console.log(`focus traversal: ${seen.length} stops of ${names.length} interactive elements`);
  for (const stop of seen) console.log(`  ${stop.element}: ${stop.outline} at ${stop.offset}`);

  await page.keyboard.press('Shift+Tab');
  await page.screenshot({ path: `${CAPTURES}/c4-focus-traversal-393x852.png`, fullPage: true });
});
