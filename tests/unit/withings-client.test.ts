import { describe, expect, it } from 'vitest';
import {
  MAX_PAGES,
  MAX_RATE_LIMIT_BACKOFFS,
  MAX_TIMEOUT_RETRIES,
  type ClientPorts,
  type TokenBundle,
  type TransportAnswer,
  type TransportRequest,
  authorizationOf,
  everyRequestFiltered,
  fetchMeasures,
} from '@/lib/withings/client';
import { MEASTYPES_PARAM, type WithingsMeasureGroup } from '@/lib/withings/codes';
import { MEASURE_URL, TOKEN_URL } from '@/lib/withings/protocol';

/**
 * The adapter, driven against recorded responses.
 *
 * Two things are being proved here that nothing else can prove. First, that the
 * envelope really is read before the HTTP status on every call, established by
 * ACCESS ORDER rather than by reading the source: every answer this file hands
 * the client records which of its two fields was touched first, so a future
 * edit that branches on the transport code fails here rather than in production
 * against a proxy. Second, that an authentication verdict buys exactly one
 * refresh and exactly one retry and then stops.
 */

function bundle(overrides: Partial<TokenBundle> = {}): TokenBundle {
  return {
    userId: '12345',
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    // Far enough out that no proactive refresh fires, so a refresh seen in a
    // test is a refresh the error branch asked for.
    expiresAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
    scope: 'user.metrics',
    tokenType: 'a-scheme',
    ...overrides,
  };
}

/** An answer whose two fields report which one was read first. */
function answerRecording(order: string[], envelope: unknown, httpStatus: number): TransportAnswer {
  return {
    get envelope() {
      order.push('envelope');
      return envelope;
    },
    get httpStatus() {
      order.push('httpStatus');
      return httpStatus;
    },
  };
}

function measurePage(groups: WithingsMeasureGroup[], more: 0 | 1, offset: number) {
  return { status: 0, body: { updatetime: 1, timezone: 'Europe/Paris', measuregrps: groups, more, offset } };
}

function tokenAnswer(generation: number) {
  return {
    status: 0,
    body: {
      userid: '12345',
      access_token: `access-${generation}`,
      refresh_token: `refresh-${generation}`,
      expires_in: 10800,
      scope: 'user.metrics',
      token_type: 'a-scheme',
    },
  };
}

function group(grpid: number, modified: number): WithingsMeasureGroup {
  return {
    grpid,
    attrib: 0,
    date: modified - 10,
    created: modified - 5,
    modified,
    category: 1,
    measures: [
      { value: 86100, type: 1, unit: -3 },
      { value: 2185, type: 6, unit: -2 },
    ],
  };
}

type Harness = {
  ports: ClientPorts;
  sent: TransportRequest[];
  order: string[];
  slept: number[];
  rotated: TokenBundle[];
};

function harness(answers: Array<{ status: number; body?: Record<string, unknown> }>, options: {
  tokens?: TokenBundle | null;
  httpStatuses?: number[];
} = {}): Harness {
  const sent: TransportRequest[] = [];
  const order: string[] = [];
  const slept: number[] = [];
  const rotated: TokenBundle[] = [];
  let held = options.tokens === undefined ? bundle() : options.tokens;
  let index = 0;

  const ports: ClientPorts = {
    async transport(request) {
      sent.push(request);
      const answer = answers[Math.min(index, answers.length - 1)];
      const httpStatus = options.httpStatuses?.[Math.min(index, answers.length - 1)] ?? 200;
      index += 1;
      return answerRecording(order, answer, httpStatus);
    },
    credentials: { clientId: 'id', clientSecret: 'secret', redirectUri: 'https://example.test/cb' },
    readTokens: async () => held,
    async rotateTokens(next) {
      rotated.push(next);
      held = next;
    },
    now: () => new Date('2026-08-23T10:00:00Z'),
    sleep: async (ms) => {
      slept.push(ms);
    },
    random: () => 0.5,
  };
  return { ports, sent, order, slept, rotated };
}

