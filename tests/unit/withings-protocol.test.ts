import { describe, expect, it } from 'vitest';
import { MEASTYPES_PARAM } from '@/lib/withings/codes';
import {
  AUTHORIZE_URL,
  FORBIDDEN_AUTHORIZE_PARAMS,
  MEASURE_URL,
  REFRESH_MARGIN_MS,
  SCOPE,
  TOKEN_URL,
  accessTokenIsStale,
  authorizeParams,
  authorizeUrl,
  exchangeForm,
  measureForm,
  readTokenAnswer,
  refreshForm,
} from '@/lib/withings/protocol';

/**
 * The contract, against the documented shape of every call this product makes.
 *
 * These are the F37 and F38 clauses read one at a time. Nothing here opens a
 * socket: what is being graded is the request this product would send, and a
 * request can be read without sending it.
 */

const CREDENTIALS = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'https://lamberts-mac-mini.tailda76d6.ts.net/api/withings/callback',
};

describe('the authorization request', () => {
  it('carries response type, client id, state, scope and redirect uri, and nothing else', () => {
    const pairs = authorizeParams({
      clientId: CREDENTIALS.clientId,
      redirectUri: CREDENTIALS.redirectUri,
      state: 'a-random-state',
    });
    expect(pairs).toEqual([
      ['response_type', 'code'],
      ['client_id', 'test-client-id'],
      ['state', 'a-random-state'],
      ['scope', 'user.metrics'],
      ['redirect_uri', CREDENTIALS.redirectUri],
    ]);
    expect(SCOPE).toBe('user.metrics');
  });

  it('carries no code challenge, because Withings documents none', () => {
    // `code_challenge`, `code_challenge_method` and `code_verifier` appear
    // nowhere in the 383 KB OpenAPI spec nor in any of the three authorization
    // guides, checked 2026-08-21. Sending one is inventing a protocol, and a
    // server that ignores an unknown parameter today can start rejecting it.
    //
    // WHAT WOULD MAKE THIS GO RED: adding PKCE because it felt safer.
    const url = new URL(
      authorizeUrl({
        clientId: CREDENTIALS.clientId,
        redirectUri: CREDENTIALS.redirectUri,
        state: 'a-random-state',
      }),
    );
    const sent = [...url.searchParams.keys()];
    console.log(`authorize parameters sent: ${sent.join(', ')}`);
    expect(sent).toEqual(['response_type', 'client_id', 'state', 'scope', 'redirect_uri']);
    for (const forbidden of FORBIDDEN_AUTHORIZE_PARAMS) {
      expect(url.searchParams.has(forbidden)).toBe(false);
    }
    expect(url.origin + url.pathname).toBe(AUTHORIZE_URL);
  });

  it('adds the documented demonstration switch, and only when asked', () => {
    const demo = new URL(
      authorizeUrl({ clientId: '', redirectUri: CREDENTIALS.redirectUri, state: 's', demo: true }),
    );
    expect(demo.searchParams.get('mode')).toBe('demo');
    const live = new URL(
      authorizeUrl({ clientId: 'x', redirectUri: CREDENTIALS.redirectUri, state: 's' }),
    );
    expect(live.searchParams.has('mode')).toBe(false);
  });
});

