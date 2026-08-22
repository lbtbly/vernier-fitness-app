import { expect, test } from './fixtures';
import { apiClient } from './api-client';
import { scratchQuery, scratchUrl, testStack, waitForScratch } from './host';

/**
 * F8. The owner account is created exactly once. The second attempt gets 409
 * and the table still holds one row.
 *
 * On the scratch instance, because "exactly once" can only be watched happening
 * on an installation that has not had it happen yet, and the owner's has.
 */
test.describe('first run', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test('creates the owner once and refuses the second attempt with 409', async () => {
    testStack('reset');
    await waitForScratch();

    const client = apiClient(scratchUrl);
    await client.get('/sign-in');

    expect(scratchQuery('select count(*) from owner')).toBe('0');

    const password = `Scratch-${Math.random().toString(36).slice(2)}-Q9!`;
    const first = await client.post('/api/auth/bootstrap', { password, repeat: password });
    console.log(`first attempt: ${first.status} ${JSON.stringify(first.body)}`);
    expect(first.status).toBe(201);
    expect(first.body.created).toBe(true);
    const ownersAfterFirst = scratchQuery('select count(*) from owner');
    expect(ownersAfterFirst).toBe('1');

    const second = await client.post('/api/auth/bootstrap', { password, repeat: password });
    console.log(`second attempt: ${second.status} ${JSON.stringify(second.body)}`);
    expect(second.status).toBe(409);
    expect(String(second.body.error)).toContain('already exists');
    expect(scratchQuery('select count(*) from owner')).toBe('1');

    // Even from a browser that has never been here, and even with a different
    // password. One account, and the database is what enforces it.
    const stranger = apiClient(scratchUrl);
    await stranger.get('/sign-in');
    const third = await stranger.post('/api/auth/bootstrap', {
      password: `${password}-other`,
      repeat: `${password}-other`,
    });
    expect(third.status).toBe(409);
    expect(scratchQuery('select count(*) from owner')).toBe('1');

    const audit = scratchQuery("select method || ' | ' || outcome || ' | ' || reason from auth_attempt order by at");
    console.log(audit);
    expect(audit.split('\n').filter((row) => row.includes('bootstrap | refused')).length).toBe(2);

    // And the singleton is a database constraint, not a check in a handler.
    const indexes = scratchQuery(
      "select indexdef from pg_indexes where tablename = 'owner' and indexname = 'owner_singleton'",
    );
    console.log(indexes);
    expect(indexes).toContain('CREATE UNIQUE INDEX');
  });

  test('refuses a password that is too weak, and creates nothing', async () => {
    testStack('reset');
    await waitForScratch();

    const client = apiClient(scratchUrl);
    await client.get('/sign-in');

    const weak = await client.post('/api/auth/bootstrap', { password: 'short', repeat: 'short' });
    expect(weak.status).toBe(422);
    expect(String(weak.body.detail)).toContain('At least 12 characters. You typed 5.');
    expect(scratchQuery('select count(*) from owner')).toBe('0');

    const mismatched = await client.post('/api/auth/bootstrap', {
      password: 'A properly long one 42!',
      repeat: 'A properly long one 43!',
    });
    expect(mismatched.status).toBe(422);
    expect(String(mismatched.body.error)).toContain('do not match');
    expect(scratchQuery('select count(*) from owner')).toBe('0');

    const noToken = await client.post(
      '/api/auth/bootstrap',
      { password: 'A properly long one 42!', repeat: 'A properly long one 42!' },
      { csrf: false },
    );
    expect(noToken.status).toBe(403);
    expect(scratchQuery('select count(*) from owner')).toBe('0');
  });
});
