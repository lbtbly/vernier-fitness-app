import { describe, expect, it } from 'vitest';
import { callGoogle, confirmSelected, listAppEvents } from '@/lib/google/client';
import { eventsInsertUrl } from '@/lib/google/protocol';
import { WRITE_SITES, type WriteInput } from '@/lib/google/write-sites';
import { harness } from './google-harness';

/**
 * F109. AN INVALID GRANT IS PERMANENT: the stored token is deleted, the run
 * stops, and NOTHING IS EVER RETRIED.
 *
 * The retry is the part worth grading, because retrying is the natural thing for
 * a client to do and it is wrong here in a way that hides the state the owner
 * has to act on. Google's published causes are revocation, six months of disuse,
 * a token limit and an expired time-based grant, and none of them is fixed by
 * asking again. So the request log is printed on every case below and the count
 * is the assertion.
 *
 * The three writes F109 also asks for, the disconnected state with its timestamp
 * and the raw body, and background reads stopping, are one transaction in
 * `src/db/google.ts` and are proven at the database in
 * `tests/e2e/calendar.spec.ts`, which reads the row back with psql.
 *
 * WHAT WOULD MAKE THIS GO RED. A second refresh after a dead grant. A backoff
 * loop that treats `invalid_grant` like a rate limit. A stored token left in
 * place after Google refused it.
 */

const STORED = 'vernier-training@group.calendar.google.com';

const REVOKED = {
  status: 400,
  body: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' },
};

const input: WriteInput = {
  calendarId: STORED,
  eventId: 'vrnr0000000000000000',
  sessionId: 'plan_session_1',
  summary: 'Training: Strength',
  description: 'Written by Vernier.',
  start: new Date('2026-08-24T17:00:00.000Z'),
  end: new Date('2026-08-24T17:45:00.000Z'),
  timeZone: 'Europe/Paris',
  mode: 'demonstration',
};

