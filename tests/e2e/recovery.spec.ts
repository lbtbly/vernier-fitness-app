import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { projectRoot, query, recovery } from './host';

/**
 * F18. The documented local recovery procedure restores access on a machine
 * holding no passkey, using only host shell access, and it asks no secret
 * question and sends no password by email.
 *
 * Note what this costs, because it is deliberate and it is not free: running
 * this test sets a new backup password. It has to, because a procedure that
 * sets a password cannot be proven without setting one. The owner sets his own
 * afterwards with the same command, which takes one line and is written down in
 * docs/security.md.
 */

test.describe('local recovery', () => {
  test.describe.configure({ mode: 'serial' });

  test('reads the state of the account from the host shell', () => {
    test.skip(Number(query('select count(*) from owner')) === 0, 'no owner account on this installation yet');
    const status = recovery('status');
    console.log(status);
    expect(status).toContain('owner rows: 1');
    expect(status).toContain('argon2id m=19456 t=2 p=1 tag=32');
    expect(status).toContain('of 5 allowed');
  });

  test('sets a new backup password, and it signs in on a browser holding no passkey', async ({ browser }) => {
    test.skip(Number(query('select count(*) from owner')) === 0, 'no owner account on this installation yet');

    const password = `Vernier-${randomBytes(12).toString('base64url')}-Q9!`;
    const output = execFileSync('bash', ['scripts/recovery.sh', 'password'], {
      cwd: projectRoot,
      encoding: 'utf8',
      input: password,
    }).trim();
    console.log(output);
    expect(output).toContain('Argon2id m=19456 t=2 p=1, 16-byte nonce, stored on the owner row');

    // No question was asked and nothing was sent anywhere: the whole procedure
    // is one command on the machine, and the only thing it needed was a shell.
    expect(output).not.toMatch(/question|email|e-mail|sent to/i);

    const row = query(
      `select password_algorithm || ' m=' || password_memory || ' t=' || password_passes ||
              ' p=' || password_parallelism || ' tag=' || password_tag_length ||
              ' nonce_bytes=' || octet_length(decode(password_nonce, 'base64'))
       from owner`,
    );
    console.log(`the owner row after the reset: ${row}`);
    expect(row).toBe('argon2id m=19456 t=2 p=1 tag=32 nonce_bytes=16');

    // A browser that has never seen this installation: no cookie, no passkey.
    const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
    const page = await context.newPage();
    try {
      await page.goto('/sign-in');
      await page.getByRole('button', { name: 'Use the backup password' }).click();
      await page.locator('input[type=password]').fill(password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

      const audit = query(
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
      recovery('unlock');
    }
  });
});
