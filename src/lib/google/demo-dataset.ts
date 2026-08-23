import type { Transport, TransportAnswer, TransportRequest } from '@/lib/google/client';
import { TOKEN_URL } from '@/lib/google/protocol';
import { SCOPE_PARAM } from '@/lib/google/scopes';
import { instantOnDay, localDayKey, weekdayIndex } from '@/lib/local-time';
import { strings } from '@/lib/strings';

/**
 * The demonstration account: three calendars, a week of real commitments, and a
 * dedicated calendar that events actually land in, answered through the same
 * transport the real API answers through.
 *
 * WHY THIS IS NOT A STUB. F101 asks that the WHOLE flow completes with no client
 * identifier: picker, busy periods, dedicated calendar, diff and write. So this
 * has to exercise the parts a stub would skip. It answers the token endpoint, it
 * pages nothing but returns real shapes, it holds a calendar the owner has been
 * unshared from so the per-calendar `errors` branch has something to surface,
 * and its events persist in this machine's own database, so the event count
 * before and after a second apply is a count of something and undo has something
 * to take back out.
 *
 * EVERY EVENT IT HOLDS IS MARKED. `extendedProperties.private.vernierMode` reads
 * `demonstration` on every event written through this transport, which is a fact
 * readable off the stored calendar rather than a badge the screen chooses to
 * draw.
 */

/** The mode stamped on every event this transport accepts. */
export const DEMONSTRATION_MODE = 'demonstration';

/** The calendar the demonstration creates, and the id it hands back for it. */
export const DEMO_APP_CALENDAR_ID = 'vernier-training@group.demonstration.vernier';

export const DEMO_PRIMARY_ID = 'owner@demonstration.vernier';
export const DEMO_FAMILY_ID = 'family@demonstration.vernier';
/** Shared once, unshared since. It answers freeBusy with an error and no busy list. */
export const DEMO_UNSHARED_ID = 'team@demonstration.vernier';

export const DEMO_ACCESS_TOKEN = 'demonstration-access-token';
/**
 * The scheme the demonstration names, and it is deliberately not `Bearer`.
 *
 * `src/lib/withings/demo-dataset.ts` answers `demo-bearer` for the same reason:
 * the client is required to present the scheme the server named rather than a
 * constant, so a fixture that named the real one would let a hard-coded
 * `Bearer` pass unnoticed. It also means nothing in a demonstration run reads
 * like a real credential.
 */
export const DEMO_TOKEN_TYPE = 'demonstration-bearer';
export const DEMO_REFRESH_TOKEN = 'demonstration-refresh-token';
/** The one refresh token the demonstration answers `invalid_grant` for. */
export const DEMO_REVOKED_REFRESH_TOKEN = 'demonstration-revoked-refresh-token';

export type DemoEvent = {
  id: string;
  sessionId: string | null;
  summary: string;
  description: string;
  start: string;
  end: string;
  mode: string;
};

/**
 * Where the demonstration calendar's events live between requests.
 *
 * They are in this machine's database rather than in module memory, because a
 * calendar that forgot its events when the process restarted could not answer
 * "the event count is identical before and after the second apply", and that is
 * the whole of F106.
 */
export type DemoStore = {
  readEvents: () => Promise<DemoEvent[]>;
  putEvent: (event: DemoEvent) => Promise<void>;
  removeEvent: (id: string) => Promise<boolean>;
};

export type DemoOptions = {
  timeZone: string;
  /** Which refresh token the fixture treats as revoked, for the invalid_grant path. */
  revokedRefreshToken?: string;
  /**
   * What the recorded Google is doing wrong, if anything.
   *
   * `outage` answers every calendar call with status 0 and no body, which is
   * exactly what `networkTransport` returns when a socket never opens, so what
   * runs above this line is the real unreachable path rather than a second one
   * written for a demonstration. The token endpoint still answers, because a
   * provider that cannot be reached and a grant that has been refused are
   * different states and the screens say different things about them.
   *
   * `revoked` answers every refresh with `invalid_grant` and every calendar call
   * with 401, which is the shape of a grant the owner revoked in his Google
   * account: the access token stops working and the refresh cannot renew it.
   */
  fault?: 'none' | 'outage' | 'revoked';
};

