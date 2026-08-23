/**
 * What a push service's answer means for the row this machine keeps.
 *
 * Two codes and two codes only destroy a subscription. Apple's own table
 * (developer.apple.com, Sending web push notifications in web apps and
 * browsers, checked 2026-08-21 in .forge/research/ios-pwa.md):
 *
 *   201  Success
 *   400  Bad request
 *   403  There's an error with your authentication
 *   404  Invalid :path
 *   405  Invalid :method. Only use POST
 *   410  The device token has expired
 *   413  The notification payload is too large
 *   429  Too many requests for the same destination
 *   500  APNs error
 *   503  APNs shutting down
 *
 * 404 and 410 are facts about the SUBSCRIPTION: it is not there any more, and
 * keeping the row means sending into a hole forever. Everything else is a fact
 * about THIS SEND: the key pair, the payload, the rate, the service. Deleting a
 * row on a 429 would throw away a live subscription because the owner tapped
 * the test button twice, and he would then have to notice, and re-subscribe,
 * from a phone that had stopped telling him anything. That asymmetry is the
 * whole of F116, so it lives in one exported function with one switch and the
 * six codes are walked in the unit suite.
 */

export type DeliveryOutcome = 'delivered' | 'gone' | 'kept';

/** The codes that mean the subscription no longer exists. */
export const GONE_STATUSES = [404, 410] as const;

/** The codes F116 names that must NOT touch the row. */
export const KEPT_STATUSES = [400, 403, 413, 429] as const;

/** What a push service returns when it accepted the notification. */
export const DELIVERED_STATUSES = [200, 201, 202] as const;

export function deliveryOutcome(status: number): DeliveryOutcome {
  if ((GONE_STATUSES as readonly number[]).includes(status)) return 'gone';
  if ((DELIVERED_STATUSES as readonly number[]).includes(status)) return 'delivered';
  return 'kept';
}

/** True when the stored subscription must be deleted because of this answer. */
export function deletesSubscription(status: number): boolean {
  return deliveryOutcome(status) === 'gone';
}
