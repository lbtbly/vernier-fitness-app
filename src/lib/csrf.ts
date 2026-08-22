import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  CSRF_REQUEST_HEADER,
  readSession,
  tokensMatch,
} from '@/lib/session';
import { strings } from '@/lib/strings';

/**
 * Anti-forgery on every mutating route.
 *
 * The token lives in an HttpOnly cookie the middleware issues, and the server
 * hands the same value to the page it renders through a request header. The
 * client sends it back in `x-vernier-csrf`. A cross-site form post carries the
 * cookie and cannot carry the header, so it fails, and no script on another
 * origin can read the cookie to forge one.
 *
 * Once a session exists the cookie holds that session's token, so a stale token
 * from before a sign-in stops working the moment the session rotates.
 *
 * A refused request writes nothing at all, not even an audit row. F12 counts
 * rows before and after and expects the number not to move, and a rejection
 * this early is not an attempt on a credential: it never reached one.
 *
 * There is no exemption list. The launch report used to hold one, because the
 * root layout posted without a token, and that made the row C2's evidence
 * rests on writable by anything on the tailnet with a curl. The layout is a
 * server component, so it mints the token and hands it to the client instead.
 */

export async function readCsrfToken(): Promise<string> {
  const [jar, headerBag] = await Promise.all([cookies(), headers()]);
  // The header is the value the middleware minted for this very request, which
  // is the only value available on the first visit, before the cookie has made
  // a round trip.
  return headerBag.get(CSRF_REQUEST_HEADER) ?? jar.get(CSRF_COOKIE)?.value ?? '';
}

export type CsrfFailure = { response: NextResponse };

/**
 * Returns a 403 to send back, or null when the request may proceed. Written
 * this way so a handler reads as: refuse, then act.
 */
export async function csrfFailure(request: Request): Promise<CsrfFailure | null> {
  const jar = await cookies();
  const cookieToken = jar.get(CSRF_COOKIE)?.value;
  const headerToken = request.headers.get(CSRF_HEADER);

  const refuse = (reason: string): CsrfFailure => ({
    response: NextResponse.json(
      {
        error: strings.api.csrf.failed,
        detail: reason,
      },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    ),
  });

  if (!headerToken) return refuse(strings.api.csrf.noHeader(CSRF_HEADER));
  if (!cookieToken) return refuse(strings.api.csrf.noCookie);
  if (!tokensMatch(headerToken, cookieToken)) {
    return refuse(strings.api.csrf.mismatch);
  }

  const session = await readSession();
  if (session && !tokensMatch(cookieToken, session.csrfToken)) {
    return refuse(strings.api.csrf.stale);
  }

  return null;
}
