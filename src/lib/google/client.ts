import { randomBytes, createHash } from 'node:crypto';
import {
  type TokenError,
  TOKEN_URL,
  calendarListUrl,
  containsPrimary,
  eventsListUrl,
  exchangeForm,
  freeBusyBody,
  freeBusyUrl,
  readTokenAnswer,
  readTokenError,
  refreshForm,
} from '@/lib/google/protocol';
import { type FreeBusyReading, readFreeBusy } from '@/lib/google/availability';

/**
 * The adapter, and the one door every request to Google goes through.
 *
 * WHAT THE TRANSPORT IS ALLOWED TO BE. The real network, or the recorded
 * dataset with no client identifier and no socket. Both arrive through the same
 * argument, so demonstration mode is not a second code path with a second set of
 * bugs: it is this path with a different answer, exactly as slice 5 built it for
 * Withings.
 *
 * THE WRITE GUARD IS IN `callGoogle` AND NOWHERE ELSE. A request declares itself
 * a read or a write. A write carries a confirmation, and a confirmation is
 * minted in exactly two places: `confirmSelected`, from a stored plan the owner
 * ticked and applied, and `confirmUndo`, from a stored write log row he pressed
 * Undo on. `callGoogle` refuses a write without one BEFORE it touches the
 * transport, so "nothing writes before the diff is confirmed" is the shape of
 * the function rather than a rule five call sites remember to follow. Drive any
 * write site with the confirmation skipped and the transport is never called at
 * all, which is what `tests/unit/google-write-sites.test.ts` asserts, one site
 * at a time, printing the enumeration it walked.
 */

export type TransportRequest = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  /** JSON body, for the calendar API. */
  json?: unknown;
  /** Form body, for the token endpoint, which takes no JSON. */
  form?: Record<string, string>;
  authorization?: string;
};

export type TransportAnswer = {
  status: number;
  body: unknown;
};

export type Transport = (request: TransportRequest) => Promise<TransportAnswer>;

export type TokenBundle = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope: string;
  tokenType: string;
};

/** One request, kept so a test and the plan record can read what was sent. */
export type RequestLine = {
  method: string;
  url: string;
  status: number;
  kind: 'read' | 'write' | 'token';
};

export type ClientPorts = {
  transport: Transport;
  credentials: { clientId: string; clientSecret: string; redirectUri: string };
  readTokens: () => Promise<TokenBundle | null>;
  /** Persists the bundle. Called before any handler that obtained one returns. */
  storeTokens: (next: TokenBundle) => Promise<void>;
  /** invalid_grant and its two siblings. Called once, and the caller never retries. */
  onPermanentFailure: (error: TokenError) => Promise<void>;
  now: () => Date;
  record?: (line: RequestLine) => void;
};

/**
 * ---------------------------------------------------------------------------
 * The confirmation.
 * ---------------------------------------------------------------------------
 *
 * A value that says: this exact plan row was on the confirm screen, it was
 * ticked, and the owner pressed Apply. It cannot be written by hand, because the
 * proof is a digest over a secret this module generates at load and never
 * exports. A handler that wants to write to a calendar has to go through the
 * confirm path to get one, which is F110 stated as code rather than as a
 * convention.
 */
const CONFIRM_SECRET = randomBytes(32).toString('hex');

export type Confirmation = {
  planId: string;
  rowId: string;
  confirmedAt: Date;
  proof: string;
};

/** The plan the confirmation is minted from: open, stored, with the ticked rows on it. */
export type ConfirmablePlan = {
  id: string;
  state: string;
  rowIds: string[];
};

export class ConfirmSkipped extends Error {}

function proofFor(planId: string, rowId: string): string {
  return createHash('sha256').update(`${CONFIRM_SECRET}:${planId}:${rowId}`).digest('hex');
}

/**
 * Mint one confirmation per ticked row, or none at all.
 *
 * It refuses a plan that is not open, so a second Apply on a plan already
 * applied writes nothing, and it refuses a row identifier that is not on the
 * plan, so a request naming a row the screen never drew writes nothing either.
 */
export function confirmSelected(
  plan: ConfirmablePlan,
  rowIds: string[],
  now: Date,
): Confirmation[] {
  if (plan.state !== 'open') return [];
  const known = new Set(plan.rowIds);
  return rowIds
    .filter((rowId) => known.has(rowId))
    .map((rowId) => ({
      planId: plan.id,
      rowId,
      confirmedAt: now,
      proof: proofFor(plan.id, rowId),
    }));
}