describe('F109, a refused grant', () => {
  it('refreshes exactly once on a 401 and never again after invalid_grant', async () => {
    const rig = harness({
      answer: (request) => {
        if (request.url.includes('oauth2.googleapis.com/token')) return REVOKED;
        return { status: 401, body: { error: { code: 401, message: 'Invalid Credentials' } } };
      },
    });

    const answer = await callGoogle(rig.ports, {
      kind: 'read',
      method: 'GET',
      url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    });

    console.log(`requests in order:\n  ${rig.sent.map((entry) => `${entry.method} ${entry.url}`).join('\n  ')}`);
    console.log(`outcome: ${answer.outcome}`);
    console.log(`permanent failures reported: ${rig.permanentFailures.length}`);
    console.log(`stored token after: ${rig.tokens() === null ? 'deleted' : 'still there'}`);

    // THE COUNT IS THE ASSERTION. One call, one refresh, and then it stops:
    // exactly two requests, never three.
    expect(rig.sent.length).toBe(2);
    expect(rig.sent[1].url).toContain('oauth2.googleapis.com/token');
    expect(answer.outcome).toBe('disconnected');
    expect(rig.permanentFailures.length).toBe(1);
    expect(rig.permanentFailures[0].kind).toBe('invalid_grant');
    // The raw body is carried through whole, because F109 stores it.
    expect(rig.permanentFailures[0].raw).toContain('Token has been expired or revoked.');
    expect(rig.tokens()).toBeNull();
  });

  it('makes no request at all once the token is gone', async () => {
    // The state after the refusal: nothing to present, so nothing is sent. This
    // is what "stops background synchronisation" looks like from the client's
    // side, and it is the opposite of a loop that keeps failing quietly.
    const rig = harness({ tokens: null, answer: () => REVOKED });
    const read = await listAppEvents(rig.ports, {
      calendarId: STORED,
      timeMin: '2026-08-24T00:00:00.000Z',
      timeMax: '2026-09-07T00:00:00.000Z',
    });
    const confirmation = confirmSelected({ id: 'plan_1', state: 'open', rowIds: ['plan_1_r0'] }, ['plan_1_r0'], new Date())[0];
    const write = await WRITE_SITES[2].run(rig.ports, confirmation, input);

    console.log(`read outcome: ${read.outcome}, write outcome: ${write.outcome}`);
    console.log(`requests sent with no stored token: ${rig.sent.length}`);
    expect(read.outcome).toBe('not_connected');
    expect(write.outcome).toBe('not_connected');
    expect(rig.sent).toEqual([]);
  });

  it('reports a proactive refresh that meets a dead grant the same way, once', async () => {
    // The token is already past its expiry, so the refresh happens before any
    // call rather than after a 401. Same answer, same single attempt.
    const now = new Date('2026-08-23T18:45:00.000Z');
    const rig = harness({
      now: () => now,
      tokens: {
        accessToken: 'stale-access-token',
        refreshToken: 'revoked-refresh-token',
        expiresAt: new Date(now.getTime() - 60_000).toISOString(),
        scope: '',
        tokenType: 'demonstration-bearer',
      },
      answer: () => REVOKED,
    });

    const answer = await callGoogle(rig.ports, {
      kind: 'read',
      method: 'GET',
      url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    });
    console.log(`requests: ${rig.sent.map((entry) => entry.url).join(', ')}`);
    console.log(`outcome: ${answer.outcome}, failures: ${rig.permanentFailures.length}`);
    expect(rig.sent.length).toBe(1);
    expect(rig.sent[0].url).toContain('oauth2.googleapis.com/token');
    expect(answer.outcome).toBe('disconnected');
    expect(rig.permanentFailures.length).toBe(1);
  });

  it('stops a confirmed write on a dead grant rather than looping on it', async () => {
    const rig = harness({
      answer: (request) => {
        if (request.url.includes('oauth2.googleapis.com/token')) return REVOKED;
        return { status: 401, body: { error: { code: 401 } } };
      },
    });
    const confirmation = confirmSelected({ id: 'plan_1', state: 'open', rowIds: ['plan_1_r0'] }, ['plan_1_r0'], new Date())[0];
    const answer = await WRITE_SITES[2].run(rig.ports, confirmation, input);

    console.log(`write attempts: ${rig.writes().length}, total requests: ${rig.sent.length}`);
    console.log(`  ${rig.sent.map((entry) => `${entry.method} ${entry.url}`).join('\n  ')}`);
    expect(answer.outcome).toBe('disconnected');
    // One write attempt, one refresh, and no second write. The event was never
    // written twice while the grant was dying.
    expect(rig.writes().length).toBe(1);
    expect(rig.writes()[0].url).toBe(eventsInsertUrl(STORED));
    expect(rig.sent.length).toBe(2);
  });

  it('retries once and succeeds when the refresh works, which is the case that is not permanent', async () => {
    // The counterweight. A 401 whose refresh succeeds is a live connection with
    // a stale access token, and it must not be treated as a disconnection.
    let calls = 0;
    const rig = harness({
      answer: (request) => {
        if (request.url.includes('oauth2.googleapis.com/token')) {
          return {
            status: 200,
            body: { access_token: 'fresh-access-token', expires_in: 3599, token_type: 'demonstration-bearer' },
          };
        }
        calls += 1;
        return calls === 1 ? { status: 401, body: {} } : { status: 200, body: { items: [] } };
      },
    });

    const answer = await callGoogle(rig.ports, {
      kind: 'read',
      method: 'GET',
      url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    });
    console.log(`requests: ${rig.sent.length}, outcome: ${answer.outcome}`);
    console.log(`stored refresh token kept: ${rig.tokens()?.refreshToken}`);
    expect(answer.outcome).toBe('ok');
    expect(rig.sent.length).toBe(3);
    expect(rig.permanentFailures.length).toBe(0);
    // GOOGLE'S REFRESH ANSWER CARRIES NO NEW REFRESH TOKEN, so the stored one is
    // kept rather than overwritten with nothing.
    expect(rig.tokens()?.refreshToken).toBe('refresh-token-value');
    expect(rig.tokens()?.accessToken).toBe('fresh-access-token');
  });
});
