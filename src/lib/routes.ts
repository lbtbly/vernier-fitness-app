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
 * The diagnostics READ is here on purpose. Four lines of `.forge/PREFLIGHT.md`
 * call it from a shell with no session, and it returns booleans, timestamps and
 * tailnet peer addresses only. It reads nothing a session would protect.
 *
 * THE DIAGNOSTICS WRITE IS NOT HERE ANY MORE. /api/diagnostics/launch sat on
 * this list because the root layout posted from every page including /sign-in,
 * and that made the row C2 reads back as proof of a Home Screen launch writable
 * by anything that could reach the port: the verifier set both signals with four
 * lines of curl, no browser and no session, using an anti-forgery pair minted by
 * one unauthenticated GET of /sign-in. Only the owner launches the owner's app,
 * so the write needs his session, and the report is raised from the shell layout
 * where the session has already been proven live. The read stays open, because a
 * preflight script curls it and it says nothing a stranger on the tailnet could
 * not already read off `tailscale status`.
 */
export const PUBLIC_PATHS: string[] = [
  '/sign-in',
  '/healthz',
  '/offline',
  '/manifest.webmanifest',
  '/sw.js',
  '/favicon.ico',
  '/api/diagnostics/device',
];

/**
 * The static shell, and only the static shell.
 *
 * A prefix is right for build output and icons, where the names are generated
 * and there is nothing to review one by one. An API namespace is not that. The
 * one public diagnostics endpoint is named above, so a second one written in a
 * later slice is protected until somebody decides otherwise and says so here.
 */
export const PUBLIC_PREFIXES: string[] = ['/_next/', '/icons/'];

/**
 * The gate itself. These cannot require a session, because they are what
 * issues one, or because they carry a credential of their own. They refuse
 * instead: no credential, no session, and the answer is 401, 403, 409, 413,
 * 422 or 429 with nothing set and nothing written.
 */
export const GATE_PATHS: string[] = [
  '/api/auth/bootstrap',
  '/api/auth/password',
  '/api/auth/passkey/authentication/options',
  '/api/auth/passkey/authentication/verify',
  '/sign-in/recover',
  /*
   * The Apple Health ingest endpoint, and it is in this class for the mirror of
   * the reason the four above are.
   *
   * They cannot require a session because they are what issues one. This cannot
   * require a session because it carries its OWN credential: an iPhone shortcut
   * posting through Get Contents of URL has no cookie jar, no anti-forgery
   * token and no way to sign in. It presents a bearer token and a keyed digest,
   * and this class's rule is exactly the one that fits: never a session, and an
   * unauthenticated caller is refused with nothing set and nothing written.
   *
   * F51 runs in both directions and neither is a special case of the other.
   * This endpoint reads no cookie at all, so a live browser session buys nothing
   * at it and is refused like a stranger. The ingest token is not a session, so
   * presenting it on any other route reaches nothing. Both are properties of the
   * code rather than of this list, and both are tested.
   */
  '/api/ingest/health',
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
 * Liveness, the offline document, the worker, the icons and the diagnostics
 * endpoints stay exactly as slice 1 shipped them, with no cookie added to a
 * response that a preflight script or a service worker reads. The launch report
 * needs a session and an anti-forgery token now, and it gets both off the page
 * that raised it rather than off a cookie this endpoint issues to a stranger.
 */
const NO_COOKIE_PATHS: string[] = [
  '/healthz',
  '/offline',
  '/sw.js',
  '/manifest.webmanifest',
  '/favicon.ico',
];
/*
 * `/api/ingest/` is here because the caller is an iPhone shortcut with no
 * cookie jar. Setting a cookie on a response nothing can store is noise at
 * best, and at worst it invites somebody later to read one on that route, which
 * would be the ambient authority the bearer token exists to avoid.
 */
const NO_COOKIE_PREFIXES: string[] = ['/_next/', '/icons/', '/api/diagnostics/', '/api/ingest/'];

export function shouldIssueCsrfCookie(pathname: string): boolean {
  if (NO_COOKIE_PATHS.includes(pathname)) return false;
  return !NO_COOKIE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
