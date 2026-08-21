/**
 * Sign-in rate limiting, as a decision over timestamps.
 *
 * The window is read from the audit rows rather than from a counter in memory,
 * so restarting the container is not a way to clear a lockout. Everything here
 * is pure: the caller hands in the failures it read and the clock it read them
 * with, which is what makes the rule testable without a database.
 */

export const SIGN_IN_WINDOW_SECONDS = 60;

/**
 * Five failures inside the window are tolerated. The sixth is refused, and so
 * is every attempt after it until the window passes, correct credentials
 * included. That is F13, and it is also what the sign-in screen counts down:
 * "2 attempts left, then a 60 second pause".
 */
export const SIGN_IN_MAX_FAILURES = 5;

export type LockoutState = {
  locked: boolean;
  attemptsLeft: number;
  retryAfterSeconds: number;
};

/**
 * `failures` holds the times of the failed attempts inside the window, in any
 * order. Attempts that were themselves refused by this limiter are not among
 * them: counting a refusal as a failure would extend the lockout every time the
 * owner tried the door, which is a lockout with no end.
 */
export function lockoutState(failures: Date[], now: Date = new Date()): LockoutState {
  const cutoff = now.getTime() - SIGN_IN_WINDOW_SECONDS * 1000;
  const recent = failures.filter((at) => at.getTime() > cutoff).sort((a, b) => a.getTime() - b.getTime());

  if (recent.length < SIGN_IN_MAX_FAILURES) {
    return {
      locked: false,
      attemptsLeft: SIGN_IN_MAX_FAILURES - recent.length,
      retryAfterSeconds: 0,
    };
  }

  // The window clears when the oldest failure that still counts falls out of
  // it, so the pause is exactly as long as the rule says and never longer.
  const oldest = recent[recent.length - SIGN_IN_MAX_FAILURES];
  const clearsAt = oldest.getTime() + SIGN_IN_WINDOW_SECONDS * 1000;
  return {
    locked: true,
    attemptsLeft: 0,
    retryAfterSeconds: Math.max(1, Math.ceil((clearsAt - now.getTime()) / 1000)),
  };
}
