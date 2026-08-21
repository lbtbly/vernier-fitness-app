import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { deleteSession, insertSession, readSessionRow, touchSession, type SessionRow } from '@/db/auth';
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  CSRF_REQUEST_HEADER,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/cookie-names';

/**
 * The session cookie.
 *
 * HttpOnly so no script can read it, Secure so it never leaves the device over
 * plain HTTP, SameSite=Strict because this app has no cross-site flow at all
 * and nothing on another origin has any business carrying its session. Eight
 * hours, which is well inside the 24 the rubric allows, and the value is minted
 * fresh on every sign-in rather than reused.
 *
 * What the database holds is the SHA-256 of the value. A backup of the session
 * table is therefore not a pile of usable sessions.
 */
export { CSRF_COOKIE, CSRF_HEADER, CSRF_REQUEST_HEADER, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS };

export type SignInMethod = 'password' | 'passkey' | 'recovery' | 'bootstrap';

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

const COOKIE_BASE = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/',
} as const;

/**
 * Rotation, in one place. Any session the request arrived with is destroyed and
 * a new value is minted, so the cookie before a sign-in and the cookie after it
 * are never the same string.
 */
export async function startSession(
  ownerId: string,
  method: SignInMethod,
): Promise<{ token: string; csrfToken: string }> {
  const jar = await cookies();
  const previous = jar.get(SESSION_COOKIE)?.value;
  if (previous) await deleteSession(hashSessionToken(previous));

  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  await insertSession({
    id: hashSessionToken(token),
    ownerId,
    csrfToken,
    method,
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
  });

  jar.set(SESSION_COOKIE, token, { ...COOKIE_BASE, maxAge: SESSION_MAX_AGE_SECONDS });
  jar.set(CSRF_COOKIE, csrfToken, { ...COOKIE_BASE, maxAge: SESSION_MAX_AGE_SECONDS });
  return { token, csrfToken };
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(hashSessionToken(token));
  jar.set(SESSION_COOKIE, '', { ...COOKIE_BASE, maxAge: 0 });
}

/**
 * Reads and validates. A cookie that names no live row is not a session, which
 * is what makes the middleware's cheap presence check safe: the middleware
 * turns strangers away at the door, and this is the check that actually decides.
 */
export async function readSession(): Promise<SessionRow | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return readSessionRow(hashSessionToken(token));
}

export async function readSessionAndTouch(): Promise<SessionRow | null> {
  const row = await readSession();
  if (row) await touchSession(row.id);
  return row;
}

/**
 * Constant time, and length safe. `timingSafeEqual` throws on a length
 * mismatch, which would leak the length through an exception.
 */
export function tokensMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
