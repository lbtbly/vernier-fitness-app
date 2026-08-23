import {
  type Harvest,
  type WithingsMeasureGroup,
  MEASTYPES_PARAM,
  MEASURE_CATEGORY_REAL,
  harvest,
} from '@/lib/withings/codes';
import { type EnvelopeVerdict, backoffFor, readEnvelope } from '@/lib/withings/envelope';
import {
  type TokenAnswer,
  MEASURE_URL,
  TOKEN_URL,
  accessTokenIsStale,
  exchangeForm,
  measureForm,
  readTokenAnswer,
  refreshForm,
} from '@/lib/withings/protocol';

/**
 * The adapter. One place where a Withings call is made, whatever is answering:
 * the real API over the network, or the demonstration dataset with no client id
 * and no network at all. Both arrive through the same transport argument, so
 * demonstration mode is not a second code path with a second set of bugs, it is
 * the same path with a different answer.
 *
 * WHAT THE TRANSPORT IS ALLOWED TO SAY. An envelope, and an HTTP status the
 * client records and never branches on. The decision is made by
 * `readEnvelope`, which takes the envelope and nothing else, so there is
 * nowhere in the retry policy to read a transport code from. That is the whole
 * of "the envelope is read before the HTTP status": it is the shape of the
 * function rather than the order of two lines that a later edit could swap.
 */

export type TransportRequest = {
  url: string;
  form: Record<string, string>;
  /** The bearer token, on the measure call only. The token endpoint takes none. */
  bearer?: string;
};

export type TransportAnswer = {
  /** The parsed JSON envelope. This is what decides. */
  envelope: unknown;
  /** The transport's own code. Recorded on the batch, never branched on. */
  httpStatus: number;
};

export type Transport = (request: TransportRequest) => Promise<TransportAnswer>;

export type TokenBundle = {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope: string;
};

export type ClientCredentials = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type ClientPorts = {
  transport: Transport;
  credentials: ClientCredentials;
  readTokens: () => Promise<TokenBundle | null>;
  /** Writes the new pair. The rotated refresh token replaces the old one here. */
  rotateTokens: (next: TokenBundle) => Promise<void>;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  random?: () => number;
};

/**
 * A bound on the page loop, because `more`/`offset` has no documented page
 * limit and a bug that never advanced the offset would otherwise spin against
 * the API for ever. Fifty pages of measure groups is more history than a scale
 * bought today could produce by the end of this decade.
 */
export const MAX_PAGES = 50;

/** One retry on a documented timeout, and then it is a failure like any other. */
export const MAX_TIMEOUT_RETRIES = 1;

/** Two backoffs on a rate limit. A third would be a queue, and this is a poller. */
export const MAX_RATE_LIMIT_BACKOFFS = 2;

/** What one request did, kept so the batch record can print it and a test can read it. */
export type RequestLine = {
  url: string;
  form: Record<string, string>;
  envelopeStatus: number;
  httpStatus: number;
  verdict: EnvelopeVerdict['kind'];
};

export type CallCounters = {
  /** Refreshes caused by an authentication verdict. F41 allows exactly one. */
  refreshesForAuthFailure: number;
  /** Retries of the same call after that refresh. F41 allows exactly one. */
  retriesAfterRefresh: number;
  rateLimitBackoffs: number;
  timeoutRetries: number;
  /** Refreshes done because the token was about to expire, before any error. */
  proactiveRefreshes: number;
};

export type CallOutcome =
  | { kind: 'ok'; body: Record<string, unknown> }
  | { kind: 'no_data' }
  | { kind: 'reconnect'; status: number }
  | { kind: 'disconnected' }
  | { kind: 'failed'; status: number };

export type MeasureResult = {
  outcome: CallOutcome;
  requests: RequestLine[];
  counters: CallCounters;
  groups: WithingsMeasureGroup[];
  harvest: Harvest;
  /** The highest `modified` any group carried. The cursor never moves past it. */
  maxModified: number | null;
  pages: number;
  /** True when the loop stopped because it hit the cap rather than because more was 0. */
  cappedOut: boolean;
};

function emptyCounters(): CallCounters {
  return {
    refreshesForAuthFailure: 0,
    retriesAfterRefresh: 0,
    rateLimitBackoffs: 0,
    timeoutRetries: 0,
    proactiveRefreshes: 0,
  };
}

function bundleFrom(answer: TokenAnswer, now: Date): TokenBundle {
  return {
    userId: answer.userid,
    accessToken: answer.access_token,
    refreshToken: answer.refresh_token,
    expiresAt: new Date(now.getTime() + answer.expires_in * 1000).toISOString(),
    scope: answer.scope,
  };
}

