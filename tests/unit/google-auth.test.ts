import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { exchangeCode } from '@/lib/google/client';
import { authorizeUrl, readTokenAnswer, readTokenError } from '@/lib/google/protocol';
import { checkAuthState, mintAuthState } from '@/lib/withings/auth-state';
import { harness } from './google-harness';

/**
 * F103. The authorization round trip: offline access and a forced consent
 * prompt ON EVERY RUN, the returned state validated before the code is touched,
 * the refresh token persisted BEFORE the handler returns, and a redirect to a
 * URL carrying no authorization code.
 *
 * The first and the fourth are properties of what this code builds, so they are
 * asserted here. The second is `checkAuthState`, which is the same function the
 * Withings callback uses and is graded here against a Google round trip as well,
 * because a shared rule with one test is a rule that only one caller is known to
 * honour. The third is an ORDERING, and an ordering can only be proven by
 * watching it happen: the store is called with the bundle and the call is
 * recorded before `exchangeCode` resolves.
 *
 * WHAT WOULD MAKE THIS GO RED. Dropping `prompt=consent` after the first
 * authorization, which is the optimisation that looks harmless and leaves the
 * installation with no refresh token and no way to get one. Storing the bundle
 * after the answer. Redirecting with the code still on the URL.
 */

const root = fileURLToPath(new URL('../..', import.meta.url));

const credentials = {
  clientId: 'client.example',
  redirectUri: 'https://example.test/api/integrations/google/callback',
};

