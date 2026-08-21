import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
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
    const context = await browser.newContext({ baseURL: SCRATCH, viewport: VIEWPORTS[0] });
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
