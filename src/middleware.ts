import { NextResponse, type NextRequest } from 'next/server';
import {
  CSRF_COOKIE,
  CSRF_REQUEST_HEADER,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/cookie-names';
import { classifyRoute, isApiRoute, shouldIssueCsrfCookie } from '@/lib/routes';
import { strings } from '@/lib/strings';

/**
 * The door.
 *
 * Two jobs, both cheap enough to do on every request. It turns away anyone with
 * no session cookie on a protected path, and it issues the anti-forgery token
 * for the screens that can raise a mutating request.
 *
 * It deliberately does not decide who anyone is. A cookie here is a claim, not
 * a session: the claim is checked against the database by `readSession()` in the
 * layout or the handler that actually serves the request, which is the check
 * that counts. Splitting it this way keeps the middleware free of the database
 * and free of Node-only crypto, and still leaves no protected path that answers
 * an unauthenticated caller.
 */

function mintToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Only a path on this origin, so the sign-in bounce can never be an open redirect. */
function safeReturnPath(pathname: string, search: string): string {
  if (!pathname.startsWith('/') || pathname.startsWith('//')) return '/';
  return `${pathname}${search}`;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const routeClass = classifyRoute(pathname);
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (routeClass === 'protected' && !hasSessionCookie) {
    if (isApiRoute(pathname)) {
      // The same refusal the handler gate sends, from the same two keys. One
      // outcome reads one way wherever it is refused, and the door writing its
      // own words was how a sentence with no key reached the screen.
      return NextResponse.json(
        {
          error: strings.api.session.signInFirst,
          detail: strings.api.session.signInFirstDetail,
        },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const target = request.nextUrl.clone();
    target.pathname = '/sign-in';
    target.search = '';
    const next = safeReturnPath(pathname, search);
    if (next !== '/') target.searchParams.set('next', next);
    return NextResponse.redirect(target, 307);
  }

  const existing = request.cookies.get(CSRF_COOKIE)?.value;
  const issue = shouldIssueCsrfCookie(pathname);
  if (!issue) return NextResponse.next();

  const token = existing ?? mintToken();
  const requestHeaders = new Headers(request.headers);
  // Set, never append: a client that sent this header itself does not get to
  // choose the token the page renders.
  requestHeaders.set(CSRF_REQUEST_HEADER, token);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (!existing) {
    response.cookies.set(CSRF_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  }
  return response;
}

export const config = {
  // Everything the app serves, minus the two build-output paths Next serves
  // itself. The route table decides what is public; this matcher only keeps
  // static bytes out of the middleware.
  matcher: ['/((?!_next/static|_next/image).*)'],
};