/**
 * The second and last way a confirmation is minted: an undo.
 *
 * An undo is a confirmation of its own. The owner is looking at a stored write
 * log row, which is a record of something that really happened, and he presses
 * Undo on that line. So the proof is taken over the stored write rather than
 * over a plan row, and the two mints are the whole set: `confirmSelected` and
 * this. Nothing else in this repository can produce the value `callGoogle`
 * demands, which is what makes F110 a property of the code.
 *
 * It refuses a write that failed, because there is nothing to reverse, and a
 * write that has already been undone, because reversing it twice would be a
 * write the owner confirmed once.
 */
export type UndoableWrite = {
  id: string;
  outcome: string;
  undoneByWriteId: string | null;
};

export function confirmUndo(write: UndoableWrite, now: Date): Confirmation | null {
  if (write.outcome !== 'written') return null;
  if (write.undoneByWriteId !== null) return null;
  const planId = `undo:${write.id}`;
  return { planId, rowId: write.id, confirmedAt: now, proof: proofFor(planId, write.id) };
}

export function isConfirmed(confirmation: Confirmation | null | undefined): boolean {
  if (!confirmation) return false;
  if (typeof confirmation.proof !== 'string' || confirmation.proof === '') return false;
  return confirmation.proof === proofFor(confirmation.planId, confirmation.rowId);
}

export type GoogleRequest =
  | { kind: 'read'; method: 'GET' | 'POST'; url: string; json?: unknown }
  | {
      kind: 'write';
      method: 'POST' | 'PUT' | 'DELETE';
      url: string;
      json?: unknown;
      confirmation: Confirmation | null;
    };

export type GoogleAnswer =
  | { outcome: 'ok'; status: number; body: unknown }
  | { outcome: 'not_connected' }
  | { outcome: 'disconnected'; error: TokenError }
  | { outcome: 'failed'; status: number; body: unknown };

/** How long before the stated expiry the access token is refreshed anyway. */
export const REFRESH_MARGIN_MS = 60_000;

export function accessTokenIsStale(expiresAt: string, now: Date): boolean {
  const at = Date.parse(expiresAt);
  if (Number.isNaN(at)) return true;
  return at - now.getTime() <= REFRESH_MARGIN_MS;
}

/**
 * Exchange the authorization code.
 *
 * The refresh token that comes back is PERSISTED BEFORE THIS RETURNS, through
 * `ports.storeTokens`, because Google returns one only on the first
 * authorization and there is no second copy anywhere. A handler that stored it
 * after answering would lose it to any crash between the two, and recovering
 * needs a fresh consent from the owner.
 */
export async function exchangeCode(
  ports: ClientPorts,
  code: string,
): Promise<
  | { outcome: 'connected'; bundle: TokenBundle }
  | { outcome: 'no_refresh_token' }
  | { outcome: 'refused'; error: TokenError }
> {
  const answer = await ports.transport({
    method: 'POST',
    url: TOKEN_URL,
    form: exchangeForm({
      clientId: ports.credentials.clientId,
      clientSecret: ports.credentials.clientSecret,
      code,
      redirectUri: ports.credentials.redirectUri,
    }),
  });
  ports.record?.({ method: 'POST', url: TOKEN_URL, status: answer.status, kind: 'token' });

  const token = readTokenAnswer(answer.body);
  if (!token) return { outcome: 'refused', error: readTokenError(answer.body) };
  if (!token.refreshToken) {
    // Offline access was asked for and consent was forced, so this should not
    // happen. It is still answered rather than assumed: a connection with no
    // refresh token works until the access token expires and then dies
    // silently, which is the failure mode this whole flow exists to avoid.
    return { outcome: 'no_refresh_token' };
  }

  const bundle: TokenBundle = {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: new Date(ports.now().getTime() + token.expiresIn * 1000).toISOString(),
    scope: token.scope,
    tokenType: token.tokenType,
  };
  await ports.storeTokens(bundle);
  return { outcome: 'connected', bundle };
}

/**
 * The refresh, and the one place `invalid_grant` is decided.
 *
 * It is permanent. Not retried, not backed off into, not queued: the stored
 * token is deleted, the integration is disconnected with the raw body, and the
 * owner is offered one reconnect. Retrying a dead grant burns quota and hides
 * the state he has to act on, which is Google's own guidance read the way a
 * client should read it.
 */
