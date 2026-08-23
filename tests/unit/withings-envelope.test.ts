import { describe, expect, it } from 'vitest';
import {
  AUTHENTICATION_STATUSES,
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  NO_DATA_STATUS,
  RATE_LIMITED_STATUS,
  TIMEOUT_STATUS,
  backoffFor,
  carriesMeasureList,
  readEnvelope,
} from '@/lib/withings/envelope';

/**
 * The envelope, and the fact that it is the only thing that decides.
 *
 * Withings answers HTTP 200 with a JSON envelope and documents no HTTP status
 * for an API error at all. A client that branches on the transport code reads a
 * 200 carrying `status: 401` as success and a proxy's 502 carrying a good
 * envelope as an outage.
 */

describe('reading the envelope', () => {
  it('takes the envelope and nothing else, so a transport code cannot reach the decision', () => {
    // THE STRUCTURAL HALF OF F41. `readEnvelope` is a unary function. There is
    // nowhere in the retry policy to read an HTTP status from, which is a
    // stronger claim than "the envelope is read on the line above": a line
    // order is one edit away from being reversed and an arity is not.
    expect(readEnvelope.length).toBe(1);
  });

  it('calls status 0 the only success', () => {
    const verdict = readEnvelope({ status: 0, body: { measuregrps: [], more: 0 } });
    expect(verdict.kind).toBe('ok');
    expect(verdict.status).toBe(0);
  });

  it('treats all seven authentication codes the same way', () => {
    // 401 is what the fetch-data guide names, 100 to 102 and 200 are the spec's
    // Authentication failed family, and 342 and 343 are the two the agent
    // reference names that the spec's own table classes differently. The two
    // readings imply the same action, so all seven get it.
    expect([...AUTHENTICATION_STATUSES]).toEqual([401, 100, 101, 102, 200, 342, 343]);
    for (const status of [401, 101, 102, 200, 342, 343]) {
      expect(readEnvelope({ status, body: {} }).kind).toBe('authentication');
    }
  });

  it('disambiguates status 100 by whether a measure list came back with it', () => {
    // The ugliest conflict in the surface: the agent reference says 100 is
    // "succeeded but no data" and the spec puts 100 in Authentication failed,
    // and the two imply opposite actions. Resolved by context, never by the
    // code alone.
    const noData = readEnvelope({ status: NO_DATA_STATUS, body: { measuregrps: [], more: 0 } });
    expect(noData.kind).toBe('no_data');

    const authFailed = readEnvelope({ status: NO_DATA_STATUS, body: {} });
    expect(authFailed.kind).toBe('authentication');

    const noBody = readEnvelope({ status: NO_DATA_STATUS });
    expect(noBody.kind).toBe('authentication');

    expect(carriesMeasureList({ status: 100, body: { measuregrps: [] } })).toBe(true);
    expect(carriesMeasureList({ status: 100, body: { more: 0 } })).toBe(false);
  });

  it('names 601 rate limited and 522 retryable, and nothing else either', () => {
    expect(readEnvelope({ status: RATE_LIMITED_STATUS, body: {} }).kind).toBe('rate_limited');
    expect(readEnvelope({ status: TIMEOUT_STATUS, body: {} }).kind).toBe('retryable');
    // Everything else non-zero is a logged failure and never a retry loop. The
    // spec's advice for the "An error occurred" family is to check the tokens
    // and then contact support, which no loop can do.
    for (const status of [214, 277, 524, 2554, 503, 3017]) {
      expect(readEnvelope({ status, body: {} }).kind).toBe('failed');
    }
  });

  it('calls an answer that is not the Withings API unreadable rather than an outage', () => {
    // A proxy error page, an empty body, an array, a string. Inventing a status
    // for one of these is how a network failure gets logged as Withings being
    // down, and then nobody looks at the network.
    for (const answer of [null, undefined, 'gateway timeout', [], { body: {} }, { status: 'ok' }]) {
      const verdict = readEnvelope(answer);
      expect(verdict.kind).toBe('unreadable');
      expect(verdict.status).toBe(-1);
    }
  });
});

describe('the backoff after a rate limit', () => {
  it('starts conservative and doubles, because no interval is documented', () => {
    // No Retry-After header, no X-RateLimit header and no published interval.
    // Sixty seconds is a choice and it is written down where it is made.
    expect(backoffFor(0, () => 0)).toBe(BACKOFF_BASE_MS);
    expect(backoffFor(1, () => 0)).toBe(BACKOFF_BASE_MS * 2);
    expect(backoffFor(2, () => 0)).toBe(BACKOFF_BASE_MS * 4);
  });

  it('carries jitter, and the jitter is provably there', () => {
    // WHAT WOULD MAKE THIS GO RED: dropping the jitter term. Two clients that
    // backed off together would then come back together for ever, which is the
    // thundering herd the interval exists to break up.
    const low = backoffFor(0, () => 0);
    const high = backoffFor(0, () => 1);
    expect(high).toBeGreaterThan(low);
    expect(high).toBe(Math.round(BACKOFF_BASE_MS * 1.5));
    for (const random of [0.1, 0.5, 0.9]) {
      const waited = backoffFor(0, () => random);
      expect(waited).toBeGreaterThanOrEqual(low);
      expect(waited).toBeLessThanOrEqual(high);
    }
  });

  it('is capped, so a long outage does not become an hour of sleep', () => {
    expect(backoffFor(20, () => 0)).toBe(BACKOFF_MAX_MS);
    expect(backoffFor(20, () => 1)).toBe(Math.round(BACKOFF_MAX_MS * 1.5));
  });
});