type Busy = { calendarId: string; start: string; end: string };

/**
 * The owner's week, as the demonstration account holds it.
 *
 * Working hours on the primary calendar, a long Thursday evening that the
 * design sheet's own example names, and a Saturday morning on the family
 * calendar. The Thursday block is what makes a session placed at 18:45 come back
 * as a move with a cause in plain words instead of a silent collision.
 */
const WEEK: Array<{ weekday: number; calendarId: string; from: [number, number]; to: [number, number] }> = [
  { weekday: 0, calendarId: DEMO_PRIMARY_ID, from: [9, 0], to: [12, 30] },
  { weekday: 0, calendarId: DEMO_PRIMARY_ID, from: [14, 0], to: [18, 0] },
  { weekday: 1, calendarId: DEMO_PRIMARY_ID, from: [9, 0], to: [12, 30] },
  { weekday: 1, calendarId: DEMO_PRIMARY_ID, from: [14, 0], to: [18, 0] },
  { weekday: 2, calendarId: DEMO_PRIMARY_ID, from: [9, 0], to: [12, 30] },
  { weekday: 2, calendarId: DEMO_PRIMARY_ID, from: [14, 0], to: [18, 0] },
  { weekday: 3, calendarId: DEMO_PRIMARY_ID, from: [9, 0], to: [12, 30] },
  { weekday: 3, calendarId: DEMO_PRIMARY_ID, from: [14, 0], to: [18, 0] },
  // Thursday evening, 18:00 to 23:00. The one the confirm diff quotes.
  { weekday: 3, calendarId: DEMO_PRIMARY_ID, from: [18, 0], to: [23, 0] },
  { weekday: 4, calendarId: DEMO_PRIMARY_ID, from: [9, 0], to: [12, 30] },
  { weekday: 4, calendarId: DEMO_PRIMARY_ID, from: [14, 0], to: [18, 0] },
  { weekday: 5, calendarId: DEMO_FAMILY_ID, from: [10, 0], to: [13, 0] },
];

