import { expect, newGuardedContext, test } from './fixtures';
import { forgetSuitePasskey, mintSignInLink, query } from './host';
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
 *
 * AND IT HOLDS WHETHER THE OWNER HAS REGISTERED ONE OR NOT. This spec used to
 * assert that the settings screen reads "No passkey is registered yet", which
 * renders only while the list is empty. The whole run has been parked on the
 * owner registering a passkey from his iPhone, so the spec was set to fail at
 * the exact moment the thing it is about finally happened, and R7 with it. What
 * it asserts now is the truth for either state: the empty note when the owner
 * has none, a row per credential when he has, and its own credential added to
 * whatever was already there.
 *
 * It cleans up through `suite_forget_passkey`, which removes a credential whose
 * identifier carries the suite's marker and refuses every other identifier. The
 * suite has no DELETE on that table, so the owner's own passkey is out of reach
 * of this file however it is edited later.
 */

const CAPTURES = new URL('../../.forge/evidence/slice-2/captures/', import.meta.url).pathname;

test.describe('the passkey round trip', () => {
  test('registers, then authenticates twice on a counter that never moves', async ({ browser }) => {
    test.skip(Number(query('select count(*) from owner')) === 0, 'no owner account on this installation yet');

    // What the diagnostics signal said before this test touched anything. The
    // signal is sticky true by design and this test is not the owner's iPhone,
    // so it is read here and read again after the credential is forgotten:
    // scripts/recovery.sh clears the signal when it removes the last passkey,
    // which is where that belongs. Nothing in this file writes the database.
    const signalBefore = query(
      "select coalesce((select observed::text from device_observation where signal = 'passkey_registered'), 'absent')",
    );
    // What the owner already has. Zero on this machine today; one the moment he
    // registers from the iPhone, which is what C2 and F4 are waiting for.
    const alreadyRegistered = Number(query('select count(*) from webauthn_credential'));

    const seed = await makeAuthenticatorSeed();
    const context = await newGuardedContext(browser, { viewport: { width: 393, height: 852 } });
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
      const empty = page.getByText('No passkey is registered yet.');
      if (alreadyRegistered === 0) {
        await expect(empty).toBeVisible();
      } else {
        // The owner has one. The empty note is gone and a row stands in its
        // place for each credential, which is the same screen asserted from the
        // other side rather than a skipped assertion.
        await expect(empty).toHaveCount(0);
        await expect(page.locator('.card').filter({ hasText: 'Passkeys' }).locator('.row')).toHaveCount(
          alreadyRegistered,
        );
      }
      console.log(`the settings screen was read with ${alreadyRegistered} passkey(s) already registered`);
      await page.getByRole('button', { name: 'Add a passkey on this device' }).click();

      // The screen says what the authenticator reported, in words. The token
      // itself is asserted against the stored row below, which is where a
      // token belongs.
      await expect(page.getByText('Device type: Usable across your devices')).toBeVisible();
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
        console.log(forgetSuitePasskey(seed.credentialId));
      } catch (error) {
        console.log(`could not remove ${seed.credentialId}: ${(error as Error).message}`);
      }
      expect(
        Number(query('select count(*) from webauthn_credential')),
        'the run leaves the owner with exactly the passkeys it found',
      ).toBe(alreadyRegistered);
      const signalAfter = query(
        "select coalesce((select observed::text from device_observation where signal = 'passkey_registered'), 'absent')",
      );
      console.log(
        `device_observation: passkey_registered was ${signalBefore} before this test and is ${signalAfter} after it`,
      );
      if (signalBefore === 'absent' && alreadyRegistered === 0) {
        expect(signalAfter, 'forgetting the last passkey clears the signal that said one was registered').toBe(
          'absent',
        );
      }
      await context.close();
    }
  });
});
