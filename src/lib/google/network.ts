import type { Transport, TransportAnswer, TransportRequest } from '@/lib/google/client';

/**
 * The one place this product opens a socket to Google.
 *
 * Two body shapes, because Google documents two: the token endpoint takes
 * `application/x-www-form-urlencoded` and refuses JSON, and the Calendar API
 * takes JSON. Bounded, because an unbounded request is a screen that spins.
 *
 * It returns the HTTP status and does not act on it. What a status means is
 * decided in `client.ts`, which is also where the one refresh and the one retry
 * live, so there is nowhere in the retry policy for a transport to add a rule of
 * its own.
 *
 * An origin that goes away mid-call comes back as status 0 with the failure
 * recorded, rather than as a thrown exception every caller has to remember to
 * catch. That is how F111 gets its answer: the calendar is unreachable, the
 * training week still renders from the last stored availability, and the cause
 * is named rather than guessed.
 */

export const REQUEST_TIMEOUT_MS = 10_000;

export type NetworkFailure = { reason: 'unreachable' | 'not_json' | 'timeout'; detail: string };

export function networkTransport(onFailure?: (failure: NetworkFailure) => void): Transport {
  return async (request: TransportRequest): Promise<TransportAnswer> => {
    const headers: Record<string, string> = {};
    if (request.authorization) headers.Authorization = request.authorization;

    let body: string | undefined;
    if (request.form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(request.form).toString();
    } else if (request.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(request.json);
    }

    let response: Response;
    try {
      response = await fetch(request.url, {
        method: request.method,
        headers,
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: 'no-store',
      });
    } catch (error) {
      const timedOut = (error as Error).name === 'TimeoutError';
      onFailure?.({
        reason: timedOut ? 'timeout' : 'unreachable',
        detail: (error as Error).message,
      });
      return { status: 0, body: null };
    }

    const status = response.status;
    // 204 is what a successful delete answers with, and it has no body at all.
    if (status === 204) return { status, body: null };

    const text = await response.text().catch(() => '');
    if (text === '') return { status, body: null };
    try {
      return { status, body: JSON.parse(text) };
    } catch (error) {
      onFailure?.({ reason: 'not_json', detail: (error as Error).message });
      // The text is carried rather than dropped: F109 stores the raw error body
      // and an error page from a proxy is exactly what that is for.
      return { status, body: text };
    }
  };
}
