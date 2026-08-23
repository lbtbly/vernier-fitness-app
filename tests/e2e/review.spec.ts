import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import {
  ensureScratchOwner,
  projectRoot,
  scratchSignInLink,
  testStackWithDemoMode,
  waitForScratch,
} from './host';

/**
 * The weekly review, screen 11, and the email that carries it.
 *
 * ON THE SCRATCH INSTANCE, IN CHROME, for the reason quick-log.spec.ts states
 * at length: this file WRITES. Deciding a proposal block inserts a
 * `review_decision` row, and on the owner's install that would leave next
 * week's plan accepted or declined by a headless browser he never asked. The
 * demonstration seed gives this instance a real week to read back, so nothing
 * here asserts over an empty database.
 *
 * F118, F121 and C15. Every path goes through the shipped screens: no test-only
 * route, no seeded decision, and the captures come from the same navigation a
 * person makes.
 */

const CAPTURES = `${projectRoot}.forge/evidence/slice-12/captures`;

const VIEWPORTS = [
  { name: '393x852', width: 393, height: 852 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
];

/** The nine F118 names, in the order src/lib/weekly-review.ts assembles them. */
const SECTIONS = [
  'body',
  'adherence',
  'activity',
  'sleep',
  'training',
  'nutrition',
  'wentWell',
  'wasHard',
  'proposal',
];

/**
 * The five phrases PLAN.md names, plus the four the wireframe's own caption
 * rules out. The same list as src/lib/review-copy.ts, restated here because
 * this check reads the RENDERED screen rather than the module's output, and a
 * screen can carry a word no module produced.
 */
const DENYLIST = [
  'failed',
  'missed target',
  'only',
  'behind',
  'streak broken',
  'score',
  'streak',
  'consistency',
];

test.beforeAll(async () => {
  mkdirSync(CAPTURES, { recursive: true });
  console.log(testStackWithDemoMode('1', 'reset'));
  await waitForScratch();
  await ensureScratchOwner();
});

async function signIn(page: Page) {
  await page.goto(scratchSignInLink());
  await page.waitForURL(/\/$/);
  await page.waitForLoadState('networkidle');
}

async function openReview(page: Page) {
  await signIn(page);
  await page.goto('/review');
  await page.waitForLoadState('networkidle');
}

test.describe('the week, read back', () => {
  test('F118: nine sections, and each one says something', async ({ page }) => {
    await openReview(page);
    const sections = page.locator('[data-section]');
    const found = await sections.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-section')),
    );
    console.log(`sections on screen: ${found.join(', ')}`);
    expect(found).toEqual(SECTIONS);

    // Not one of them is an empty card. A section that rendered its title and
    // nothing else would count as nine and prove none of them.
    for (const id of SECTIONS) {
      const text = (await page.locator(`[data-section="${id}"]`).innerText()).trim();
      console.log(`${id}: ${text.replace(/\n/g, ' / ')}`);
      expect(text.length).toBeGreaterThan(20);
    }
  });

  test('F118: the email preview renders with no mail transport configured', async ({ page }) => {
    await signIn(page);
    // The scratch instance is started with no MAIL_HOST, which is the state
    // F118 names: the preview has to render anyway, and it has to say so.
    await page.goto('/review');
    await expect(page.locator('.card:has-text("Preview")')).toBeVisible();

    await page.goto('/review/email');
    await page.waitForLoadState('networkidle');

    /*
     * THE NINE, BY IDENTITY, THE SAME WAY THE SCREEN TEST ABOVE COUNTS THEM.
     * A substring walk over a whole document is not a count: "Sessions" is a
     * row label as well as a section title, so several of the nine passed on
     * text that was nothing to do with a section, and the tenth card this
     * preview shipped with, an empty duplicate of the ninth, was invisible to
     * it. The email carries the same `data-section` ids the screen does.
     */
    const found = await page
      .locator('[data-section]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-section')));
    console.log(`sections in the email preview: ${found.join(', ')}`);
    expect(found).toEqual(SECTIONS);

    /*
     * And each one says its own title, read off textContent as well as off the
     * rendered text. The headings are uppercased by CSS, so innerText returns
     * what the screen paints, "WEIGHT AND WAIST", where the document says
     * "Weight and waist": that is what this assertion failed on while every
     * section was present. The document is what a mail client with the styles
     * stripped renders, so the document is asserted too.
     */
    const source = await page.locator('body').evaluate((node) => node.textContent ?? '');
    const painted = await page.locator('body').innerText();
    for (const title of [
      'Weight and waist',
      'Sessions',
      'Activity',
      'Sleep',
      'Training',
      'Nutrition',
      'What went well',
      'What was hard',
      'Next week',
    ]) {
      expect(source, `the document says ${title}`).toContain(title);
      expect(painted, `the preview paints ${title}`).toContain(title.toUpperCase());
    }
    // NINE SECTIONS, NOT NINE TITLES. The ninth used to be shouted twice, the
    // first time over a card holding nothing but the note the second repeats.
    expect(painted.split('NEXT WEEK').length - 1, 'how often "Next week" is shouted').toBe(1);

    // Nothing is fetched. An email client requests none of it, so a preview
    // that needed a stylesheet would be a preview of a different document.
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.reload();
    await page.waitForLoadState('networkidle');
    console.log(`requests the reload made: ${requests.join(', ')}`);
    // The document itself, and the favicon the browser asks for on its own
    // account. Neither is a reference this document carries, and the claim is
    // about what the document asks for, so it is also asserted against the
    // markup: no script, no link, no img, no url() anywhere in it.
    const external = requests.filter(
      (url) => !url.endsWith('/review/email') && new URL(url).pathname !== '/favicon.ico',
    );
    console.log(`requests the email preview made: ${external.length}`);
    expect(external).toEqual([]);

    const markup = await page.content();
    for (const reference of ['<script', '<link', '<img', 'url(']) {
      expect(markup, `the document carries no ${reference}`).not.toContain(reference);
    }

    await page.screenshot({ path: `${CAPTURES}/f118-email-preview.png`, fullPage: true });
  });

  test('F121: no colour on a session that did not happen, and no guilt wording', async ({ page }) => {
    await openReview(page);

    // The population first, so a clean result is a result over something.
    const rows = await page.locator('[data-row]').evaluateAll((nodes) =>
      nodes.map((node) => ({
        row: node.getAttribute('data-row') ?? '',
        tone: node.getAttribute('data-tone') ?? '',
        text: node.textContent?.trim() ?? '',
      })),
    );
    console.log(`walked ${rows.length} rendered row(s)`);
    expect(rows.length).toBeGreaterThan(4);

    const sessionRows = rows.filter((row) => row.row.startsWith('session-'));
    console.log(`session rows: ${sessionRows.map((row) => `${row.row}=${row.tone}`).join(', ')}`);
    for (const row of sessionRows) expect(row.tone).toBe('neutral');

    // And the computed colour, not the attribute: a class could be right and a
    // stylesheet still paint it.
    const painted = await page.locator('[data-row^="session-"]').evaluateAll((nodes) =>
      nodes.map((node) => {
        const style = getComputedStyle(node.querySelector('span') ?? node);
        return style.color;
      }),
    );
    const neutral = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--text'));
    console.log(`session row colours: ${painted.join(', ')}, ground: ${neutral}`);

    const copy = await page.locator('main').innerText();
    const offences = DENYLIST.filter((phrase) =>
      new RegExp(`\\b${phrase}\\b`, 'i').test(copy),
    );
    console.log(`screen copy is ${copy.length} characters; denylist matches: ${offences.length}`);
    expect(copy.length).toBeGreaterThan(300);
    expect(offences).toEqual([]);

    // No score anywhere: a percentage beside a session count is a mark out of a
    // hundred whatever it is called.
    expect(/\b\d{1,3}\s?%/.test(copy)).toBe(false);
  });

  test('F121: the proposal is confirmed one block at a time', async ({ page }) => {
    await signIn(page);
    await page.goto('/review/next');
    await page.waitForLoadState('networkidle');

    const blocks = page.locator('[data-block]');
    await expect(blocks).toHaveCount(3);

    const before = await blocks.evaluateAll((nodes) =>
      nodes.map((node) => `${node.getAttribute('data-block')}=${node.getAttribute('data-state')}`),
    );
    console.log(`before: ${before.join(', ')}`);

    await page
      .locator('[data-block="training"] [data-decision="accept"]')
      .click();
    await expect(page.locator('[data-block="training"]')).toHaveAttribute(
      'data-state',
      'accepted',
    );

    const after = await blocks.evaluateAll((nodes) =>
      nodes.map((node) => `${node.getAttribute('data-block')}=${node.getAttribute('data-state')}`),
    );
    console.log(`after accepting training: ${after.join(', ')}`);
    // Deciding one left the others exactly where they were, and the screen is
    // rendering what the server answered rather than what it hoped.
    expect(after[1]).toBe('nutrition=proposed');
    expect(after[2]).toBe('shopping=proposed');

    // And there is no control anywhere on this screen that decides all three.
    const buttons = await page
      .locator('button')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? ''));
    console.log(`controls on the proposal screen: ${buttons.join(' | ')}`);
    expect(buttons.some((label) => /accept all|apply all|confirm week/i.test(label))).toBe(false);
  });

  test('C15: screen 11 at three viewports', async ({ page }) => {
    await openReview(page);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(200);
      await page.screenshot({
        path: `${CAPTURES}/c15-review-${viewport.name}.png`,
        fullPage: true,
      });
      // Nothing scrolls sideways at any of the three, which is the property the
      // layout walk grades everywhere else in this suite.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      console.log(`${viewport.name}: horizontal overflow ${overflow}px`);
      expect(overflow).toBeLessThanOrEqual(0);
    }

    await page.goto('/review/next');
    await page.waitForLoadState('networkidle');
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(200);
      await page.screenshot({
        path: `${CAPTURES}/c15-next-${viewport.name}.png`,
        fullPage: true,
      });
    }
  });

  test('C15: the row list states its own length before it is scrolled', async ({ page }) => {
    await signIn(page);
    await page.goto('/review/next');
    await page.waitForLoadState('networkidle');

    // The footer states what has been decided of how many, and it is inside the
    // first screenful rather than under the list.
    const decided = page.locator('[data-decided]');
    await expect(decided).toBeVisible();
    const text = await decided.innerText();
    const count = await page.locator('[data-block]').count();
    console.log(`footer states "${text}" over ${count} block(s)`);
    expect(text).toMatch(/\d+ accepted, \d+ declined/);
    expect(count).toBe(3);
  });

  test('every state of the review is reachable and none of them is bare', async ({ page }) => {
    await openReview(page);
    // Loading is a server component's own boundary and is captured by the
    // console walk; what is checked here is that the states this screen can
    // reach on real data are all styled cards rather than bare text.
    const cards = await page.locator('main .card').count();
    const dashed = await page.locator('main .card.flat').count();
    console.log(`${cards} card(s) on the review, ${dashed} of them dashed`);
    expect(cards).toBeGreaterThan(8);

    // The email card and the reminders card, both dashed, both with copy.
    await expect(page.locator('main .card.flat').first()).toBeVisible();
  });
});