describe('F103, the authorization request', () => {
  it('carries offline access and a forced consent prompt on every run', () => {
    // THREE RUNS, not one. The failure this guards against is a client that
    // asks for consent the first time and stops afterwards, because Google
    // returns a refresh token only on the first authorization and a plain
    // re-authorization after a lost one returns nothing at all.
    const runs = ['first', 'second', 'third'].map((label) => {
      const url = new URL(authorizeUrl({ ...credentials, state: `state-${label}` }));
      return {
        label,
        accessType: url.searchParams.get('access_type'),
        prompt: url.searchParams.get('prompt'),
        responseType: url.searchParams.get('response_type'),
        state: url.searchParams.get('state'),
        redirect: url.searchParams.get('redirect_uri'),
      };
    });
    for (const run of runs) {
      console.log(
        `run ${run.label}: access_type=${run.accessType}, prompt=${run.prompt}, response_type=${run.responseType}, state=${run.state}`,
      );
      expect(run.accessType).toBe('offline');
      expect(run.prompt).toBe('consent');
      expect(run.responseType).toBe('code');
      expect(run.state).toBe(`state-${run.label}`);
      expect(run.redirect).toBe(credentials.redirectUri);
    }
    expect(runs.length).toBe(3);
  });

  it('goes to the endpoint Google documents and carries no client secret', () => {
    const url = new URL(authorizeUrl({ ...credentials, state: 'value' }));
    console.log(`authorize endpoint: ${url.origin}${url.pathname}`);
    console.log(`parameters: ${[...url.searchParams.keys()].join(', ')}`);
    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_secret')).toBeNull();
    // Incremental authorization is off, so the grant is exactly the three scopes
    // this request names rather than those plus whatever was granted before.
    expect(url.searchParams.get('include_granted_scopes')).toBe('false');
  });

  it('accepts the state it minted and refuses one that does not match', () => {
    const now = new Date('2026-08-23T20:45:00.000Z');
    const minted = mintAuthState();
    const issued = new Date(now.getTime() - 60_000);

    const verdicts = {
      matched: checkAuthState(minted.state, minted.hash, issued, now),
      mismatch: checkAuthState(`${minted.state}x`, minted.hash, issued, now),
      never: checkAuthState(minted.state, null, null, now),
      expired: checkAuthState(minted.state, minted.hash, new Date(now.getTime() - 3_600_000), now),
    };
    console.log(`state verdicts: ${JSON.stringify(verdicts)}`);
    expect(verdicts.matched).toBe('matched');
    expect(verdicts.mismatch).toBe('mismatch');
    expect(verdicts.never).toBe('no_state_issued');
    expect(verdicts.expired).toBe('expired');

    // Only the hash is kept, so a stolen copy of the connection row carries
    // nothing replayable.
    expect(minted.hash).not.toBe(minted.state);
    expect(minted.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('F103, the token exchange', () => {
  it('persists the refresh token before the exchange returns', async () => {
    const order: string[] = [];
    const rig = harness({
      tokens: null,
      answer: () => ({
        status: 200,
        body: {
          access_token: 'access-value',
          refresh_token: 'refresh-value',
          expires_in: 3599,
          scope: '',
          token_type: 'demonstration-bearer',
        },
      }),
    });
    const ports = {
      ...rig.ports,
      storeTokens: async (next: Parameters<typeof rig.ports.storeTokens>[0]) => {
        order.push('stored');
        await rig.ports.storeTokens(next);
      },
    };

    const result = await exchangeCode(ports, 'authorization-code');
    order.push('returned');

    console.log(`order of events: ${order.join(' then ')}`);
    console.log(`stored refresh token present: ${rig.tokens()?.refreshToken !== undefined}`);
    // THE ORDERING IS THE ASSERTION. A handler that answered first and stored
    // afterwards would lose the one refresh token Google ever issues to any
    // crash in between, and the only way back is a fresh consent.
    expect(order).toEqual(['stored', 'returned']);
    expect(result.outcome).toBe('connected');
    expect(rig.tokens()?.refreshToken).toBe('refresh-value');
  });

  it('refuses an answer with no refresh token in it, and stores nothing', async () => {
    const rig = harness({
      tokens: null,
      answer: () => ({
        status: 200,
        body: { access_token: 'access-value', expires_in: 3599, token_type: 'demonstration-bearer' },
      }),
    });
    const result = await exchangeCode(rig.ports, 'authorization-code');
    console.log(`outcome with no refresh token: ${result.outcome}, nothing stored: ${rig.tokens() === null}`);
    expect(result.outcome).toBe('no_refresh_token');
    expect(rig.tokens()).toBeNull();
  });

  it('reads Google error bodies as tokens, keeping the raw text whole', () => {
    const body = { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' };
    const error = readTokenError(body);
    console.log(`kind=${error.kind}, permanent=${error.permanent}, raw=${error.raw}`);
    expect(error.kind).toBe('invalid_grant');
    expect(error.permanent).toBe(true);
    // The raw body is kept, because "invalid_grant" and Google's own sentence
    // are two different facts and the second is the one the owner acts on.
    expect(error.raw).toContain('Token has been expired or revoked.');

    expect(readTokenError({ error: 'deleted_client' }).permanent).toBe(true);
    expect(readTokenError({ error: 'invalid_client' }).permanent).toBe(true);
    expect(readTokenError({ error: 'invalid_request' }).permanent).toBe(false);
    expect(readTokenError({}).kind).toBe('other');

    // And a body that is not a token answer is not read as one.
    expect(readTokenAnswer(body)).toBeNull();
    expect(readTokenAnswer({ access_token: '', expires_in: 1, token_type: 'x' })).toBeNull();
  });
});

describe('F103, the redirect afterwards', () => {
  it('sends the browser to a URL with no authorization code on it', () => {
    // Google's own warning: a response endpoint that renders a page lets every
    // resource on it read the code out of the URL. The route handles the code
    // and then redirects, and the target is a fixed path with no parameters.
    const source = readFileSync(
      `${root}src/app/api/integrations/google/callback/route.ts`,
      'utf8',
    );
    const redirects = [...source.matchAll(/NextResponse\.redirect\(([^)]*)\)/g)].map((match) =>
      match[1].replace(/\s+/g, ' ').trim(),
    );
    console.log(`redirects in the callback route:\n  ${redirects.join('\n  ')}`);
    expect(redirects.length).toBe(2);
    for (const target of redirects) {
      expect(target).toContain('${appUrl}/settings');
      expect(target).not.toContain('code');
      expect(target).not.toContain('searchParams');
      expect(target).not.toContain('request.url');
    }
  });
});
