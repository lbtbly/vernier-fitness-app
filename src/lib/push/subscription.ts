/**
 * The subscription as it crosses the wire, and the one decision iOS refuses to
 * make for us.
 *
 * `ServiceWorkerGlobalScope.pushsubscriptionchange` is `false` for `safari_ios`
 * in browser-compat-data, checked 2026-08-21. That is not a gap in a table, it
 * is the whole failure mode: the subscription rotates, the endpoint changes,
 * nothing tells the page, nothing tells the worker, and every push after it
 * lands on an endpoint the push service no longer recognises. The owner sees
 * notifications stop. Nothing anywhere reports an error.
 *
 * So the app re-reads `pushManager.getSubscription()` ON EVERY LAUNCH and
 * re-posts it when the endpoint differs from the last one it sent. The decision
 * is here, pure, because "differs" has three cases and two of them are easy to
 * get backwards: nothing local, nothing sent before, and the two present and
 * unequal.
 */

export type WireSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  applicationServerKey: string;
};

/** Where the last posted endpoint is remembered on the device. */
export const LAST_POSTED_KEY = 'vernier.push-endpoint';

export type RepostDecision = 'none' | 'first' | 'rotated' | 'unchanged';

/**
 * Whether this launch has to send its subscription to the Mac mini.
 *
 *   none        the device holds no subscription, so there is nothing to post
 *   first       it holds one and this device has never posted, so post it
 *   rotated     it holds one and it is not the one last posted, so post it
 *   unchanged   the same endpoint as last time, so say nothing
 *
 * `unchanged` is the common case and it costs one localStorage read per launch,
 * which is the point: the check is cheap enough to run every single time, and
 * running it every single time is the only thing that stands in for the event
 * iOS never fires.
 */
export function repostDecision(
  localEndpoint: string | null,
  lastPosted: string | null,
): RepostDecision {
  if (!localEndpoint) return 'none';
  if (!lastPosted) return 'first';
  return localEndpoint === lastPosted ? 'unchanged' : 'rotated';
}

/** True when the decision means a POST. Written once so no caller inverts it. */
export function mustRepost(decision: RepostDecision): boolean {
  return decision === 'first' || decision === 'rotated';
}

/**
 * The base64url of an `applicationServerKey` as the browser hands it back:
 * an ArrayBuffer, uncompressed P-256, 65 bytes. Compared against the server's
 * own public key so a rotated key is a row on the diagnostics screen rather
 * than a silence.
 */
export function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * The other direction: the server's base64url public key as the `Uint8Array`
 * `subscribe()` wants. Written out longhand because `atob` is the only decoder
 * a browser has and it works in characters rather than bytes.
 */
export function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Everything a subscription must carry before this machine will store it. */
export function isWireSubscription(value: unknown): value is WireSubscription {
  const candidate = value as WireSubscription | null;
  return (
    !!candidate &&
    typeof candidate.endpoint === 'string' &&
    candidate.endpoint.startsWith('https://') &&
    !!candidate.keys &&
    typeof candidate.keys.p256dh === 'string' &&
    candidate.keys.p256dh !== '' &&
    typeof candidate.keys.auth === 'string' &&
    candidate.keys.auth !== '' &&
    typeof candidate.applicationServerKey === 'string' &&
    candidate.applicationServerKey !== ''
  );
}
