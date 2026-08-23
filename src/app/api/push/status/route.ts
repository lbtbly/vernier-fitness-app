import { probeSubscription, readSubscriptions } from '@/db/push';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { publicPushKey, pushKeysPresent } from '@/lib/push/keys';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * The three answers the diagnostics screen cannot get from the browser: does
 * this machine hold THIS endpoint, what key does it send with, and what did the
 * push service say the last time it tried.
 *
 * IT IS A POST AND IT WRITES NOTHING. A push endpoint is a two-hundred
 * character URL, and a query string puts it in every access log and every
 * referrer on the way. The body keeps it out of both. There is no idempotency
 * key because there is nothing to be idempotent about; the anti-forgery check
 * stays, because a route that reads the owner's device list is still a route
 * that answers only to the owner.
 *
 * NOTHING HERE RETURNS A SECRET. The tail of an endpoint, the PUBLIC half of
 * the key pair, a status code and a time. The private half is read in one file
 * in this repository and this is not it.
 */
export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  let body: { endpoint?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.push.bodyDetail);
  }

  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  const devices = await readSubscriptions();
  const probe = endpoint === '' ? null : await probeSubscription(endpoint);

  return ok({
    keysPresent: pushKeysPresent(),
    applicationServerKey: publicPushKey(),
    devices: devices.length,
    known: probe?.known ?? false,
    knownTail: probe?.knownTail ?? null,
    lastStatus: probe?.lastStatus ?? null,
    lastStatusAt: probe?.lastStatusAt ?? null,
  });
}
