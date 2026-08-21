/**
 * Cookie and header names, alone in a file with no imports, because the
 * middleware needs them and the middleware must not pull `node:crypto` or
 * `next/headers` into its bundle to get them.
 */
export const SESSION_COOKIE = 'vernier_session';
export const CSRF_COOKIE = 'vernier_csrf';

/** What the browser sends back on a mutating request. */
export const CSRF_HEADER = 'x-vernier-csrf';

/** How the middleware hands this request's token to the page it renders. */
export const CSRF_REQUEST_HEADER = 'x-vernier-csrf-token';

/** Eight hours. The rubric allows under 24 and there is no reason to spend it. */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
