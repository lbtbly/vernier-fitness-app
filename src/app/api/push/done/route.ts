import { markDone } from '@/db/reminders';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * Closes a reminder. One endpoint, and both routes to it end here: the
 * notification's own Done action, posted by the service worker, and the 48 px
 * control on the reminders screen.
 *
 * TWO ROUTES BECAUSE ONE PLATFORM HAS NO BUTTONS. `Notification.actions` is
 * false for `safari` and mirrored false for `safari_ios` in
 * browser-compat-data, checked 2026-08-21, so on the owner's iPhone the
 * notification carries no button at all and the tap on its body opens the
 * reminders screen with the item at the top. On a Mac the button is drawn and
 * the worker posts here directly. F117 asks that each reminder carry an action
 * that closes the item; this is that action, reachable from wherever the
 * platform allows it to be raised.
 *
 * Closing an item that is already closed is not an error. The worker retries,
 * the screen may be a minute old, and an idempotent close is the only kind that
 * survives either.
 */
export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  let body: { ids?: unknown; id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.push.bodyDetail);
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === 'string')
    : typeof body.id === 'string'
      ? [body.id]
      : [];
  if (ids.length === 0) {
    return refuse(422, strings.api.push.noItem, strings.api.push.noItemDetail);
  }

  const now = new Date();
  const closed: string[] = [];
  for (const id of ids) {
    const item = await markDone(id, now);
    if (item) closed.push(item.id);
  }

  if (closed.length === 0) {
    return refuse(404, strings.api.push.noItem, strings.api.push.noItemDetail);
  }
  return ok({ closed });
}
