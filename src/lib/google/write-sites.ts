import {
  type ClientPorts,
  type Confirmation,
  type GoogleAnswer,
  callGoogle,
} from '@/lib/google/client';
import {
  calendarsInsertUrl,
  eventUrl,
  eventsInsertUrl,
} from '@/lib/google/protocol';

/**
 * EVERY OUTBOUND WRITE THIS PRODUCT CAN MAKE, IN ONE FILE, ENUMERATED.
 *
 * F110 and C14 are one risk stated twice: an event appearing in the owner's
 * calendar that he never approved. The control is that there are exactly four
 * places a request with a side effect leaves this machine, they are all here,
 * every one of them goes through `callGoogle` with `kind: 'write'`, and
 * `callGoogle` refuses a write with no confirmation before it touches the
 * transport. Drive any of them with the confirm step skipped and the network is
 * never reached.
 *
 * The enumeration is a value rather than a comment, so a test can walk it,
 * drive each entry, and print what it walked. A test over an empty set of call
 * sites proves nothing, so `tests/unit/google-write-sites.test.ts` asserts the
 * set is the size this file declares AND that no other module in `src/` builds a
 * write request, which is what makes the list complete rather than merely
 * accurate.
 *
 * ADDING A FIFTH WRITE MEANS ADDING IT HERE. There is nowhere else it can go:
 * the three URL builders it would need are exported from `protocol.ts` and used
 * nowhere but this file, and the confirmation type it would need is minted by
 * one function in `client.ts`.
 */

export type WriteSiteId =
  | 'calendars.insert'
  | 'events.insert'
  | 'events.update'
  | 'events.delete';

export type WriteInput = {
  /** The stored app-created calendar. Empty is refused by the URL builders. */
  calendarId: string;
  eventId: string;
  sessionId: string;
  /** Copy, rendered by the caller from the catalogue. Nothing here writes words. */
  summary: string;
  description: string;
  start: Date;
  end: Date;
  timeZone: string;
  /** Demonstration or live, stamped on the event so its origin is readable. */
  mode: string;
};

export type WriteSite = {
  id: WriteSiteId;
  method: 'POST' | 'PUT' | 'DELETE';
  run: (
    ports: ClientPorts,
    confirmation: Confirmation | null,
    input: WriteInput,
  ) => Promise<GoogleAnswer>;
};

/** The schema version stamped on every event, so a later reader knows the shape. */
export const EVENT_SCHEMA = 'vernier.event.v1';

/**
 * The event body.
 *
 * `id` is the deterministic one, so a repeated insert is the same event rather
 * than a second one. `extendedProperties.private` carries the planned session
 * and the mode, which is how the diff knows which event belongs to which session
 * after a restart and how a demonstration event is told from a real one by
 * reading the calendar rather than by trusting a badge.
 */
export function eventBody(input: WriteInput): Record<string, unknown> {
  return {
    id: input.eventId,
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.start.toISOString(), timeZone: input.timeZone },
    end: { dateTime: input.end.toISOString(), timeZone: input.timeZone },
    transparency: 'opaque',
    visibility: 'private',
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
    extendedProperties: {
      private: {
        vernierSessionId: input.sessionId,
        vernierSchema: EVENT_SCHEMA,
        vernierMode: input.mode,
      },
    },
  };
}

/**
 * Create the dedicated calendar. Once, on first connect, and never again.
 *
 * A missing stored identifier beside a live grant is an error state rather than
 * a signal to recreate: `calendar.app.created` has no lookup path back to a
 * calendar this app made, so a second create would orphan the first with the
 * owner's history in it. The service refuses before it reaches here.
 */
export async function createAppCalendar(
  ports: ClientPorts,
  confirmation: Confirmation | null,
  input: WriteInput,
): Promise<GoogleAnswer> {
  return callGoogle(ports, {
    kind: 'write',
    method: 'POST',
    url: calendarsInsertUrl(),
    confirmation,
    json: {
      summary: input.summary,
      description: input.description,
      timeZone: input.timeZone,
    },
  });
}

export async function insertEvent(
  ports: ClientPorts,
  confirmation: Confirmation | null,
  input: WriteInput,
): Promise<GoogleAnswer> {
  return callGoogle(ports, {
    kind: 'write',
    method: 'POST',
    url: eventsInsertUrl(input.calendarId),
    confirmation,
    json: eventBody(input),
  });
}

/**
 * Move or re-time one event.
 *
 * `PUT` rather than `PATCH`: Google's own note on `events.patch` says each patch
 * request costs three quota units and recommends a get followed by an update,
 * and an update also avoids the array-overwrite surprise patch semantics carry.
 * The body is the whole event, which this app can always reconstruct because it
 * wrote it.
 */
export async function updateEvent(
  ports: ClientPorts,
  confirmation: Confirmation | null,
  input: WriteInput,
): Promise<GoogleAnswer> {
  return callGoogle(ports, {
    kind: 'write',
    method: 'PUT',
    url: eventUrl(input.calendarId, input.eventId),
    confirmation,
    json: eventBody(input),
  });
}

export async function deleteEvent(
  ports: ClientPorts,
  confirmation: Confirmation | null,
  input: WriteInput,
): Promise<GoogleAnswer> {
  return callGoogle(ports, {
    kind: 'write',
    method: 'DELETE',
    url: eventUrl(input.calendarId, input.eventId),
    confirmation,
  });
}

export const WRITE_SITES: readonly WriteSite[] = Object.freeze([
  { id: 'calendars.insert', method: 'POST', run: createAppCalendar },
  { id: 'events.insert', method: 'POST', run: insertEvent },
  { id: 'events.update', method: 'PUT', run: updateEvent },
  { id: 'events.delete', method: 'DELETE', run: deleteEvent },
]);

/** The count this file declares it has, asserted by the test against the walk. */
export const WRITE_SITE_COUNT = 4;
