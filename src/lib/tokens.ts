import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Token handling, kept pure so it can be tested without a request, a cookie jar
 * or a database.
 */

/** 32 bytes of randomness, base64url. Used for session values and anti-forgery tokens. */
export function mintToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What the session table stores. A stolen backup is not a pile of live sessions. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

/**
 * Constant time, and length safe. `timingSafeEqual` throws on a length
 * mismatch, and an exception is itself a signal, so the lengths are compared
 * first and a mismatch simply returns false.
 */
export function tokensMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