describe('the envelope is read before the HTTP status', () => {
  it('touches the envelope first on every answer, proved by access order', () => {
    // WHAT WOULD MAKE THIS GO RED: any branch that consults `httpStatus`
    // before handing the envelope to readEnvelope. Reading the source cannot
    // catch that after a refactor; reading the access order can.
    const { ports, order } = harness([measurePage([group(1, 100)], 0, 0)]);
    return fetchMeasures(ports, null).then((result) => {
      console.log(`field access order across the run: ${order.join(' then ')}`);
      expect(result.outcome.kind).toBe('ok');
      expect(order.length).toBeGreaterThan(0);
      for (let index = 0; index < order.length; index += 2) {
        expect(order[index]).toBe('envelope');
      }
      expect(order.filter((field) => field === 'envelope')).toHaveLength(1);
    });
  });

  it('succeeds on a good envelope carried by a bad HTTP status', async () => {
    // The spec documents only a 200 response per operation, so an API error has
    // no documented HTTP code at all. A gateway that answers 503 with a
    // perfectly good envelope must not be read as a Withings failure.
    const { ports } = harness([measurePage([group(1, 100)], 0, 0)], { httpStatuses: [503] });
    const result = await fetchMeasures(ports, null);
    expect(result.outcome.kind).toBe('ok');
    expect(result.requests[0].httpStatus).toBe(503);
    expect(result.requests[0].envelopeStatus).toBe(0);
    expect(result.harvest.rows).toHaveLength(2);
  });

  it('fails on a bad envelope carried by HTTP 200, which is the ordinary case', async () => {
    const { ports } = harness([{ status: 2554, body: {} }], { httpStatuses: [200] });
    const result = await fetchMeasures(ports, null);
    expect(result.outcome).toEqual({ kind: 'failed', status: 2554 });
    expect(result.requests[0].httpStatus).toBe(200);
  });
});

describe('the retry policy', () => {
  it('spends exactly one refresh and one retry on an authentication status, then surfaces', async () => {
    // The seven codes all mean the token is not usable. One refresh, one retry,
    // and if the retry fails the same way the refresh token is dead: the public
    // API has no way to revive one, so a third attempt is a loop that ends in
    // the same place a reconnect prompt does, minutes later.
    const { ports, sent, rotated } = harness([
      { status: 401, body: {} },
      tokenAnswer(2),
      { status: 401, body: {} },
    ]);
    const result = await fetchMeasures(ports, null);

    expect(result.outcome).toEqual({ kind: 'reconnect', status: 401 });
    expect(result.counters.refreshesForAuthFailure).toBe(1);
    expect(result.counters.retriesAfterRefresh).toBe(1);
    expect(result.counters.proactiveRefreshes).toBe(0);
    // Three requests and no more: measure, token, measure.
    expect(sent.map((request) => request.url)).toEqual([MEASURE_URL, TOKEN_URL, MEASURE_URL]);
    // The rotated pair was written before the retry went out.
    expect(rotated).toHaveLength(1);
    expect(rotated[0].refreshToken).toBe('refresh-2');
    expect(sent[2].authorization).toBe(authorizationOf({ ...bundle(), accessToken: 'access-2' }));
  });

  it('recovers when the retry after the refresh works', async () => {
    const { ports, sent } = harness([
      { status: 343, body: {} },
      tokenAnswer(2),
      measurePage([group(7, 900)], 0, 0),
    ]);
    const result = await fetchMeasures(ports, null);
    expect(result.outcome.kind).toBe('ok');
    expect(result.counters.refreshesForAuthFailure).toBe(1);
    expect(result.counters.retriesAfterRefresh).toBe(1);
    expect(result.maxModified).toBe(900);
    expect(sent).toHaveLength(3);
  });

  it('asks for a reconnect when the refresh itself is refused', async () => {
    const { ports } = harness([{ status: 401, body: {} }, { status: 401, body: {} }]);
    const result = await fetchMeasures(ports, null);
    expect(result.outcome.kind).toBe('reconnect');
    expect(result.counters.retriesAfterRefresh).toBe(0);
  });

  it('backs off with jitter on 601 and gives up rather than queueing', async () => {
    const { ports, slept } = harness([{ status: 601, body: {} }]);
    const result = await fetchMeasures(ports, null);
    console.log(`backoffs slept: ${slept.join(', ')} ms`);
    expect(result.counters.rateLimitBackoffs).toBe(MAX_RATE_LIMIT_BACKOFFS);
    expect(slept).toHaveLength(MAX_RATE_LIMIT_BACKOFFS);
    // 60 s and 120 s, each with half a step of jitter at random() 0.5.
    expect(slept[0]).toBe(75_000);
    expect(slept[1]).toBe(150_000);
    expect(result.outcome).toEqual({ kind: 'failed', status: 601 });
  });

  it('retries a documented timeout once, and once only', async () => {
    const { ports, sent } = harness([{ status: 522, body: {} }, measurePage([], 0, 0)]);
    const recovered = await fetchMeasures(ports, null);
    expect(recovered.outcome.kind).toBe('ok');
    expect(recovered.counters.timeoutRetries).toBe(1);
    expect(sent).toHaveLength(2);

    const stubborn = harness([{ status: 522, body: {} }]);
    const gave = await fetchMeasures(stubborn.ports, null);
    expect(gave.counters.timeoutRetries).toBe(MAX_TIMEOUT_RETRIES);
    expect(gave.outcome).toEqual({ kind: 'failed', status: 522 });
  });

  it('treats an empty measure list under status 100 as no data, not as a failure', async () => {
    const { ports } = harness([{ status: 100, body: { measuregrps: [], more: 0 } }]);
    const result = await fetchMeasures(ports, null);
    expect(result.outcome).toEqual({ kind: 'no_data' });
    expect(result.counters.refreshesForAuthFailure).toBe(0);
  });

  it('says disconnected rather than calling out with no token', async () => {
    const { ports, sent } = harness([measurePage([], 0, 0)], { tokens: null });
    const result = await fetchMeasures(ports, null);
    expect(result.outcome).toEqual({ kind: 'disconnected' });
    expect(sent).toEqual([]);
  });

  it('refreshes ahead of the expiry, before any error', async () => {
    const stale = bundle({ expiresAt: new Date(Date.parse('2026-08-23T10:10:00Z')).toISOString() });
    const { ports, sent } = harness([tokenAnswer(2), measurePage([], 0, 0)], { tokens: stale });
    const result = await fetchMeasures(ports, null);
    expect(result.counters.proactiveRefreshes).toBe(1);
    expect(result.counters.refreshesForAuthFailure).toBe(0);
    expect(sent[0].url).toBe(TOKEN_URL);
  });
});

