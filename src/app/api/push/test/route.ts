import { sendNotification } from '@/db/push';
import { readPendingItems } from '@/db/reminders';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * One test notification, to every subscribed device.
 *
 * IT CANNOT BE A SILENT SEND. The title and the body are catalogue strings and
 * neither is empty, so the payload builder's refusal never fires here; that
 * refusal exists for the send a future caller writes badly, and the test button
 * is the surface where an owner can watch the whole path work end to end.
 *
 * The answer names what happened per device, by endpoint tail and status code,
 * because "it did not work" is not something anybody can act on and "410 on the
 * subscription ending kQ2f, removed" is.
 */
export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  const pending = await readPendingItems();
  const result = await sendNotification(
    {
      title: strings.push.testTitle,
      body: strings.push.testBody,
      tag: 'vernier-test',
      route: '/settings/notifications',
      itemIds: [],
      badge: pending.length,
    },
    'test',
  );

  if (!result.ok) {
    // 409 rather than 500: nothing is broken, the machine is not in a state
    // where a send is possible, and the answer says which state.
    return refuse(409, result.error, result.detail, { reason: result.reason });
  }

  return ok({
    sent: result.sent,
    removed: result.removed,
    bytes: result.bytes,
    answers: result.answers,
  });
}
