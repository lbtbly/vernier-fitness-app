/**
 * The route table, in one place, because two places is how a route quietly
 * stops being protected.
 *
 * The middleware reads it to decide what needs a session cookie, and
 * `scripts/route-table.mjs` reads this same file to walk every route the app
 * serves and print what each one answers to an unauthenticated caller. That is
 * F14: the list the gate enforces and the list the walker grades are the same
 * list.
 *
 * Deliberately dependency free and free of TypeScript that needs more than type
 * stripping, so Node can import it directly from a script.
 */

export type RouteClass = 'public' | 'gate' | 'protected';

/**
 * Answers in full to anyone who can reach the tailnet.
 *
 * The two diagnostics endpoints are here on purpose. Four lines of
 * `.forge/PREFLIGHT.md` call them from a shell with no session, and they return
 * booleans, timestamps and tailnet peer addresses only. They read nothing a
 * session would protect.
 */
export const PUBLIC_PATHS: string[] = [
  '/sign-in',
  '/healthz',
  '/offline',
  '/manifest.webmanifest',
  '/sw.js',
  '/favicon.ico',
  '/api/diagnostics/device',
  '/api/diagnostics/launch',
];

/** The static shell, plus anything under the diagnostics report. */
export const PUBLIC_PREFIXES: string[] = ['/_next/', '/icons/', '/api/diagnostics/'];

/**
 * The gate itself. These cannot require a session, because they are what
 * issues one. They refuse instead: no credential, no session, and the answer is
 * 401, 403 or 429 with nothing set and nothing written.
 */
export const GATE_PATHS: string[] = [
  '/api/auth/bootstrap',
  '/api/auth/password',
  '/api/auth/passkey/authentication/options',
  '/api/auth/passkey/authentication/verify',
  '/sign-in/recover',
];

export function classifyRoute(pathname: string): RouteClass {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (PUBLIC_PATHS.includes(path)) return 'public';
  if (PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) return 'public';
  if (GATE_PATHS.includes(path)) return 'gate';
  return 'protected';
}

/** True when an unauthenticated request is allowed to reach the handler. */
export function isOpenRoute(pathname: string): boolean {
  return classifyRoute(pathname) !== 'protected';
}

/**
 * An API path answers 401 to a caller with no session. A document redirects to
 * the sign-in screen, because a person who followed a link wants the gate, not
 * a status code.
 */
export function isApiRoute(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

/**
 * Where the anti-forgery cookie is issued: on the screens that can raise a
 * mutating request, and nowhere else.
 *
 * Liveness, the offline document, the worker, the icons and the two
 * diagnostics endpoints stay exactly as slice 1 shipped them, with no cookie
 * added to a response that a preflight script or a service worker reads.
 */
const NO_COOKIE_PATHS: string[] = [
  '/healthz',
  '/offline',
  '/sw.js',
  '/manifest.webmanifest',
  '/favicon.ico',
];
const NO_COOKIE_PREFIXES: string[] = ['/_next/', '/icons/', '/api/diagnostics/'];

export function shouldIssueCsrfCookie(pathname: string): boolean {
  if (NO_COOKIE_PATHS.includes(pathname)) return false;
  return !NO_COOKIE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
