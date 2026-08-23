import { forgetSubscription, storeSubscription } from '@/db/push';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { publicPushKey } from '@/lib/push/keys';
import { isWireSubscription } from '@/lib/push/subscription';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * Where a device says it will accept notifications, and where it takes that
 * back.
 *
 * ARRIVING TWICE IS THE NORMAL CASE. iOS never fires
 * `pushsubscriptionchange`, so the app re-reads its subscription on every
 * launch and re-posts it when the endpoint differs from the last one it sent.
 * The same endpoint arriving again is a heartbeat and moves `last_seen_at`; a
 * different one is a rotation and is a new row. Both are the same insert
 * against a unique endpoint, so neither needs an idempotency key: the second
 * arrival of an identical body changes nothing that the first did not already
 * change.
 *
 * WHAT COMES BACK CARRIES NO SECRET. The tail of the endpoint, and the PUBLIC
 * half of the key pair so the device can compare it with the one it subscribed
 * against. A rotated server key is otherwise a silence: the phone holds a
 * subscription, this machine holds a row, and every send is refused 403 by a
 * service neither of them talks to.
 */
export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  let body: { subscription?: unknown; action?: unknown; endpoint?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.push.bodyDetail);
  }

  if (body.action === 'forget') {
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
    if (endpoint === '') {
      return refuse(422, strings.api.push.notASubscription, strings.api.push.notASubscriptionDetail);
    }
    const removed = await forgetSubscription(endpoint);
    if (!removed) {
      return refuse(404, strings.api.push.unknownEndpoint, strings.api.push.unknownEndpointDetail);
    }
    return ok({ stored: false, removed: true });
  }

  if (!isWireSubscription(body.subscription)) {
    return refuse(422, strings.api.push.notASubscription, strings.api.push.notASubscriptionDetail);
  }

  const { view, created } = await storeSubscription({
    subscription: body.subscription,
    userAgent: request.headers.get('user-agent') ?? '',
  });

  return ok(
    {
      stored: true,
      created,
      endpointTail: view.endpointTail,
      applicationServerKey: publicPushKey(),
    },
    created ? 201 : 200,
  );
}