export function demoBusy(
  timeMin: string,
  timeMax: string,
  calendarIds: string[],
  timeZone: string,
): Busy[] {
  const from = new Date(timeMin);
  const to = new Date(timeMax);
  const wanted = new Set(calendarIds);
  const busy: Busy[] = [];

  let dayKey = localDayKey(from, timeZone);
  const lastKey = localDayKey(to, timeZone);
  // Bounded: the plan window is at most a fortnight, and this stops at 30 days
  // whatever it is handed, so a bad window cannot spin here.
  for (let day = 0; day < 30; day += 1) {
    const noon = new Date(`${dayKey}T12:00:00Z`);
    const weekday = weekdayIndex(noon, timeZone);
    for (const block of WEEK) {
      if (block.weekday !== weekday) continue;
      if (!wanted.has(block.calendarId)) continue;
      const start = instantOnDay(dayKey, block.from[0], block.from[1], timeZone);
      const end = instantOnDay(dayKey, block.to[0], block.to[1], timeZone);
      if (end <= from || start >= to) continue;
      busy.push({
        calendarId: block.calendarId,
        start: start.toISOString(),
        end: end.toISOString(),
      });
    }
    if (dayKey === lastKey) break;
    dayKey = new Date(Date.parse(`${dayKey}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  }

  return busy;
}

/** The picker's three rows, exactly as `calendarList.list` shapes them. */
export function demoCalendarList(): Record<string, unknown> {
  return {
    kind: 'calendar#calendarList',
    items: [
      {
        id: DEMO_PRIMARY_ID,
        summary: strings.calendar.demo.primary,
        primary: true,
        accessRole: 'owner',
        selected: true,
      },
      {
        id: DEMO_FAMILY_ID,
        summary: strings.calendar.demo.family,
        accessRole: 'reader',
        selected: true,
      },
      {
        id: DEMO_UNSHARED_ID,
        summary: strings.calendar.demo.unshared,
        accessRole: 'freeBusyReader',
        selected: true,
      },
    ],
  };
}

/**
 * The transport, with the store behind it.
 *
 * Everything a real Google would decide is decided here off the request: the
 * method, the path and the body. Nothing above this line knows which one it is
 * talking to.
 */
export function demoTransport(store: DemoStore, options: DemoOptions): Transport {
  const revoked = options.revokedRefreshToken ?? DEMO_REVOKED_REFRESH_TOKEN;
  const fault = options.fault ?? 'none';

  return async (request: TransportRequest): Promise<TransportAnswer> => {
    if (request.url === TOKEN_URL) {
      if (fault === 'revoked' && (request.form ?? {}).grant_type === 'refresh_token') {
        return {
          status: 400,
          body: {
            error: 'invalid_grant',
            error_description: strings.calendar.demo.revokedDescription,
          },
        };
      }
      return token(request, revoked);
    }

    // The socket never opened. The same answer `networkTransport` gives.
    if (fault === 'outage') return { status: 0, body: null };
    // The grant is dead, so the access token is refused and the refresh above
    // cannot renew it. One refresh, one refusal, and the client stops.
    if (fault === 'revoked') {
      return { status: 401, body: { error: { code: 401, message: 'Invalid Credentials' } } };
    }

    const url = new URL(request.url);
    const path = url.pathname.replace('/calendar/v3', '');

    if (request.method === 'GET' && path === '/users/me/calendarList') {
      return { status: 200, body: demoCalendarList() };
    }

    if (request.method === 'POST' && path === '/freeBusy') {
      return freeBusy(request, options.timeZone);
    }

    if (request.method === 'POST' && path === '/calendars') {
      const body = (request.json ?? {}) as Record<string, unknown>;
      return {
        status: 200,
        body: {
          kind: 'calendar#calendar',
          id: DEMO_APP_CALENDAR_ID,
          summary: body.summary,
          description: body.description,
          timeZone: body.timeZone,
        },
      };
    }

    const events = path.match(/^\/calendars\/([^/]+)\/events$/);
    if (events) {
      if (request.method === 'GET') return listEvents(store, url);
      if (request.method === 'POST') return insertEvent(store, request);
    }

    const one = path.match(/^\/calendars\/([^/]+)\/events\/([^/]+)$/);
    if (one) {
      const eventId = decodeURIComponent(one[2]);
      if (request.method === 'PUT') return updateEvent(store, request, eventId);
      if (request.method === 'DELETE') return deleteEvent(store, eventId);
    }

    return { status: 404, body: { error: { code: 404, errors: [{ reason: 'notFound' }] } } };
  };
}

function token(request: TransportRequest, revoked: string): TransportAnswer {
  const form = request.form ?? {};
  if (form.grant_type === 'refresh_token' && form.refresh_token === revoked) {
    // The exact shape Google answers a dead grant with, including the
    // description, because F109 stores the raw body and the description is the
    // half of it that tells the owner what happened.
    return {
      status: 400,
      body: {
        error: 'invalid_grant',
        error_description: strings.calendar.demo.revokedDescription,
      },
    };
  }
  return {
    status: 200,
    body: {
      access_token: DEMO_ACCESS_TOKEN,
      // Only the first exchange carries one, exactly as Google documents.
      ...(form.grant_type === 'authorization_code' ? { refresh_token: DEMO_REFRESH_TOKEN } : {}),
      expires_in: 3599,
      scope: SCOPE_PARAM,
      token_type: DEMO_TOKEN_TYPE,
    },
  };
}

function freeBusy(request: TransportRequest, timeZone: string): TransportAnswer {
  const body = (request.json ?? {}) as Record<string, unknown>;
  const timeMin = String(body.timeMin ?? new Date().toISOString());
  const timeMax = String(body.timeMax ?? new Date().toISOString());
  const items = Array.isArray(body.items) ? body.items : [];
  const ids = items
    .map((item) => (item ?? {}) as Record<string, unknown>)
    .map((item) => String(item.id ?? ''))
    .filter((id) => id !== '');

  const busy = demoBusy(timeMin, timeMax, ids, timeZone);
  const calendars: Record<string, unknown> = {};
  for (const id of ids) {
    if (id === DEMO_UNSHARED_ID) {
      // AN EMPTY BUSY LIST BESIDE AN ERROR, which is what a calendar the owner
      // has been unshared from really answers. A reader that ignores `errors`
      // calls this calendar free and schedules over a real meeting.
      calendars[id] = { errors: [{ domain: 'global', reason: 'notFound' }], busy: [] };
      continue;
    }
    calendars[id] = { busy: busy.filter((entry) => entry.calendarId === id).map(({ start, end }) => ({ start, end })) };
  }

  return {
    status: 200,
    body: { kind: 'calendar#freeBusy', timeMin, timeMax, calendars },
  };
}

async function listEvents(store: DemoStore, url: URL): Promise<TransportAnswer> {
  const timeMin = Date.parse(url.searchParams.get('timeMin') ?? '');
  const timeMax = Date.parse(url.searchParams.get('timeMax') ?? '');
  const events = await store.readEvents();
  const items = events
    .filter((event) => {
      if (Number.isNaN(timeMin) || Number.isNaN(timeMax)) return true;
      // Google's own semantics: timeMin bounds the end, timeMax bounds the start.
      return Date.parse(event.end) > timeMin && Date.parse(event.start) < timeMax;
    })
    .sort((left, right) => Date.parse(left.start) - Date.parse(right.start))
    .map(toResource);
  return { status: 200, body: { kind: 'calendar#events', items } };
}

async function insertEvent(store: DemoStore, request: TransportRequest): Promise<TransportAnswer> {
  const body = (request.json ?? {}) as Record<string, unknown>;
  const event = fromBody(body);
  if (!event) return { status: 400, body: { error: { code: 400, errors: [{ reason: 'required' }] } } };

  const existing = await store.readEvents();
  if (existing.some((entry) => entry.id === event.id)) {
    // The deterministic id doing its job: a second apply of the same plan is
    // refused as a duplicate rather than landing a second workout.
    return { status: 409, body: { error: { code: 409, errors: [{ reason: 'duplicate' }] } } };
  }

  await store.putEvent(event);
  return { status: 200, body: toResource(event) };
}

async function updateEvent(
  store: DemoStore,
  request: TransportRequest,
  eventId: string,
): Promise<TransportAnswer> {
  const body = (request.json ?? {}) as Record<string, unknown>;
  const event = fromBody({ ...body, id: eventId });
  if (!event) return { status: 400, body: { error: { code: 400, errors: [{ reason: 'required' }] } } };
  await store.putEvent(event);
  return { status: 200, body: toResource(event) };
}

async function deleteEvent(store: DemoStore, eventId: string): Promise<TransportAnswer> {
  const removed = await store.removeEvent(eventId);
  if (!removed) return { status: 410, body: { error: { code: 410, errors: [{ reason: 'deleted' }] } } };
  return { status: 204, body: null };
}

function fromBody(body: Record<string, unknown>): DemoEvent | null {
  const id = typeof body.id === 'string' ? body.id : '';
  const start = (body.start ?? {}) as Record<string, unknown>;
  const end = (body.end ?? {}) as Record<string, unknown>;
  if (id === '' || typeof start.dateTime !== 'string' || typeof end.dateTime !== 'string') return null;
  const extended = (body.extendedProperties ?? {}) as Record<string, unknown>;
  const priv = (extended.private ?? {}) as Record<string, unknown>;
  return {
    id,
    sessionId: typeof priv.vernierSessionId === 'string' ? priv.vernierSessionId : null,
    summary: typeof body.summary === 'string' ? body.summary : '',
    description: typeof body.description === 'string' ? body.description : '',
    start: new Date(start.dateTime).toISOString(),
    end: new Date(end.dateTime).toISOString(),
    // Whatever the caller stamped, the demonstration transport records that it
    // was this one that stored it. An event in this fixture is a demonstration
    // event, and that is readable off the row.
    mode: DEMONSTRATION_MODE,
  };
}

function toResource(event: DemoEvent): Record<string, unknown> {
  return {
    kind: 'calendar#event',
    id: event.id,
    status: 'confirmed',
    summary: event.summary,
    description: event.description,
    start: { dateTime: event.start },
    end: { dateTime: event.end },
    extendedProperties: {
      private: { vernierSessionId: event.sessionId ?? '', vernierMode: event.mode },
    },
  };
}
