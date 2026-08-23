import { strings } from '@/lib/strings';

/**
 * The payload, in both shapes, and the refusal that stops a silent send.
 *
 * TWO SHAPES IN ONE BODY, DELIBERATELY. `web_push: 8030` plus a `notification`
 * object is Declarative Web Push, iOS 18.4 and Safari 18.5 onward: the platform
 * renders it with no service worker involved at all. The flat `title`, `body`,
 * `tag` and `data` beside it is the classic shape our own worker reads. Sending
 * both is the mitigation for the case this product is actually in: the phone
 * off the tailnet, where the worker wakes, cannot fetch this origin for
 * anything, and would otherwise have nothing to draw. A worker that shows a
 * notification itself overrides the declarative one, so there is never two.
 * (webkit.org/blog/16535, Meet Declarative Web Push, 2025-03; checked
 * 2026-08-21 in .forge/research/ios-pwa.md.)
 *
 * A NON-EMPTY TITLE IS THE WHOLE CONTRACT. Apple: "Safari doesn't support
 * invisible push notifications. Present push notifications to the user
 * immediately after your service worker receives them. If you don't, Safari
 * revokes the push notification permission for your site." So the refusal is
 * HERE, at the source, before anything is encrypted or sent: a plan with no
 * title or no body never becomes a payload, and no code path can hand the
 * transport one that would show nothing. The worker's own fallback title is the
 * second belt; this is the braces.
 *
 * Pure, and it takes the origin as an argument rather than reading
 * configuration, so the unit suite grades the shape with no environment.
 */

/** The most a push payload may be. APNs answers 413 above four kilobytes. */
export const MAX_PAYLOAD_BYTES = 4096;

export type NotificationPlan = {
  title: string;
  body: string;
  /** Collapses duplicates on the device. One tag per window, per category. */
  tag: string;
  /** App relative, always starting with a slash. The declarative shape needs it absolute. */
  route: string;
  /** The reminder items this notification is about, so its action can close them. */
  itemIds: string[];
  /** The number on the Home Screen icon. Zero clears the badge rather than drawing a dot. */
  badge: number;
};

export type PushPayload = {
  /** The Declarative Web Push opt-in marker. Not a version, not a count. */
  web_push: 8030;
  notification: {
    title: string;
    lang: string;
    dir: 'ltr';
    body: string;
    navigate: string;
    silent: false;
    app_badge: string;
  };
  title: string;
  body: string;
  tag: string;
  url: string;
  itemIds: string[];
  actions: Array<{ action: string; title: string }>;
};

export type PayloadResult =
  | { ok: true; payload: PushPayload; json: string; bytes: number }
  | { ok: false; reason: 'no-title' | 'no-body' | 'too-large'; error: string; detail: string };

/**
 * The action a notification carries, and the honest note about where it shows.
 *
 * `Notification.actions` is false for `safari` and mirrored false for
 * `safari_ios` in browser-compat-data, checked 2026-08-21. So on the owner's
 * iPhone this array renders nothing, and the Done path there is the
 * notification body itself: it opens `url`, which is the pending-reminders
 * screen with the item at the top and one 48 px control that closes it. The
 * array is still sent, because the same build runs in Safari on the Mac and in
 * Chrome, both of which draw it, and because the worker reads `event.action`
 * either way. One endpoint closes the item from both routes.
 */
export const DONE_ACTION = 'done';

export function buildPayload(plan: NotificationPlan, origin: string): PayloadResult {
  const title = plan.title.trim();
  const body = plan.body.trim();

  if (title === '') {
    return {
      ok: false,
      reason: 'no-title',
      error: strings.api.push.refusedSilent,
      detail: strings.api.push.refusedSilentDetail,
    };
  }
  if (body === '') {
    return {
      ok: false,
      reason: 'no-body',
      error: strings.api.push.refusedSilent,
      detail: strings.api.push.refusedSilentDetail,
    };
  }

  const route = plan.route.startsWith('/') ? plan.route : `/${plan.route}`;
  const payload: PushPayload = {
    web_push: 8030,
    notification: {
      title,
      lang: 'en-GB',
      dir: 'ltr',
      body,
      navigate: `${origin.replace(/\/+$/, '')}${route}`,
      silent: false,
      app_badge: String(Math.max(0, Math.trunc(plan.badge))),
    },
    title,
    body,
    tag: plan.tag,
    url: route,
    itemIds: plan.itemIds,
    actions: [{ action: DONE_ACTION, title: strings.notification.doneAction }],
  };

  const json = JSON.stringify(payload);
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes > MAX_PAYLOAD_BYTES) {
    return {
      ok: false,
      reason: 'too-large',
      error: strings.api.push.refusedTooLarge,
      detail: strings.api.push.refusedTooLargeDetail,
    };
  }

  return { ok: true, payload, json, bytes };
}

/**
 * True when a payload would put something on a screen. The assertion the
 * sender runs on its own output, so a future edit to `buildPayload` that
 * drops the title cannot get past the transport either.
 */
export function isUserVisible(payload: PushPayload): boolean {
  return (
    payload.notification.title.trim() !== '' &&
    payload.title.trim() !== '' &&
    payload.notification.silent === false
  );
}
