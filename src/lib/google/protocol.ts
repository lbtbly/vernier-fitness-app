import { GOOGLE_SCOPES, SCOPE_PARAM } from '@/lib/google/scopes';

/**
 * The wire, as Google documents it, and nothing invented beside it.
 *
 * Every endpoint, parameter and field below was read off an official page and
 * is recorded in `.forge/research/google-calendar.md` with its check date. No
 * Google client library is installed and none is wanted: PLAN.md line 30 names
 * the complete dependency list and there is no Google package on it, so this
 * talks to Google over raw fetch and the shape of every request is legible in
 * one file.
 *
 * NOTHING HERE OPENS A SOCKET. It builds URLs and form bodies and it reads
 * answers. The transport is an argument to the client, which is what lets the
 * demonstration dataset answer the same calls with no client identifier and no
 * network, exactly as slice 5 does for Withings.
 */

export const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
export const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

/**
 * The authorization request.
 *
 * `access_type=offline` and `prompt=consent` ON EVERY RUN, and that pair is not
 * belt and braces. Google returns a refresh token only when access is offline,
 * and "the refresh_token is only returned on the first authorization": a plain
 * re-authorization after a lost token returns none at all, which strands the
 * integration in a state no code change can leave. Forcing consent every time
 * costs the owner one extra tap and removes that state from the product.
 *
 * `state` is the CSRF control Google names for this flow, and it is the whole of
 * it: PKCE is documented for installed apps only and this is a web-server client
 * with a secret, so sending a code challenge would be claiming a guarantee the
 * page for this client type does not publish.
 */
export function authorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPE_PARAM);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', input.state);
  url.searchParams.set('include_granted_scopes', 'false');
  return url.toString();
}

/** The scopes an authorization URL actually carries, split back out. */
export function scopesOf(url: string): string[] {
  const scope = new URL(url).searchParams.get('scope') ?? '';
  return scope.split(' ').filter((entry) => entry !== '');
}

/** Step 5, the code exchange. Form encoded, five fields, nothing else. */
export function exchangeForm(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Record<string, string> {
  return {
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    grant_type: 'authorization_code',
    redirect_uri: input.redirectUri,
  };
}

/**
 * The refresh. Google's own sample body is `client_id`, `refresh_token` and
 * `grant_type`, plus the secret for a confidential client.
 *
 * WHAT DOES NOT COME BACK: a new refresh token. Google's refresh response has
 * no `refresh_token` field, so unlike Withings there is nothing to rotate and
 * the stored one is kept. Writing an empty string over it on every refresh is
 * the mirror-image bug and it is why this is stated here.
 */
export function refreshForm(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Record<string, string> {
  return {
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
    grant_type: 'refresh_token',
  };
}

export type TokenAnswer = {
  accessToken: string;
  /** Absent on a refresh, present on the first exchange under offline access. */
  refreshToken: string | null;
  expiresIn: number;
  scope: string;
  tokenType: string;
};

/** The token answer, or null when what came back is not one. */
export function readTokenAnswer(body: unknown): TokenAnswer | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const accessToken = record.access_token;
  const expiresIn = record.expires_in;
  const tokenType = record.token_type;
  if (typeof accessToken !== 'string' || accessToken === '') return null;
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn)) return null;
  if (typeof tokenType !== 'string' || tokenType === '') return null;
  return {
    accessToken,
    refreshToken: typeof record.refresh_token === 'string' ? record.refresh_token : null,
    expiresIn,
    scope: typeof record.scope === 'string' ? record.scope : '',
    tokenType,
  };
}

/**
 * What an OAuth error body means, as a token.
 *
 * `invalid_grant` is PERMANENT. Google's guidance is to authenticate the user
 * again, and the causes it publishes are revocation, six months of disuse, a
 * token limit and an expired time-based grant. None of them is fixed by asking
 * a second time, and retrying a dead grant burns quota while hiding the state
 * the owner has to act on.
 *
 * `deleted_client` and `invalid_client` need a human in the console rather than
 * a reconnect button, so they are told apart here rather than folded in.
 */
