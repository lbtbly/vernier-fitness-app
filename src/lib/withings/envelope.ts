/**
 * The response envelope, read before the HTTP status, always.
 *
 * Every Withings service answers HTTP 200 with `{ "status": n, "body": {} }`
 * and the spec documents no HTTP status for an API error at all. A client that
 * branches on the HTTP code is branching on a number nobody promised: it will
 * read a 200 carrying `status: 401` as success and a proxy's 502 carrying a
 * perfectly good envelope as a failure.
 *
 * So the whole decision lives in this file, it takes an envelope and nothing
 * else, and the HTTP status is not one of its arguments. That is the shape of
 * the guarantee rather than a comment about it: there is nowhere in here to
 * read a transport code from.
 *
 * Dependency free on purpose. No fetch, no clock, no database.
 */

/** What came back, before anything decides what to do about it. */
export type Envelope = {
  status?: unknown;
  body?: unknown;
  error?: unknown;
};

/**
 * The seven codes that mean the token is not usable.
 *
 * The docs give two answers and they do not agree. The fetch-data guide names
 * 401. The agent reference names 342 "OAuth credentials are absent or
 * incorrect" and 343 "OAuth access token absent or invalid", neither of which
 * is in the spec's own table with that meaning. The spec puts 100 to 102 and
 * 200 in the Authentication failed family. This set satisfies every reading,
 * and every one of them takes the same action: refresh once, retry once, then
 * stop and ask the owner to reconnect.
 */
export const AUTHENTICATION_STATUSES = [401, 100, 101, 102, 200, 342, 343] as const;

/** Too many requests. Back off with jitter; the retry interval is not documented. */
export const RATE_LIMITED_STATUS = 601;

/** The service timed out. The spec says plainly: retry. */
export const TIMEOUT_STATUS = 522;

/**
 * The ugliest conflict in the whole API surface. The agent reference documents
 * 100 as "Request succeeded but no data found" and the spec puts 100 in the
 * Authentication failed family, and the two readings imply opposite actions.
 *
 * Resolved by context rather than by the code alone, which is the only way to
 * resolve it: if the body is present and carries a `measuregrps` array, the
 * call reached the data layer and the data layer had nothing, so it is no data.
 * If the body is absent or carries no measure list, nothing answered about
 * data at all, so it is an authentication failure and the token is refreshed.
 */
export const NO_DATA_STATUS = 100;

export type EnvelopeVerdict =
  | { kind: 'ok'; status: number; body: Record<string, unknown> }
  | { kind: 'no_data'; status: number }
  | { kind: 'authentication'; status: number }
  | { kind: 'rate_limited'; status: number }
  | { kind: 'retryable'; status: number }
  | { kind: 'failed'; status: number }
  | { kind: 'unreadable'; status: number };

/** The one status that means success. Everything else non-zero is an error. */
export const SUCCESS_STATUS = 0;

function bodyOf(envelope: Envelope): Record<string, unknown> | null {
  const body = envelope.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

/** True when the body answered about measures, even if it answered with none. */
export function carriesMeasureList(envelope: Envelope): boolean {
  const body = bodyOf(envelope);
  return body !== null && Array.isArray(body.measuregrps);
}

/**
 * Read the envelope. It takes no HTTP status because it must not have one.
 *
 * An answer that is not an object, or that carries no numeric `status`, is
 * `unreadable` rather than a failure with an invented code: something that is
 * not the Withings API answered, and pretending it was is how a proxy error
 * page gets logged as a Withings outage.
 */
export function readEnvelope(envelope: unknown): EnvelopeVerdict {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return { kind: 'unreadable', status: -1 };
  }
  const parsed = envelope as Envelope;
  if (typeof parsed.status !== 'number' || !Number.isFinite(parsed.status)) {
    return { kind: 'unreadable', status: -1 };
  }
  const status = parsed.status;

  if (status === SUCCESS_STATUS) {
    return { kind: 'ok', status, body: bodyOf(parsed) ?? {} };
  }
  if (status === NO_DATA_STATUS) {
    return carriesMeasureList(parsed)
      ? { kind: 'no_data', status }
      : { kind: 'authentication', status };
  }
  if ((AUTHENTICATION_STATUSES as readonly number[]).includes(status)) {
    return { kind: 'authentication', status };
  }
  if (status === RATE_LIMITED_STATUS) return { kind: 'rate_limited', status };
  if (status === TIMEOUT_STATUS) return { kind: 'retryable', status };
  return { kind: 'failed', status };
}

/**
 * How long to wait after a 601, in milliseconds.
 *
 * No `Retry-After` header, no `X-RateLimit-*` header and no backoff interval is
 * documented anywhere, so the interval is conservative and stated here rather
 * than guessed at a call site: sixty seconds, doubling, with up to half of the
 * step added as jitter so two clients that started together do not stay
 * together. `random` is an argument so a test can fix it and so the jitter is
 * provably present rather than provably absent.
 */
export const BACKOFF_BASE_MS = 60_000;
export const BACKOFF_MAX_MS = 15 * 60_000;

export function backoffFor(attempt: number, random: () => number = Math.random): number {
  const step = Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempt), BACKOFF_MAX_MS);
  return Math.round(step + step * 0.5 * random());
}
