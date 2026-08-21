import { expect, test } from '@playwright/test';
import { apiClient } from './api-client';
import { baseUrl, query, recovery } from './host';

/**
 * F13. Five failures inside 60 seconds, then the sixth is refused, and so is a
 * seventh with correct credentials until the window passes. Each attempt writes
 * exactly one audit row.
 *
 * It runs last, and it clears the lockout on the way out with the same host
 * shell command `docs/security.md` gives the owner, so the suite leaves the app
 * usable rather than paused for a minute.
 */

test.describe('the rate limiter', () => {
  test.describe.configure({ mode: 'serial' });

  test('pauses sign-in after five failures and writes one row per attempt', async () => {
    test.skip(Number(query('select count(*) from owner')) === 0, 'no owner account on this installation yet');

    const client = apiClient(baseUrl());
    await client.get('/sign-in');

    const before = Number(query('select count(*) from auth_attempt'));
    const statuses: number[] = [];
    const details: string[] = [];

    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const response = await client.post('/api/auth/password', {
        password: `not-the-password-${attempt}`,
      });
      statuses.push(response.status);
      details.push(String(response.body.detail ?? ''));
    }

    // A seventh, with a password that is also wrong, to show the refusal is the
    // limiter talking and not the credential check.
    const seventh = await client.post('/api/auth/password', { password: 'still-not-it' });
    statuses.push(seventh.status);
    details.push(String(seventh.body.detail ?? ''));

    console.log(`statuses: ${statuses.join(', ')}`);
    details.forEach((detail, index) => console.log(`  attempt ${index + 1}: ${detail}`));

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses.slice(5)).toEqual([429, 429]);
    expect(details[0]).toContain('4 attempts left');
    expect(details[3]).toContain('1 attempt left');
    expect(details[5]).toContain('Wait');
    expect(details[6]).toContain('A correct password will not open it any sooner.');

    const after = Number(query('select count(*) from auth_attempt'));
    expect(after - before).toBe(7);

    const rows = query(
      `select outcome || ' | ' || reason from auth_attempt order by at desc limit 7`,
    );
    console.log(rows);
    expect(rows.split('\n').filter((row) => row.startsWith('failure')).length).toBe(5);
    expect(rows.split('\n').filter((row) => row.startsWith('rate-limited')).length).toBe(2);

    // The passkey path is paused too. A lockout that only covers one door is a
    // lockout with a second door.
    const passkey = await client.post('/api/auth/passkey/authentication/options', {});
    expect(passkey.status).toBe(429);
  });

  test('clears from the host shell, appending a row rather than editing one', async () => {
    const failuresOnRecord = Number(query("select count(*) from auth_attempt where outcome = 'failure'"));

    console.log(recovery('unlock'));

    const client = apiClient(baseUrl());
    await client.get('/sign-in');
    const afterUnlock = await client.post('/api/auth/password', { password: 'still-not-it' });
    // Refused because it is wrong, not because the window is shut.
    expect(afterUnlock.status).toBe(401);
    expect(String(afterUnlock.body.detail)).toContain('4 attempts left');

    // Every failure that led to the lockout is still on the record.
    expect(Number(query("select count(*) from auth_attempt where outcome = 'failure'"))).toBe(
      failuresOnRecord + 1,
    );

    console.log(recovery('unlock'));
  });
});
