import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { expect, newGuardedContext, test, type Locator, type Page } from './fixtures';
import { projectRoot } from './host';

/**
 * Screen 01, as .forge/wireframes/01-sign-in.html draws it: passkey first,
 * password second, the one-time owner creation, and the host unreachable.
 *
 * The owner creation state only exists when no owner exists, and this
 * installation has one, so that state is photographed on the scratch instance
 * `scripts/test-stack.sh` runs: the same image, the same code, an empty
 * database. Photographing it by deleting the owner would be a worse test and a
 * worse idea.
 */

const CAPTURES = `${projectRoot}.forge/evidence/slice-2/captures`;
const SCRATCH = process.env.SCRATCH_URL ?? 'http://127.0.0.1:3101';

const VIEWPORTS = [
  { name: '393x852', width: 393, height: 852 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
];

/** Dark theme --accent and a colour that is not painted at all. */
const ACCENT = 'rgb(90, 169, 255)';
const NOTHING = 'rgba(0, 0, 0, 0)';

/** What a button actually paints, which is the only thing a screen is judged on. */
async function paint(button: Locator) {
  return button.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.color,
      background: style.backgroundColor,
      border: style.borderTopColor,
    };
  });
}

test.beforeAll(() => {
  mkdirSync(CAPTURES, { recursive: true });
});

async function capture(page: Page, name: string) {
  await page.screenshot({ path: `${CAPTURES}/${name}.png`, fullPage: true });
}

test.describe('screen 01, the gate', () => {
  test('renders passkey first and password second at three viewports', async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/sign-in');

      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
      await expect(page.getByText('Your health data, on your machine.')).toBeVisible();

      const passkey = page.getByRole('button', { name: 'Sign in with passkey' });
      const password = page.getByRole('button', { name: 'Use the backup password' });
      await expect(passkey).toBeVisible();
      await expect(password).toBeVisible();

      // Passkey is above password, and it is the only accented thing on screen.
      const passkeyBox = (await passkey.boundingBox())!;
      const passwordBox = (await password.boundingBox())!;
      expect(passkeyBox.y).toBeLessThan(passwordBox.y);
      const accented = await page.locator('.btn.primary').count();
      expect(accented).toBe(1);

      // One box, and one line of text under it. Counting .btn.primary was not
      // enough: the password action shipped as a bordered white button, the
      // same size and shape as the passkey, because .btn.quiet lost the
      // wireframe's border-color and colour. So measure what is painted.
      const primary = await paint(passkey);
      const quiet = await paint(password);
      expect(primary.background).toBe(ACCENT);
      expect(quiet.background).toBe(NOTHING);
      expect(quiet.border).toBe(NOTHING);
      expect(quiet.color).toBe(ACCENT);
      expect(quiet.color).not.toBe(primary.color);

      // 52 px of button, which is what the wireframe measures.
      expect(Math.round(passkeyBox.height)).toBeGreaterThanOrEqual(52);

      // Nothing scrolls sideways at any width.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);

      await capture(page, `c4-passkey-first-${viewport.name}`);
    }
  });

  test('shows the password field when the owner asks for it', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Use the backup password' }).click();

    const field = page.locator('input[type=password]');
    await expect(field).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try the passkey again' })).toBeVisible();
    expect(Math.round((await field.boundingBox())!.height)).toBeGreaterThanOrEqual(52);

    // The way back to the passkey is the quiet one here too.
    const retry = await paint(page.getByRole('button', { name: 'Try the passkey again' }));
    expect(retry.background).toBe(NOTHING);
    expect(retry.border).toBe(NOTHING);
    expect(retry.color).toBe(ACCENT);

    await capture(page, 'c4-password-second-393x852');
  });

  test('names the cause when the machine is not answering', async ({ page }) => {
    await page.goto('/sign-in');
    // The origin goes away underneath the screen, which is what happens when
    // the phone leaves the tailnet or the Mac mini sleeps.
    await page.route('**/api/auth/**', (route) => route.abort('connectionfailed'));
    await page.getByRole('button', { name: 'Sign in with passkey' }).click();

    await expect(page.getByText('The Mac mini is not answering.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await capture(page, 'c4-host-unreachable-393x852');

    // And it recovers when the machine does, without a reload.
    await page.unroute('**/api/auth/**');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('The Mac mini is answering again. Try signing in.')).toBeVisible();
  });
});

test.describe('screen 01, first run', () => {
  test.beforeAll(() => {
    execFileSync('bash', ['scripts/test-stack.sh', 'reset'], { cwd: projectRoot, encoding: 'utf8' });
  });

  test('renders the one-time owner creation at three viewports', async ({ browser }) => {
    const context = await newGuardedContext(browser, { baseURL: SCRATCH, viewport: VIEWPORTS[0] });
    const page = await context.newPage();

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/sign-in');

      await expect(page.getByRole('heading', { name: 'Create the owner account' })).toBeVisible();
      await expect(page.getByText('This runs once.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create account and add a passkey' })).toBeVisible();
      await expect(page.getByText('Hashed with Argon2id on this machine. It never leaves it.')).toBeVisible();
      await expect(page.getByText('If you lose both')).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);

      await capture(page, `c4-owner-creation-${viewport.name}`);
    }

    // The requirement counts what you typed, live.
    await page.setViewportSize(VIEWPORTS[0]);
    await page.locator('input[name=new-password]').fill('short');
    await expect(page.getByText('At least 12 characters. You typed 5.')).toBeVisible();
    await page.locator('input[name=new-password]').fill('A properly long one 42!');
    await expect(page.getByText('At least 12 characters. You typed 23.')).toBeVisible();
    await page.locator('input[name=repeat-password]').fill('A properly long one 42!');
    await expect(page.getByText('Both fields match.')).toBeVisible();
    await capture(page, 'c4-owner-creation-filled-393x852');

    await context.close();
  });
});