async function refreshAccessToken(
  ports: ClientPorts,
  current: TokenBundle,
): Promise<{ bundle: TokenBundle } | { failure: TokenError }> {
  const answer = await ports.transport({
    method: 'POST',
    url: TOKEN_URL,
    form: refreshForm({
      clientId: ports.credentials.clientId,
      clientSecret: ports.credentials.clientSecret,
      refreshToken: current.refreshToken,
    }),
  });
  ports.record?.({ method: 'POST', url: TOKEN_URL, status: answer.status, kind: 'token' });

  const token = readTokenAnswer(answer.body);
  if (!token) {
    const error = readTokenError(answer.body);
    if (error.permanent) await ports.onPermanentFailure(error);
    return { failure: error };
  }

  // Google's refresh answer carries no new refresh token. The stored one is
  // kept: writing an empty string over it here is the mirror image of slice 5's
  // rotation bug and it would take the connection down with no way back.
  const bundle: TokenBundle = {
    accessToken: token.accessToken,
    refreshToken: current.refreshToken,
    expiresAt: new Date(ports.now().getTime() + token.expiresIn * 1000).toISOString(),
    scope: token.scope || current.scope,
    tokenType: token.tokenType,
  };
  await ports.storeTokens(bundle);
  return { bundle };
}

/**
 * One call to the Calendar API, with the guard in front of it.
 *
 * Order matters and it is the order below. The confirmation is checked FIRST,
 * before the token is read, before the URL is looked at and long before the
 * transport is touched, so a write with the confirm step skipped cannot reach
 * the network even if every other part of the request is perfect.
 */
export async function callGoogle(
  ports: ClientPorts,
  request: GoogleRequest,
): Promise<GoogleAnswer> {
  if (request.kind === 'write' && !isConfirmed(request.confirmation)) {
    throw new ConfirmSkipped(REFUSAL.unconfirmed);
  }
  if (containsPrimary(request.url)) {
    throw new ConfirmSkipped(REFUSAL.primary);
  }

  let tokens = await ports.readTokens();
  if (!tokens) return { outcome: 'not_connected' };

  if (accessTokenIsStale(tokens.expiresAt, ports.now())) {
    const refreshed = await refreshAccessToken(ports, tokens);
    if ('failure' in refreshed) {
      if (refreshed.failure.permanent) return { outcome: 'disconnected', error: refreshed.failure };
      return { outcome: 'failed', status: 0, body: refreshed.failure.raw };
    }
    tokens = refreshed.bundle;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const answer = await ports.transport({
      method: request.method,
      url: request.url,
      json: request.json,
      authorization: `${tokens.tokenType} ${tokens.accessToken}`,
    });
    ports.record?.({
      method: request.method,
      url: request.url,
      status: answer.status,
      kind: request.kind,
    });

    if (answer.status >= 200 && answer.status < 300) {
      return { outcome: 'ok', status: answer.status, body: answer.body };
    }

    // 401 means the access token expired or was invalidated. Refresh once, and
    // only the refresh failing with invalid_grant means disconnect. That is the
    // errors guide read exactly: one refresh, one retry, then an honest answer.
    if (answer.status === 401 && attempt === 0) {
      const refreshed = await refreshAccessToken(ports, tokens);
      if ('failure' in refreshed) {
        if (refreshed.failure.permanent) return { outcome: 'disconnected', error: refreshed.failure };
        return { outcome: 'failed', status: answer.status, body: answer.body };
      }
      tokens = refreshed.bundle;
      continue;
    }

    return { outcome: 'failed', status: answer.status, body: answer.body };
  }

  return { outcome: 'failed', status: 401, body: null };
}

/** Thrown text, never rendered. Every word the owner reads is in the catalogue. */
const REFUSAL = {
  unconfirmed: 'google_calendar: a write reached the transport with no confirmation',
  primary: 'google_calendar: a request named the primary calendar',
} as const;

/**
 * ---------------------------------------------------------------------------
 * The reads. Three, and not one of them looks at anybody else's events.
 * ---------------------------------------------------------------------------
 */

export type CalendarChoice = {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
  selected: boolean;
};

