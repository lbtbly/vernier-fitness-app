import type {
  ClientPorts,
  TokenBundle,
  Transport,
  TransportAnswer,
  TransportRequest,
} from '@/lib/google/client';
import type { TokenError } from '@/lib/google/protocol';

/**
 * The harness the Google tests share: a transport that records every request it
 * is handed, and ports with an in-memory token store.
 *
 * IT RECORDS BEFORE IT ANSWERS. Several lines below turn on "the transport was
 * never called at all", and a harness that answered from a lookup table without
 * keeping the call could not tell that from "it was called and the answer was
 * empty". So `sent` is appended to first, always, and every test that asserts a
 * zero prints the list it walked.
 */

export type Recorded = TransportRequest & { at: number };

export type Harness = {
  ports: ClientPorts;
  sent: Recorded[];
  tokens: () => TokenBundle | null;
  permanentFailures: TokenError[];
  /** Every URL the transport was asked for, for a grep over the whole run. */
  urls: () => string[];
  /**
   * Requests that could change something at Google.
   *
   * NOT SIMPLY "NOT A GET". `freeBusy.query` is a POST because it carries a body
   * and it changes nothing, which is Google's own shape rather than this app's
   * choice, so counting it as a write would report six writes where five
   * happened and would make every zero-write assertion below weaker than it
   * reads. The token endpoint is excluded for the same reason: it mints a
   * credential for this machine and touches no calendar.
   */
  writes: () => Recorded[];
};

export type Answerer = (request: TransportRequest) => TransportAnswer;

export function harness(options: {
  answer: Answerer;
  tokens?: TokenBundle | null;
  now?: () => Date;
}): Harness {
  const sent: Recorded[] = [];
  const permanentFailures: TokenError[] = [];
  let stored: TokenBundle | null =
    options.tokens === undefined ? liveTokens(options.now?.() ?? new Date()) : options.tokens;

  const transport: Transport = async (request) => {
    sent.push({ ...request, at: Date.now() });
    return options.answer(request);
  };

  const ports: ClientPorts = {
    transport,
    credentials: {
      clientId: 'client.example',
      clientSecret: 'secret.example',
      redirectUri: 'https://example.test/api/integrations/google/callback',
    },
    readTokens: async () => stored,
    storeTokens: async (next) => {
      stored = next;
    },
    onPermanentFailure: async (error) => {
      permanentFailures.push(error);
      stored = null;
    },
    now: options.now ?? (() => new Date()),
  };

  return {
    ports,
    sent,
    tokens: () => stored,
    permanentFailures,
    urls: () => sent.map((request) => request.url),
    writes: () =>
      sent.filter(
        (request) =>
          request.method !== 'GET' &&
          !request.url.includes('oauth2.googleapis.com/token') &&
          !request.url.endsWith('/freeBusy'),
      ),
  };
}

/** A live bundle, an hour out, so nothing refreshes unless a test wants it to. */
export function liveTokens(now: Date): TokenBundle {
  return {
    accessToken: 'access-token-value',
    refreshToken: 'refresh-token-value',
    expiresAt: new Date(now.getTime() + 3_600_000).toISOString(),
    scope: '',
    tokenType: 'demonstration-bearer',
  };
}

/** The shape Google answers a successful calendar write with. */
export function okAnswer(body: unknown = {}): TransportAnswer {
  return { status: 200, body };
}
