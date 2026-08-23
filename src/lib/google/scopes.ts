/**
 * The three scopes, and the two that are never asked for.
 *
 * THE LIST IN CODE IS THE LIST ON THE DATA ACCESS PAGE. Google classifies a
 * scope in the console, and the authorization request has to name exactly what
 * the console declares: an extra string in the request that the project has not
 * declared produces the unverified-app screen on its own, and a declared string
 * the request never sends is an over-broad grant sitting on the account. So the
 * list lives here once, `docs/google-calendar.md` records the same three for the
 * owner to paste into the console, and
 * `tests/unit/google-scopes.test.ts` compares this file against the research
 * note and against that document character for character.
 *
 * NEVER `calendar` AND NEVER `calendar.events`. Both grant write access to every
 * calendar the owner can touch, and this product writes to one calendar it
 * created itself. `.forge/research/google-calendar.md` section 1 reads the
 * authorization block of each reference page: `calendar.app.created` is
 * sufficient for `calendars.insert`, `events.insert`, `events.patch` and
 * `events.list` on the app's own calendar, `calendar.freebusy` is sufficient for
 * `freeBusy.query`, and `calendar.calendarlist.readonly` is the narrowest scope
 * that returns calendar identifiers for the picker. Nothing else is needed and
 * nothing else is requested.
 *
 * `calendar.events.freebusy` also authorizes `freeBusy.query` and is deliberately
 * not used: it authorizes `events.list` on every calendar as well, so it is
 * strictly wider than `calendar.freebusy` for the same capability.
 *
 * Dependency free on purpose. A script and a test both read it, and neither
 * boots the app to do it.
 */

/** The picker. "See the list of Google calendars you're subscribed to." */
export const SCOPE_CALENDAR_LIST = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';

/** Availability. "View your availability in your calendars." */
export const SCOPE_FREEBUSY = 'https://www.googleapis.com/auth/calendar.freebusy';

/** The dedicated calendar. "Make secondary Google calendars, and see, create, change, and delete events on them." */
export const SCOPE_APP_CREATED = 'https://www.googleapis.com/auth/calendar.app.created';

/**
 * Exactly three, in this order, and the order is part of what is compared. The
 * array is frozen so a caller cannot push a fourth onto it at runtime.
 */
export const GOOGLE_SCOPES: readonly string[] = Object.freeze([
  SCOPE_CALENDAR_LIST,
  SCOPE_FREEBUSY,
  SCOPE_APP_CREATED,
]);

/**
 * The two that would make every calendar writable, plus the three wider reads
 * this design refuses. A test asserts none of them appears in the request.
 */
export const FORBIDDEN_SCOPES: readonly string[] = Object.freeze([
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.events.freebusy',
]);

/** Space delimited, which is what the authorization request carries. */
export const SCOPE_PARAM = GOOGLE_SCOPES.join(' ');
