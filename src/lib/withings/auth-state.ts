import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The `state` parameter, which is the whole of the cross-site protection this
 * flow has.
 *
 * Withings documents no PKCE parameter of any kind: `code_challenge`,
 * `code_challenge_method` and `code_verifier` appear nowhere in the spec nor in
 * any of the three authorization guides. What the guide does say is that state
 * "acts as a CSRF protection mechanism", is returned on the callback, and
 * "should be validated at this point". So this is the check, and it lives on its
 * own so it can be graded without a database.
 *
 * Only the SHA-256 is stored, so a backup of the connection table carries
 * nothing replayable, and the comparison is constant time.
 */

/** Ten minutes. The consent page is a page, and the code it mints lives 30 seconds. */
export const AUTH_STATE_LIFE_MS = 10 * 60_000;

export function mintAuthState(): { state: string; hash: string } {
  const state = randomBytes(32).toString('base64url');
  return { state, hash: hashAuthState(state) };
}

export function hashAuthState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

export type AuthStateVerdict = 'matched' | 'no_state_issued' | 'mismatch' | 'expired';

/**
 * Does this callback carry the state this app sent.
 *
 * Four answers and each one is refused differently in the log, but three of
 * them write nothing at all. The pair is spent by the caller whatever comes
 * back, so a value that does not match cannot be retried against the same hash.
 */
export function checkAuthState(
  offered: string,
  storedHash: string | null,
  issuedAt: Date | null,
  now: Date,
): AuthStateVerdict {
  if (!storedHash || !issuedAt) return 'no_state_issued';
  const left = Buffer.from(hashAuthState(offered), 'hex');
  const right = Buffer.from(storedHash, 'hex');
  if (left.length !== right.length || !timingSafeEqual(left, right)) return 'mismatch';
  if (now.getTime() - issuedAt.getTime() > AUTH_STATE_LIFE_MS) return 'expired';
  return 'matched';
}
