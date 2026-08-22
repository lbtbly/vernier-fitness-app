import { expect, test } from './fixtures';
import { apiClient } from './api-client';
import { scratchQuery, scratchUrl, testStack, waitForScratch } from './host';

/**
 * F17, on the scratch instance, because both halves of it require breaking the
 * app on purpose and the owner's installation is not the place to do that.
 *
 * A missing master key must stop the boot. A wrong one must fail loudly on the
 * read rather than hand back an empty value, because an empty value reads
 * downstream as "not connected yet" and that is the moment a credential store
 * starts lying.
 */

const SCRATCH = scratchUrl;

test.describe('the master key', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test('encrypts a credential, then refuses to open it under a different key', async () => {
    testStack('reset');
    await waitForScratch();
    const client = apiClient(SCRATCH);

    await client.get('/sign-in');
    const password = `Scratch-${Math.random().toString(36).slice(2)}-Q9!`;
    const created = await client.post('/api/auth/bootstrap', { password, repeat: password });
    expect(created.status).toBe(201);

    const secret = `withings-refresh-${Math.random().toString(36).slice(2)}`;
    const saved = await client.post('/api/settings/integrations', {
      provider: 'withings',
      secret,
      action: 'save',
    });
    expect(saved.status).toBe(201);

    const row = scratchQuery(
      "select secret_ciphertext || ' | ' || key_fingerprint from integration_credential where provider = 'withings'",
    );
    console.log(`stored row under the right key: ${row}`);
    expect(row).not.toContain(secret);

    const readable = await client.post('/api/settings/integrations', { provider: 'withings', action: 'check' });
    expect(readable.status).toBe(200);
    expect(readable.body.readable).toBe(true);
    expect(readable.text).not.toContain(secret);

    /* ------------------------------------------- the same rows, another key */
    console.log(testStack('rekey'));
    await waitForScratch();

    const rekeyed = apiClient(SCRATCH);
    await rekeyed.get('/sign-in');
    const signedIn = await rekeyed.post('/api/auth/password', { password });
    expect(signedIn.status).toBe(200);

    const refused = await rekeyed.post('/api/settings/integrations', { provider: 'withings', action: 'check' });
    console.log(`check under the wrong key: ${refused.status} ${JSON.stringify(refused.body)}`);
    expect(refused.status).toBe(500);
    expect(String(refused.body.detail)).toContain('does not decrypt the stored withings credential');
    expect(String(refused.body.detail)).toContain('the row was written under key');
    // Not empty, not false, not a shrug.
    expect(refused.body.readable).toBeUndefined();

    // And the row is exactly as it was. A failed read never overwrites.
    expect(
      scratchQuery(
        "select secret_ciphertext || ' | ' || key_fingerprint from integration_credential where provider = 'withings'",
      ),
    ).toBe(row);

    // The screen says the same thing the API does, and still never the value.
    const settings = await rekeyed.get('/settings');
    expect(settings.status).toBe(200);
    expect(settings.text).not.toContain(secret);
  });

  test('refuses to start at all when the key is absent, and creates no owner', async () => {
    const ownersBefore = scratchQuery('select count(*) from owner');
    const log = testStack('no-key');
    console.log(log);

    expect(log).toContain('[vernier] refusing to start: MASTER_KEY is not set');
    expect(log).toContain('Vernier will not start without it');
    // Next prints its own readiness banner before the instrumentation hook
    // runs, so the line that matters is the exit code: the process is gone
    // before it handled a single request.
    expect(log).toContain('the container exited with code 1');
    expect(scratchQuery('select count(*) from owner')).toBe(ownersBefore);

    // And nothing is listening where it published, because nothing survived.
    await expect(fetch('http://127.0.0.1:3102/healthz')).rejects.toThrow();

    // Put the scratch instance back under its own key, so the next run starts
    // from a working one.
    console.log(testStack('up'));
  });
});
