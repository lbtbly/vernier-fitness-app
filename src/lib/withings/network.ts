import type { Transport, TransportAnswer, TransportRequest } from '@/lib/withings/client';

/**
 * The one place this product opens a socket to Withings.
 *
 * Form encoded, because both documented endpoints take
 * `application/x-www-form-urlencoded` and neither takes JSON. Bounded, because
 * an unbounded request is a screen that spins: nothing here waits longer than
 * `REQUEST_TIMEOUT_MS`, and an origin that goes away mid-call comes back as an
 * unreadable envelope rather than as a thrown exception the caller has to
 * remember to catch.
 *
 * It returns the HTTP status and does not act on it. The decision belongs to
 * `readEnvelope`, which cannot see this number.
 */

export const REQUEST_TIMEOUT_MS = 10_000;

export type NetworkFailure = { reason: 'unreachable' | 'not_json' | 'timeout'; detail: string };

export function networkTransport(onFailure?: (failure: NetworkFailure) => void): Transport {
  return async (request: TransportRequest): Promise<TransportAnswer> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    if (request.bearer) headers.Authorization = `Bearer ${request.bearer}`;

    let response: Response;
    try {
      response = await fetch(request.url, {
        method: 'POST',
        headers,
        body: new URLSearchParams(request.form).toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: 'no-store',
      });
    } catch (error) {
      const timedOut = (error as Error).name === 'TimeoutError';
      onFailure?.({
        reason: timedOut ? 'timeout' : 'unreachable',
        detail: (error as Error).message,
      });
      // Not an exception and not a fake envelope with an invented status. An
      // answer that is not the Withings API is `unreadable` to readEnvelope,
      // which is exactly what happened, and the caller records it as a cause
      // rather than reporting a Withings outage the API never reported.
      return { envelope: null, httpStatus: 0 };
    }

    const httpStatus = response.status;
    try {
      const envelope = await response.json();
      return { envelope, httpStatus };
    } catch (error) {
      onFailure?.({ reason: 'not_json', detail: (error as Error).message });
      return { envelope: null, httpStatus };
    }
  };
}
