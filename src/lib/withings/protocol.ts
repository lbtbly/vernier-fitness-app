import { MEASTYPES_PARAM, MEASURE_CATEGORY_REAL } from '@/lib/withings/codes';

/**
 * The wire format, and nothing else. Every function here returns the exact
 * parameters of one documented call, with no transport, no clock and no
 * database, so a contract test can read the request this product would send
 * without sending it.
 *
 * Three facts hold every shape below together, and all three come out of
 * `.forge/research/withings.md`:
 *
 *   1. The authorize call carries response type, client id, state, scope and
 *      redirect uri, AND NO PKCE PARAMETER. `code_challenge`,
 *      `code_challenge_method` and `code_verifier` appear nowhere in the 383 KB
 *      OpenAPI spec, nor in any of the three authorization guides. Sending one
 *      is inventing a protocol.
 *   2. The token endpoint takes `action=requesttoken`, form encoded, on both
 *      the exchange and the refresh.
 *   3. The measure call sends its type allowlist and its category explicitly.
 */

export const AUTHORIZE_URL = 'https://account.withings.com/oauth2_user/authorize2';
export const TOKEN_URL = 'https://wbsapi.withings.net/v2/oauth2';
export const MEASURE_URL = 'https://wbsapi.withings.net/measure';

/** Body composition rides on user.metrics. Nothing here needs a second scope. */
export const SCOPE = 'user.metrics';

/**
 * Parameters this product will never put on an authorize URL, asserted rather
 * than remembered. A future edit that adds one fails the contract test that
 * reads this list.
 */
export const FORBIDDEN_AUTHORIZE_PARAMS = [
  'code_challenge',
  'code_challenge_method',
  'code_verifier',
] as const;

export type AuthorizeInput = {
  clientId: string;
  redirectUri: string;
  state: string;
  /**
   * The documented demonstration switch: it logs the browser in as a demo user
   * with dummy data. It is the one mechanism usable with no contract and no
   * request signing, and this product sends it only when it is running in
   * demonstration mode.
   */
  demo?: boolean;
};

/** The authorize query, as ordered pairs, so a test can read the set exactly. */
export function authorizeParams(input: AuthorizeInput): Array<[string, string]> {
  const pairs: Array<[string, string]> = [
    ['response_type', 'code'],
    ['client_id', input.clientId],
    ['state', input.state],
    ['scope', SCOPE],
    ['redirect_uri', input.redirectUri],
  ];
  if (input.demo) pairs.push(['mode', 'demo']);
  return pairs;
}

export function authorizeUrl(input: AuthorizeInput): string {
  const url = new URL(AUTHORIZE_URL);
  for (const [key, value] of authorizeParams(input)) url.searchParams.set(key, value);
  return url.toString();
}

export type ExchangeInput = {
  clientId: string;
  clientSecret: string;
  code: string;
  /** Byte identical to the one the authorize call carried, or the exchange fails. */
  redirectUri: string;
};

/** All six parameters the client-secret exchange requires. */
export function exchangeForm(input: ExchangeInput): Record<string, string> {
  return {
    action: 'requesttoken',
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: input.redirectUri,
  };
}

export type RefreshInput = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

/** All five parameters the client-secret refresh requires. */
export function refreshForm(input: RefreshInput): Record<string, string> {
  return {
    action: 'requesttoken',
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken,
  };
}

export type MeasureInput = {
  /**
   * max(modified) already committed, in unix seconds, or null for the first
   * historical sweep.
   *
   * `lastupdate` and never a start and end window. A weigh-in can be stored or
   * corrected long after it was taken: its `date` stays where it was while its
   * `modified` moves forward, so a date-window poll whose window has already
   * passed can never see that row again and the gap is permanent. A lastupdate
   * poll sees it on the next tick.
   */
  lastUpdate: number | null;
  /** Set on the second page and after, from the offset the previous page returned. */
  offset?: number | null;
};

/**
 * The one call this product makes. The type allowlist and the category are on
 * every page of every query, never only on the first.
 */
export function measureForm(input: MeasureInput): Record<string, string> {
  const form: Record<string, string> = {
    action: 'getmeas',
    meastypes: MEASTYPES_PARAM,
    category: MEASURE_CATEGORY_REAL,
  };
  if (input.lastUpdate !== null && input.lastUpdate !== undefined) {
    form.lastupdate = String(input.lastUpdate);
  }
  if (input.offset !== null && input.offset !== undefined && input.offset > 0) {
    form.offset = String(input.offset);
  }
  return form;
}

/** The documented success fields of a token answer. */
export type TokenAnswer = {
  userid: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
};

export function readTokenAnswer(body: Record<string, unknown>): TokenAnswer | null {
  const userid = body.userid;
  const accessToken = body.access_token;
  const refreshToken = body.refresh_token;
  const expiresIn = body.expires_in;
  if (typeof accessToken !== 'string' || accessToken === '') return null;
  if (typeof refreshToken !== 'string' || refreshToken === '') return null;
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn)) return null;
  return {
    userid: typeof userid === 'string' ? userid : String(userid ?? ''),
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
    scope: typeof body.scope === 'string' ? body.scope : SCOPE,
  };
}

/**
 * Refresh at two and a half hours rather than waiting for the three-hour
 * expiry to be reported as an error. The error branch still exists and is
 * still tested; this is what keeps it from being the normal path.
 */
export const REFRESH_MARGIN_MS = 30 * 60_000;

export function accessTokenIsStale(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() - now.getTime() <= REFRESH_MARGIN_MS;
}