export type TokenErrorKind =
  | 'invalid_grant'
  | 'deleted_client'
  | 'invalid_client'
  | 'invalid_request'
  | 'unauthorized_client'
  | 'other';

export type TokenError = { kind: TokenErrorKind; raw: string; permanent: boolean };

const PERMANENT_KINDS: TokenErrorKind[] = ['invalid_grant', 'deleted_client', 'invalid_client'];

export function readTokenError(body: unknown, fallbackRaw = ''): TokenError {
  const raw = rawOf(body, fallbackRaw);
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const named = typeof record.error === 'string' ? record.error : '';
  const kind: TokenErrorKind =
    named === 'invalid_grant'
      ? 'invalid_grant'
      : named === 'deleted_client'
        ? 'deleted_client'
        : named === 'invalid_client'
          ? 'invalid_client'
          : named === 'invalid_request'
            ? 'invalid_request'
            : named === 'unauthorized_client'
              ? 'unauthorized_client'
              : 'other';
  return { kind, raw, permanent: PERMANENT_KINDS.includes(kind) };
}

/**
 * The error body as text, kept whole.
 *
 * F109 asks for the raw error body on the connection row, not a summary of it:
 * `invalid_grant` and `Token has been expired or revoked.` are two different
 * facts and the second is the one that tells the owner what happened.
 */
function rawOf(body: unknown, fallback: string): string {
  if (typeof body === 'string') return body;
  if (!body || typeof body !== 'object') return fallback;
  try {
    return JSON.stringify(body);
  } catch {
    return fallback;
  }
}

/**
 * ---------------------------------------------------------------------------
 * The five request paths, and the keyword none of them may contain.
 * ---------------------------------------------------------------------------
 *
 * `primary` is a legal calendar identifier on every one of these endpoints and
 * it means "the owner's own calendar". This product never writes there and
 * never reads events there: availability comes from `freeBusy.query`, which
 * answers with intervals and no titles, and every write targets the identifier
 * the app stored when it created its own calendar.
 *
 * So the builders below take the stored identifier as an argument and refuse an
 * empty one, `containsPrimary` reads a finished URL back, and
 * `tests/unit/google-paths.test.ts` walks every outbound URL the client can
 * produce and fails on the keyword. A rule enforced where the URL is built is
 * one refactor away from not being enforced; a rule enforced on the finished
 * string is the one that holds.
 */

/** The one calendar identifier this product will not accept from anywhere. */
export const PRIMARY_KEYWORD = 'primary';

export class MissingCalendarIdError extends Error {}
export class PrimaryCalendarRefused extends Error {}

function requireStoredCalendarId(calendarId: string): string {
  const trimmed = calendarId.trim();
  // A missing stored identifier beside a live grant is an ERROR STATE and never
  // a signal to create a second calendar. There is no lookup path back to an
  // app-created calendar under `calendar.app.created` alone, so a recreate
  // would leave the first one orphaned with the owner's history in it.
  if (trimmed === '') throw new MissingCalendarIdError(FAILURE.missingCalendarId);
  if (trimmed.toLowerCase() === PRIMARY_KEYWORD) throw new PrimaryCalendarRefused(FAILURE.primary);
  return trimmed;
}

/**
 * Failure text for a thrown Error, which is not product copy.
 *
 * These reach a log line and a route handler that answers with a catalogue
 * string. Nothing here is rendered: `src/lib/strings.ts` holds every word the
 * owner reads, and C6 is the most expensive line on this run.
 */
const FAILURE = {
  missingCalendarId: 'google_calendar: no stored app calendar id',
  primary: 'google_calendar: the primary keyword is refused',
} as const;

