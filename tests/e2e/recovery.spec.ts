import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { ensureScratchOwner, scratchQuery, scratchRecovery, scratchUrl, testStack, waitForScratch } from './host';

/**
 * F18. The documented local recovery procedure restores access on a machine
 * holding no passkey, using only host shell access, and it asks no secret
 * question and sends no password by email.
 *
 * IT RUNS AGAINST THE SCRATCH INSTANCE, and that is the fix for something this
 * spec used to cost. Proving a procedure that sets a password means setting
 * one, and it was setting the owner's: every run of the suite overwrote his
 * backup password with twelve random bytes that nobody held and nothing wrote
 * down. Not reversible, and the run's own census never noticed because it counts
 * measurements. So the whole procedure now runs on the scratch container, which
 * has its own database, its own owner and its own password, and the owner's row
 * is not touched at all. `scripts/recovery.sh` is the same script, the same
 * commands and the same Argon2 parameters; RECOVERY_CONTAINER is the only
 * difference, and it is the one the script already documents.
 *
 * Chrome rather than WebKit, for the reason playwright.config.ts gives about
 * this project: the scratch instance answers on plain loopback HTTP and WebKit
 * refuses a Secure cookie from an http origin.
 */

test.describe('local recovery', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    // Whatever ran before this file may have left the instance stopped, and
    // this one does not care what is in its database, only that it answers.
    const answering = await fetch(`${scratchUrl}/healthz`)
      .then((response) => response.ok)
      .catch(() => false);
    if (!answering) testStack('up');
    await waitForScratch();
    await ensureScratchOwner();
  });

  test('reads the state of the account from the host shell', () => {
    const status = scratchRecovery(['status']);
    console.log(status);
    expect(status).toContain('owner rows: 1');
    expect(status).toContain('argon2id m=19456 t=2 p=1 tag=32');
    expect(status).toContain('of 5 allowed');
  });

  test('sets a new backup password, and it signs in on a browser holding no passkey', async ({ browser }) => {
    const password = `Vernier-${randomBytes(12).toString('base64url')}-Q9!`;
    const output = scratchRecovery(['password'], password);
    console.log(output);
    expect(output).toContain('Argon2id m=19456 t=2 p=1, 16-byte nonce, stored on the owner row');

    // No question was asked and nothing was sent anywhere: the whole procedure
    // is one command on the machine, and the only thing it needed was a shell.
    expect(output).not.toMatch(/question|email|e-mail|sent to/i);

    const row = scratchQuery(
      `select password_algorithm || ' m=' || password_memory || ' t=' || password_passes ||
              ' p=' || password_parallelism || ' tag=' || password_tag_length ||
              ' nonce_bytes=' || octet_length(decode(password_nonce, 'base64'))
       from owner`,
    );
    console.log(`the owner row after the reset: ${row}`);
    expect(row).toBe('argon2id m=19456 t=2 p=1 tag=32 nonce_bytes=16');

    // A browser that has never seen this installation: no cookie, no passkey.
    const context = await browser.newContext({ baseURL: scratchUrl, viewport: { width: 393, height: 852 } });
    const page = await context.newPage();
    try {
      await page.goto('/sign-in');
      await page.getByRole('button', { name: 'Use the backup password' }).click();
      await page.locator('input[type=password]').fill(password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

      const audit = scratchQuery(
        "select method || ' | ' || outcome || ' | ' || reason from auth_attempt order by at desc limit 2",
      );
      console.log(audit);
      expect(audit).toContain('password | success | signed in with the backup password');

      // And the wrong password is still refused, on the same row.
      await context.clearCookies();
      await page.goto('/sign-in');
      await page.getByRole('button', { name: 'Use the backup password' }).click();
      await page.locator('input[type=password]').fill(`${password}-not`);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page.getByText('That password does not match.')).toBeVisible();
      await expect(page.getByText(/attempts left, then a 60 second pause/)).toBeVisible();
    } finally {
      await context.close();
      console.log(scratchRecovery(['unlock']));
    }
  });
});