describe('the page loop', () => {
  it('walks three pages to exhaustion and filters every one of them', async () => {
    const { ports, sent } = harness([
      measurePage([group(1, 100), group(2, 200)], 1, 2),
      measurePage([group(3, 300), group(4, 400)], 1, 4),
      measurePage([group(5, 500)], 0, 0),
    ]);
    const result = await fetchMeasures(ports, 50);

    expect(result.pages).toBe(3);
    expect(result.groups).toHaveLength(5);
    expect(result.maxModified).toBe(500);
    expect(result.cappedOut).toBe(false);

    const forms = sent.map((request) => request.form);
    console.log(`three pages, as sent: ${JSON.stringify(forms)}`);
    // The allowlist and the category are on EVERY page, not only the first.
    expect(everyRequestFiltered(result.requests)).toBe(true);
    for (const form of forms) {
      expect(form.meastypes).toBe(MEASTYPES_PARAM);
      expect(form.category).toBe('1');
      expect(form.action).toBe('getmeas');
      expect(form.lastupdate).toBe('50');
    }
    // The offset moves and nothing else does.
    expect(forms.map((form) => form.offset)).toEqual([undefined, '2', '4']);
  });

  it('stops when the continuation flag says yes and the offset does not move', async () => {
    // The spin the page cap exists to catch, caught two requests in instead of
    // fifty. `more: 1` with an offset that never advances is a server bug or a
    // client bug, and either way looping on it is not a fix.
    const { ports, sent } = harness([measurePage([group(1, 100)], 1, 0)]);
    const result = await fetchMeasures(ports, null);
    expect(sent).toHaveLength(1);
    expect(result.pages).toBe(1);
    expect(result.groups).toHaveLength(1);
  });

  it('is bounded, so a server that always says more cannot spin for ever', async () => {
    let page = 0;
    const { ports } = harness([]);
    const bounded: ClientPorts = {
      ...ports,
      async transport() {
        page += 1;
        return { envelope: measurePage([group(page, page)], 1, page), httpStatus: 200 };
      },
    };
    const result = await fetchMeasures(bounded, null);
    console.log(`page cap held at ${result.pages} of ${MAX_PAGES}`);
    expect(result.pages).toBe(MAX_PAGES);
    expect(result.cappedOut).toBe(true);
    expect(result.groups).toHaveLength(MAX_PAGES);
  });

  it('reports the filter check as false over no measure request at all', () => {
    // A zero is evidence only beside the population it covered. An empty list
    // is not "every request was filtered", it is no request.
    expect(everyRequestFiltered([])).toBe(false);
  });
});