/** The picker. `calendar.calendarlist.readonly`, the narrowest scope that returns ids. */
export async function listCalendars(
  ports: ClientPorts,
): Promise<{ outcome: GoogleAnswer['outcome']; calendars: CalendarChoice[]; answer: GoogleAnswer }> {
  const answer = await callGoogle(ports, { kind: 'read', method: 'GET', url: calendarListUrl() });
  if (answer.outcome !== 'ok') return { outcome: answer.outcome, calendars: [], answer };

  const body = (answer.body ?? {}) as Record<string, unknown>;
  const items = Array.isArray(body.items) ? body.items : [];
  const calendars = items
    .map((item) => (item ?? {}) as Record<string, unknown>)
    .filter((item) => typeof item.id === 'string')
    .map((item) => ({
      id: String(item.id),
      summary: typeof item.summary === 'string' ? item.summary : String(item.id),
      primary: item.primary === true,
      accessRole: typeof item.accessRole === 'string' ? item.accessRole : '',
      selected: item.selected === true,
    }));
  return { outcome: 'ok', calendars, answer };
}

/** Availability. One request per window, every chosen calendar inside it. */
export async function queryFreeBusy(
  ports: ClientPorts,
  input: { timeMin: string; timeMax: string; timeZone: string; calendarIds: string[] },
): Promise<{ outcome: GoogleAnswer['outcome']; reading: FreeBusyReading; answer: GoogleAnswer }> {
  const answer = await callGoogle(ports, {
    kind: 'read',
    method: 'POST',
    url: freeBusyUrl(),
    json: freeBusyBody(input),
  });
  if (answer.outcome !== 'ok') {
    return { outcome: answer.outcome, reading: { busy: [], failures: [], answeredFor: [] }, answer };
  }
  return { outcome: 'ok', reading: readFreeBusy(answer.body), answer };
}

export type FetchedEvent = {
  id: string;
  sessionId: string | null;
  title: string;
  start: Date;
  end: Date;
};

/**
 * The events in the app's own calendar, and only there.
 *
 * `eventsListUrl` refuses an empty identifier and refuses the primary keyword,
 * so there is no argument this function can be handed that reads the owner's own
 * calendar. Availability everywhere else is `freeBusy.query`, which answers with
 * intervals and no titles.
 */
export async function listAppEvents(
  ports: ClientPorts,
  input: { calendarId: string; timeMin: string; timeMax: string },
): Promise<{ outcome: GoogleAnswer['outcome']; events: FetchedEvent[]; answer: GoogleAnswer }> {
  const events: FetchedEvent[] = [];
  let pageToken: string | undefined;
  let answer: GoogleAnswer = { outcome: 'ok', status: 200, body: null };

  // Bounded: at most ten pages of 250, which is more events than a calendar
  // this app writes could hold in a decade of weeks.
  for (let page = 0; page < 10; page += 1) {
    answer = await callGoogle(ports, {
      kind: 'read',
      method: 'GET',
      url: eventsListUrl(input.calendarId, {
        timeMin: input.timeMin,
        timeMax: input.timeMax,
        pageToken,
      }),
    });
    if (answer.outcome !== 'ok') return { outcome: answer.outcome, events, answer };

    const body = (answer.body ?? {}) as Record<string, unknown>;
    const items = Array.isArray(body.items) ? body.items : [];
    for (const item of items) {
      const event = readEvent(item);
      if (event) events.push(event);
    }
    const next = body.nextPageToken;
    if (typeof next !== 'string' || next === '') break;
    pageToken = next;
  }

  return { outcome: 'ok', events, answer };
}

export function readEvent(raw: unknown): FetchedEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.id !== 'string') return null;
  if (item.status === 'cancelled') return null;
  const start = timeOf(item.start);
  const end = timeOf(item.end);
  if (!start || !end) return null;
  const extended = (item.extendedProperties ?? {}) as Record<string, unknown>;
  const priv = (extended.private ?? {}) as Record<string, unknown>;
  return {
    id: item.id,
    sessionId: typeof priv.vernierSessionId === 'string' ? priv.vernierSessionId : null,
    title: typeof item.summary === 'string' ? item.summary : '',
    start,
    end,
  };
}

function timeOf(raw: unknown): Date | null {
  if (!raw || typeof raw !== 'object') return null;
  const shape = raw as Record<string, unknown>;
  const value = typeof shape.dateTime === 'string' ? shape.dateTime : null;
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