/**
 * The token exchange. Six form fields, `action=requesttoken`, form encoded, and
 * the redirect uri byte identical to the one the authorize call carried.
 */
export async function exchangeCode(
  ports: ClientPorts,
  code: string,
): Promise<{ bundle: TokenBundle | null; line: RequestLine }> {
  const form = exchangeForm({
    clientId: ports.credentials.clientId,
    clientSecret: ports.credentials.clientSecret,
    code,
    redirectUri: ports.credentials.redirectUri,
  });
  const answer = await ports.transport({ url: TOKEN_URL, form });
  const verdict = readEnvelope(answer.envelope);
  const line: RequestLine = {
    url: TOKEN_URL,
    // The secret never travels into a record, a log or a screen. The field is
    // named so the shape of the call is legible; the value is not.
    form: { ...form, client_secret: '' },
    envelopeStatus: verdict.status,
    httpStatus: answer.httpStatus,
    verdict: verdict.kind,
  };
  if (verdict.kind !== 'ok') return { bundle: null, line };
  const token = readTokenAnswer(verdict.body);
  if (!token) return { bundle: null, line };
  return { bundle: bundleFrom(token, ports.now()), line };
}

/**
 * The refresh, and the rotation that has to go with it.
 *
 * Every refresh returns a NEW refresh token and the superseded one dies eight
 * hours later or the moment the new access token is used. Failing to replace it
 * means losing access with no recovery path, because the Public API has no
 * `recoverauthorizationcode` for an account with no contract: the owner would
 * have to sign in to Withings and consent again by hand. So the write is not
 * optional and it is not deferred.
 */
export async function refreshTokens(
  ports: ClientPorts,
  current: TokenBundle,
): Promise<{ bundle: TokenBundle | null; line: RequestLine }> {
  const form = refreshForm({
    clientId: ports.credentials.clientId,
    clientSecret: ports.credentials.clientSecret,
    refreshToken: current.refreshToken,
  });
  const answer = await ports.transport({ url: TOKEN_URL, form });
  const verdict = readEnvelope(answer.envelope);
  const line: RequestLine = {
    url: TOKEN_URL,
    form: { ...form, client_secret: '', refresh_token: '' },
    envelopeStatus: verdict.status,
    httpStatus: answer.httpStatus,
    verdict: verdict.kind,
  };
  if (verdict.kind !== 'ok') return { bundle: null, line };
  const token = readTokenAnswer(verdict.body);
  if (!token) return { bundle: null, line };
  const next = bundleFrom(token, ports.now());
  await ports.rotateTokens(next);
  return { bundle: next, line };
}

/**
 * One measure request, with the retry policy around it.
 *
 * An authentication verdict buys exactly one refresh and exactly one retry. If
 * the retry fails the same way, the answer is a reconnect prompt and not a
 * third attempt: the refresh token is dead and no amount of retrying will
 * revive it. 601 backs off with jitter, 522 retries once, and every other
 * non-zero status is a logged failure rather than a loop.
 */
async function callMeasure(
  ports: ClientPorts,
  form: Record<string, string>,
  tokens: TokenBundle,
  counters: CallCounters,
  requests: RequestLine[],
): Promise<{ outcome: CallOutcome; tokens: TokenBundle }> {
  let held = tokens;

  for (;;) {
    const answer = await ports.transport({ url: MEASURE_URL, form, bearer: held.accessToken });

    // THE ENVELOPE, FIRST AND ALONE. `readEnvelope` cannot see the transport
    // code: it is not one of its arguments. The HTTP status is read on the next
    // line, for the record, after the decision has already been made.
    const verdict = readEnvelope(answer.envelope);
    const httpStatus = answer.httpStatus;
    requests.push({
      url: MEASURE_URL,
      form,
      envelopeStatus: verdict.status,
      httpStatus,
      verdict: verdict.kind,
    });

    if (verdict.kind === 'ok') return { outcome: { kind: 'ok', body: verdict.body }, tokens: held };
    if (verdict.kind === 'no_data') return { outcome: { kind: 'no_data' }, tokens: held };

    if (verdict.kind === 'authentication') {
      if (counters.refreshesForAuthFailure >= 1) {
        return { outcome: { kind: 'reconnect', status: verdict.status }, tokens: held };
      }
      counters.refreshesForAuthFailure += 1;
      const refreshed = await refreshTokens(ports, held);
      requests.push(refreshed.line);
      if (!refreshed.bundle) {
        return { outcome: { kind: 'reconnect', status: verdict.status }, tokens: held };
      }
      held = refreshed.bundle;
      counters.retriesAfterRefresh += 1;
      continue;
    }

    if (verdict.kind === 'rate_limited') {
      if (counters.rateLimitBackoffs >= MAX_RATE_LIMIT_BACKOFFS) {
        return { outcome: { kind: 'failed', status: verdict.status }, tokens: held };
      }
      await ports.sleep(backoffFor(counters.rateLimitBackoffs, ports.random));
      counters.rateLimitBackoffs += 1;
      continue;
    }

    if (verdict.kind === 'retryable') {
      if (counters.timeoutRetries >= MAX_TIMEOUT_RETRIES) {
        return { outcome: { kind: 'failed', status: verdict.status }, tokens: held };
      }
      counters.timeoutRetries += 1;
      continue;
    }

    return { outcome: { kind: 'failed', status: verdict.status }, tokens: held };
  }
}