describe('the token endpoint', () => {
  it('posts the request-token action, form encoded, on the exchange', () => {
    const form = exchangeForm({ ...CREDENTIALS, code: 'thirty-second-code' });
    expect(form).toEqual({
      action: 'requesttoken',
      client_id: 'test-client-id',
      client_secret: 'test-client-secret',
      grant_type: 'authorization_code',
      code: 'thirty-second-code',
      redirect_uri: CREDENTIALS.redirectUri,
    });
    // Six fields, all six required by the spec's client-secret variant, and the
    // redirect uri byte identical to the one the authorize call carried.
    expect(Object.keys(form)).toHaveLength(6);
    expect(form.redirect_uri).toBe(
      authorizeParams({ ...CREDENTIALS, state: 's' }).find(([key]) => key === 'redirect_uri')![1],
    );
    expect(TOKEN_URL).toBe('https://wbsapi.withings.net/v2/oauth2');
  });

  it('posts the same action on the refresh, with five fields and no redirect uri', () => {
    const form = refreshForm({ ...CREDENTIALS, refreshToken: 'the-current-refresh-token' });
    expect(form).toEqual({
      action: 'requesttoken',
      client_id: 'test-client-id',
      client_secret: 'test-client-secret',
      grant_type: 'refresh_token',
      refresh_token: 'the-current-refresh-token',
    });
    expect(Object.keys(form)).toHaveLength(5);
  });

  it('takes the authorization scheme from the answer and refuses one that names none', () => {
    // RFC 6749 makes `token_type` required in a token response precisely so the
    // client is told the scheme rather than assuming it, and Withings documents
    // it among its success fields. An answer without one is refused rather than
    // guessed at: a guessed scheme fails on the owner's first real sync.
    const good = readTokenAnswer({
      userid: '12345',
      access_token: 'a',
      refresh_token: 'r',
      expires_in: 10800,
      scope: 'user.metrics',
      token_type: 'a-scheme',
    });
    expect(good?.token_type).toBe('a-scheme');
    expect(good?.expires_in).toBe(10800);

    expect(
      readTokenAnswer({ access_token: 'a', refresh_token: 'r', expires_in: 10800 }),
    ).toBeNull();
    expect(
      readTokenAnswer({ access_token: 'a', refresh_token: '', expires_in: 1, token_type: 't' }),
    ).toBeNull();
    expect(
      readTokenAnswer({ access_token: 'a', refresh_token: 'r', token_type: 't' }),
    ).toBeNull();
  });

  it('refreshes ahead of the expiry rather than waiting to be told', () => {
    // The access token lives three hours. Refreshing at two and a half keeps
    // the authentication branch the exception it is written to be instead of
    // the normal path once every sync.
    expect(REFRESH_MARGIN_MS).toBe(30 * 60_000);
    const now = new Date('2026-08-23T10:00:00Z');
    expect(accessTokenIsStale(new Date('2026-08-23T12:30:00Z'), now)).toBe(false);
    expect(accessTokenIsStale(new Date('2026-08-23T10:29:00Z'), now)).toBe(true);
    expect(accessTokenIsStale(new Date('2026-08-23T09:00:00Z'), now)).toBe(true);
  });
});

describe('the measure request', () => {
  it('sends the eight-code allowlist and category 1 explicitly, on every call', () => {
    // The default for `category` is not documented anywhere, so it is sent. An
    // unfiltered getmeas returns whatever the account holds, which on an
    // account with a monitor on it includes blood pressure.
    const first = measureForm({ lastUpdate: null });
    expect(first).toEqual({ action: 'getmeas', meastypes: MEASTYPES_PARAM, category: '1' });
    expect(first.meastypes).toBe('1,5,6,8,11,76,77,88');
    expect(MEASURE_URL).toBe('https://wbsapi.withings.net/measure');
  });

  it('sends lastupdate and never a start and end window', () => {
    // A weigh-in can be stored or corrected long after it was taken: its `date`
    // stays where it was while its `modified` moves forward. A date-window poll
    // whose window has passed can never see that row again and the gap is
    // permanent; a lastupdate poll sees it on the next tick.
    const form = measureForm({ lastUpdate: 1_594_257_200 });
    expect(form.lastupdate).toBe('1594257200');
    expect(form.startdate).toBeUndefined();
    expect(form.enddate).toBeUndefined();
  });

  it('adds the offset on a continuation and keeps every other parameter identical', () => {
    const first = measureForm({ lastUpdate: 1_594_257_200 });
    const second = measureForm({ lastUpdate: 1_594_257_200, offset: 40 });
    expect(second.offset).toBe('40');
    expect(first.offset).toBeUndefined();
    for (const key of ['action', 'meastypes', 'category', 'lastupdate']) {
      expect(second[key]).toBe(first[key]);
    }
    // A zero offset is the first page and is not sent.
    expect(measureForm({ lastUpdate: 1, offset: 0 }).offset).toBeUndefined();
  });
});
