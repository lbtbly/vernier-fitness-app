import { createHash } from 'node:crypto';

/**
 * The event identifier, derived from the app's own record and from nothing else.
 *
 * WHY IT IS NOT RANDOM. Google's `events.insert` accepts a caller-supplied `id`,
 * and an id that is a function of the planned session makes the insert
 * idempotent: re-applying the same confirmed plan writes the same id, Google
 * answers 409 on the duplicate, and the calendar still holds one event. A random
 * id would put a second identical workout in the calendar every time a plan was
 * applied twice, which is exactly the unapproved write the panel named, arriving
 * through the front door.
 *
 * It also survives a crash mid-write. A run that inserted an event and died
 * before recording it can recompute the id from the session and find out.
 *
 * THE ALPHABET IS GOOGLE'S. The reference for `events.insert` fixes it: "base32hex
 * encoding, i.e. lowercase letters a-v and digits 0-9, see section 3.1.2 in
 * RFC2938", length 5 to 1024. So the digest is encoded in base32hex rather than
 * hex, and the prefix is spelled from the same alphabet.
 */

/** RFC 4648 base32hex, lower case: the digits then a to v. */
const BASE32HEX = '0123456789abcdefghijklmnopqrstuv';

export function base32hex(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32HEX[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32HEX[(value << (5 - bits)) & 31];
  return out;
}

/**
 * The namespace the digest is taken over. It is part of the input so two
 * products sharing a calendar could never collide, and so a later change of
 * scheme is a change of namespace rather than a silent re-identification of
 * every event already in the calendar.
 */
export const EVENT_ID_NAMESPACE = 'vernier.calendar.session.v1';

/** Every id this product writes starts here, and `v` and `r` are legal base32hex. */
export const EVENT_ID_PREFIX = 'vrnr';

/** Google's own bounds, asserted rather than assumed. */
export const EVENT_ID_MIN = 5;
export const EVENT_ID_MAX = 1024;

export function eventIdFor(plannedSessionId: string): string {
  const digest = createHash('sha256').update(`${EVENT_ID_NAMESPACE}:${plannedSessionId}`).digest();
  return `${EVENT_ID_PREFIX}${base32hex(digest.subarray(0, 15))}`;
}

/** Is this an identifier Google would accept. */
export function isLegalEventId(id: string): boolean {
  if (id.length < EVENT_ID_MIN || id.length > EVENT_ID_MAX) return false;
  return /^[0-9a-v]+$/.test(id);
}