function groupsOf(body: Record<string, unknown>): WithingsMeasureGroup[] {
  const raw = body.measuregrps;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is WithingsMeasureGroup =>
      Boolean(entry) && typeof entry === 'object' && Array.isArray((entry as { measures?: unknown }).measures),
  );
}

/**
 * The whole query: every page of it, under the cap, with the type allowlist and
 * the category on each one.
 *
 * `more` is the continuation flag and `offset` is where to resume. Every other
 * parameter stays identical across the pages of one logical query, because a
 * page fetched with a different filter is a page of a different question.
 */
export async function fetchMeasures(
  ports: ClientPorts,
  lastUpdate: number | null,
): Promise<MeasureResult> {
  const counters = emptyCounters();
  const requests: RequestLine[] = [];
  const groups: WithingsMeasureGroup[] = [];

  let tokens = await ports.readTokens();
  if (!tokens) {
    return {
      outcome: { kind: 'disconnected' },
      requests,
      counters,
      groups,
      harvest: harvest([]),
      maxModified: null,
      pages: 0,
      cappedOut: false,
    };
  }

  // Ahead of the error, not instead of it. The three-hour access token is
  // refreshed at two and a half so the authentication branch is the exception
  // it is written to be rather than the normal path once every sync.
  if (accessTokenIsStale(new Date(tokens.expiresAt), ports.now())) {
    const refreshed = await refreshTokens(ports, tokens);
    requests.push(refreshed.line);
    counters.proactiveRefreshes += 1;
    if (refreshed.bundle) tokens = refreshed.bundle;
  }

  let offset: number | null = null;
  let pages = 0;
  let cappedOut = false;
  let outcome: CallOutcome = { kind: 'no_data' };

  while (pages < MAX_PAGES) {
    const form = measureForm({ lastUpdate, offset });
    const call = await callMeasure(ports, form, tokens, counters, requests);
    tokens = call.tokens;
    outcome = call.outcome;
    pages += 1;

    if (call.outcome.kind !== 'ok') break;

    groups.push(...groupsOf(call.outcome.body));
    const more = call.outcome.body.more;
    const nextOffset = call.outcome.body.offset;
    const wantsMore = more === 1 || more === true;
    if (!wantsMore) break;
    if (typeof nextOffset !== 'number' || nextOffset <= (offset ?? 0)) {
      // The continuation flag said yes and the offset did not move. Stopping
      // is the only safe answer: looping on the same offset is the spin the
      // page cap exists to catch, and it would catch it fifty requests later.
      break;
    }
    offset = nextOffset;
    if (pages >= MAX_PAGES) cappedOut = true;
  }

  if (pages >= MAX_PAGES && outcome.kind === 'ok') cappedOut = true;

  const harvested = harvest(groups);
  const maxModified = groups.reduce<number | null>(
    (highest, group) => (highest === null || group.modified > highest ? group.modified : highest),
    null,
  );

  return { outcome, requests, counters, groups, harvest: harvested, maxModified, pages, cappedOut };
}

/** Did every page of this query carry the allowlist and the category. F38 reads this. */
export function everyRequestFiltered(requests: RequestLine[]): boolean {
  const measures = requests.filter((line) => line.url === MEASURE_URL);
  if (measures.length === 0) return false;
  return measures.every(
    (line) =>
      line.form.meastypes === MEASTYPES_PARAM &&
      line.form.category === MEASURE_CATEGORY_REAL &&
      line.form.action === 'getmeas',
  );
}
