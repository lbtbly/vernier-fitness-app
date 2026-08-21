import { expect, test } from '@playwright/test';
import { mintSignInLink, query, recovery } from './host';
import { authenticatorInitScript, makeAuthenticatorSeed } from './software-authenticator';

/**
 * F9. A passkey registers, then authenticates, against relying party
 * `tailda76d6.ts.net`, in WebKit, and the stored row holds its identifier,
 * public key, counter, transports, device type and backed-up flag.
 *
 * The authenticator is software, injected into the page, because WebKit exposes
 * no virtual authenticator to automation and a platform ceremony needs a
 * fingerprint. Everything else is real: the app's own client code runs the
 * ceremony, the origin in the client data is the page's real origin, the
 * relying party hash is the one the server asked for, and the server verifies
 * the attestation and the assertion with no test hooks of any kind.
 *
 * It reports itself the way an iCloud Keychain passkey does, with a signature
 * counter of 0 that never moves. So this test signs in twice, and the second
 * time is the one that matters: a naive replay check passes the first and
 * bricks the second.
 */

const CAPTURES = new URL('../../.forge/evidence/slice-2/captures/', import.meta.url).pathname;

test.describe('the passkey round trip', () => {
  test('registers, then authenticates twice on a counter that never moves', async ({ browser }) => {
    test.skip(Number(query('select count(*) from owner')) === 0, 'no owner account on this installation yet');

    // What the diagnostics signal said before this test touched anything. The
    // signal is sticky true by design, and this test is not the owner's iPhone,
    // so it puts the row back the way it found it on the way out.
    const signalBefore = query(
      "select coalesce((select observed::text from device_observation where signal = 'passkey_registered'), 'absent')",
    );

    const seed = await makeAuthenticatorSeed();
    const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
    await context.addInitScript(authenticatorInitScript(seed));
    const page = await context.newPage();

    try {
      // A session, minted on this machine's own shell, exactly as
      // docs/security.md tells the owner to do it. No back door: the link is
      // one use, it expires, and spending it writes an audit row.
      await page.goto(mintSignInLink());
      console.log(`after the recovery link, the browser is at ${page.url()}`);
      await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

      /* ---------------------------------------------------- registration */
      await page.goto('/settings');
      await expect(page.getByText('No passkey is registered yet.')).toBeVisible();
      await page.getByRole('button', { name: 'Add a passkey on this device' }).click();

      await expect(page.getByText('Device type: multiDevice')).toBeVisible();
      await page.screenshot({ path: `${CAPTURES}f9-settings-passkey-registered.png`, fullPage: true });

      const stored = query(
        `select 'id=' || id || ' public_key_bytes=' ||
                octet_length(decode(translate(public_key, '-_', '+/') || repeat('=', (4 - length(public_key) % 4) % 4), 'base64')) ||
                ' counter=' || counter || ' transports=' || array_to_string(transports, ',') ||
                ' device_type=' || device_type || ' backed_up=' || backed_up ||
                ' aaguid=' || aaguid || ' label=' || label
         from webauthn_credential where id = '${seed.credentialId}'`,
      );
      console.log(`stored credential row: ${stored}`);
      expect(stored).toContain(`id=${seed.credentialId}`);
      expect(stored).toContain('counter=0');
      expect(stored).toContain('device_type=multiDevice');
      expect(stored).toContain('backed_up=true');
      expect(stored).toContain('transports=internal,hybrid');
      expect(stored).toMatch(/public_key_bytes=[5-9][0-9]/);

      // The relying party this credential was verified against, as the app
      // itself reports it, read from WEBAUTHN_RP_ID on every request.
      const rpId = await page
        .locator('.field')
        .filter({ hasText: 'Passkey relying party' })
        .locator('dd')
        .textContent();
      expect(rpId).toBe('tailda76d6.ts.net');

      // The diagnostics signal now has a source, which it did not before.
      const diagnostics = await (await page.request.get('/api/diagnostics/device')).json();
      expect(diagnostics.passkeyRegistered).toBe(true);
      expect(diagnostics.firstObservedAt.passkeyRegistered).not.toBeNull();
      console.log(
        `diagnostics: passkeyRegistered ${diagnostics.passkeyRegistered}, first observed ${diagnostics.firstObservedAt.passkeyRegistered}`,
      );

      /* -------------------------------------------------- authentication */
      for (const attempt of [1, 2]) {
        await page.getByRole('button', { name: 'Sign out' }).click();
        await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

        await page.getByRole('button', { name: 'Sign in with passkey' }).click();
        await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

        const afterUse = query(
          `select 'counter=' || counter || ' last_used_at=' || coalesce(last_used_at::text, 'never')
           from webauthn_credential where id = '${seed.credentialId}'`,
        );
        console.log(`after sign-in ${attempt}: ${afterUse}`);
        // Verbatim. The synced passkey said zero, so zero is what is stored,
        // and the second sign-in proves the replay check does not read that as
        // a replay.
        expect(afterUse).toContain('counter=0');
        expect(afterUse).not.toContain('last_used_at=never');

        const audit = query(
          `select outcome || ' | ' || reason from auth_attempt where method = 'passkey' order by at desc limit 1`,
        );
        expect(audit).toContain('success | signed in with the passkey reporting counter 0');
        await page.goto('/settings');
      }
    } finally {
      // The credential this test made belongs to a key that lives for the
      // length of the test. Leaving it behind would leave the owner's account
      // trusting an authenticator that no longer exists.
      try {
        console.log(recovery('forget-passkey', seed.credentialId));
      } catch {
        console.log(`no credential ${seed.credentialId} to remove, the ceremony did not get that far`);
      }
      if (signalBefore === 'absent') {
        query("delete from device_observation where signal = 'passkey_registered'");
        console.log('device_observation: passkey_registered put back to absent, which is what it was');
      }
      await context.close();
    }
  });
});
