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
  /**
   * The Withings consent page coming back, and it is on this list rather than
   * the public one because it refuses rather than answers.
   *
   * The session cookie is `SameSite=Strict`, which is right and stays. A
   * top-level navigation from `account.withings.com` is cross-site, so the
   * browser sends no cookie with it, and a protected route would answer the
   * owner's own consent with a 401 while the authorization code expires 30
   * seconds later. What stands in for the session is the `state` this app
   * minted: its SHA-256 sits on the connection row, the comparison is constant
   * time, and the pair is spent whatever the outcome. No state, no write, 403.
   *
   * It issues no session and it never will, which is the one thing
   * scripts/route-table.mjs grades a gate route on, and with no parameters at
   * all it answers 400.
   */
  '/api/withings/callback',
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

/**
 * The screens that own the whole viewport, with no tab bar over them.
 *
 * ONE ROUTE IS ON THIS LIST AND IT IS THE SESSION PLAYER. Screen 07 draws no
 * tab bar on any of its four frames and calls Set done "the only accent and the
 * largest object on the screen", and the shipped build drew the bar straight
 * over it: the control's box measured y771 to y859 in an 852 px viewport, the
 * bar sat at y795 to y852, `elementFromPoint` at the button's centre returned
 * the bar's own glyph, and a real tap there navigated to /train and ended the
 * session. The one control the owner needs mid-set, in a basement gym, quietly
 * ended his session.
 *
 * The predicate lives here rather than inside the component because this file
 * is where a route's class is decided, and because a regular expression written
 * inline in a client component is a regular expression nothing tests.
 * `/train/session/<id>` is immersive; `/train/session/<id>/edit` is not, because
 * editing a session is an ordinary screen with an ordinary way out.
 */
export function isImmersiveRoute(pathname: string): boolean {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const segments = path.split('/');
  return (
    segments.length === 4 &&
    segments[0] === '' &&
    segments[1] === 'train' &&
    segments[2] === 'session' &&
    segments[3] !== ''
  );
}