/** GET the owner's calendar list, for the picker. Read only, never for events. */
export function calendarListUrl(pageToken?: string): string {
  const url = new URL(`${CALENDAR_BASE}/users/me/calendarList`);
  url.searchParams.set('maxResults', '250');
  url.searchParams.set('showHidden', 'false');
  if (pageToken) url.searchParams.set('pageToken', pageToken);
  return url.toString();
}

/** POST the free-busy query. One request per window, every calendar in it. */
export function freeBusyUrl(): string {
  return `${CALENDAR_BASE}/freeBusy`;
}

/** Google's documented ceiling: 50 calendars in one expansion. */
export const CALENDAR_EXPANSION_MAX = 50;

export function freeBusyBody(input: {
  timeMin: string;
  timeMax: string;
  timeZone: string;
  calendarIds: string[];
}): Record<string, unknown> {
  return {
    timeMin: input.timeMin,
    timeMax: input.timeMax,
    timeZone: input.timeZone,
    calendarExpansionMax: CALENDAR_EXPANSION_MAX,
    items: input.calendarIds.slice(0, CALENDAR_EXPANSION_MAX).map((id) => ({ id })),
  };
}

/** POST a new secondary calendar. Once, on first connect, and never again. */
export function calendarsInsertUrl(): string {
  return `${CALENDAR_BASE}/calendars`;
}

/**
 * DELETE the calendar this app created, by the stored identifier.
 *
 * It exists so that the creation of the calendar has an undo like every other
 * write in the log. It cannot name any calendar but the stored one, and the
 * service refuses it while events this app wrote are still in there.
 */
export function calendarUrl(calendarId: string): string {
  const id = requireStoredCalendarId(calendarId);
  return `${CALENDAR_BASE}/calendars/${encodeURIComponent(id)}`;
}

/** POST an event into the stored app calendar. */
export function eventsInsertUrl(calendarId: string): string {
  const id = requireStoredCalendarId(calendarId);
  const url = new URL(`${CALENDAR_BASE}/calendars/${encodeURIComponent(id)}/events`);
  // No guests on a workout block, so no notification traffic either.
  url.searchParams.set('sendUpdates', 'none');
  return url.toString();
}

/** PUT one event in the stored app calendar, by its deterministic identifier. */
export function eventUrl(calendarId: string, eventId: string): string {
  const id = requireStoredCalendarId(calendarId);
  const url = new URL(
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`,
  );
  url.searchParams.set('sendUpdates', 'none');
  return url.toString();
}

/**
 * GET the events in the stored app calendar over a window.
 *
 * This is the ONLY `events.list` this product issues and it names the app's own
 * calendar. Availability on every other calendar comes from `freeBusy.query`,
 * which is what keeps the grant narrow: `calendar.app.created` cannot read
 * anybody else's events, so there is no wider request to accidentally send.
 */
export function eventsListUrl(
  calendarId: string,
  input: { timeMin: string; timeMax: string; pageToken?: string },
): string {
  const id = requireStoredCalendarId(calendarId);
  const url = new URL(`${CALENDAR_BASE}/calendars/${encodeURIComponent(id)}/events`);
  url.searchParams.set('timeMin', input.timeMin);
  url.searchParams.set('timeMax', input.timeMax);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '250');
  if (input.pageToken) url.searchParams.set('pageToken', input.pageToken);
  return url.toString();
}

/**
 * Does a finished URL name the owner's primary calendar.
 *
 * It reads the path segments rather than searching the string, so a calendar
 * whose identifier legitimately contains the word (an address at a domain like
 * `primary.example.com`) is not a false positive, and `/calendars/primary/`
 * cannot hide inside an encoded segment either.
 */
export function containsPrimary(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url.includes(`/${PRIMARY_KEYWORD}`);
  }
  const segments = parsed.pathname.split('/').map((segment) => decodeURIComponent(segment));
  return segments.some((segment) => segment.toLowerCase() === PRIMARY_KEYWORD);
}

/** Every scope this request family needs, so a caller can assert the pair. */
export function requiredScopes(): readonly string[] {
  return GOOGLE_SCOPES;
}
