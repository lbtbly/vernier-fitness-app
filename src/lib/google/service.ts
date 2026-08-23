import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { plannedSession } from '@/db/schema';
import {
  type GoogleCause,
  type GoogleView,
  type NewPlan,
  type StoredPlan,
  type WriteLogEntry,
  appendWrite,
  demoStore,
  describeGoogle,
  disconnectPermanently,
  ensureConnection,
  forgetConnection,
  markPlanApplied,
  markPlanRow,
  readAvailability,
  readConnection,
  readOpenPlan,
  readPlan,
  readPlannedSessions,
  readTokens,
  readWriteLog,
  recordFailure,
  storeAvailability,
  storePlan,
  storeTokens,
  updateConnection,
} from '@/db/google';
import { getConfig } from '@/lib/config';
import { type CalendarFailure } from '@/lib/google/availability';
import type { ColumnEvent } from '@/lib/google/columns';
import {
  type CalendarChoice,
  type ClientPorts,
  type Confirmation,
  type GoogleAnswer,
  type RequestLine,
  confirmSelected,
  confirmUndo,
  exchangeCode,
  listAppEvents,
  listCalendars,
  queryFreeBusy,
} from '@/lib/google/client';
import { DEMONSTRATION_MODE, demoTransport } from '@/lib/google/demo-dataset';
import {
  type CalendarEventInput,
  type Cause,
  type DiffRow,
  buildDiff,
} from '@/lib/google/diff';
import { eventIdFor } from '@/lib/google/event-id';
import { type GoogleMode, readGoogleSettings } from '@/lib/google/mode';
import { type NetworkFailure, networkTransport } from '@/lib/google/network';
import { authorizeUrl } from '@/lib/google/protocol';
import { type WriteInput, type WriteSiteId, writeSite } from '@/lib/google/write-sites';
import { longDate, longDateTime, time24, weekdayName } from '@/lib/format';
import { instantOnDay, localDayKey } from '@/lib/local-time';
import { strings } from '@/lib/strings';
/**
 * ONE IMPLEMENTATION OF THE STATE CHECK, IMPORTED RATHER THAN COPIED.
 *
 * `src/lib/withings/auth-state.ts` mints a random value, keeps only its SHA-256
 * and compares in constant time. That is not a Withings rule, it is the OAuth
 * cross-site rule, and Google names the same control on the same page: "confirm
 * that the state received from Google matches the state sent". A second file
 * with the same forty lines in it is the defect this repository has already
 * named twice, once for SPOKEN_ATTRIBUTES and once for the scope lists: two
 * copies of one rule drift, and the drift is invisible because both look right.
 */
import { checkAuthState, mintAuthState } from '@/lib/withings/auth-state';

/**
 * The composition root: the adapter, the storage layer and the connection row,
 * wired into the seven things the calendar screens can ask for.
 *
 * Connect, choose calendars, work out what will change, apply, undo,
 * disconnect and describe. Demonstration mode runs all seven with no client
 * identifier and no socket, through the same client, the same guard and the same
 * writes as the live path. One pipeline, two answers, so the path the owner
 * proves this evening is the path his real calendar uses tomorrow.
 */

/** The code the demonstration handshake exchanges. It never leaves this machine. */
const DEMO_CODE = 'demonstration-authorization-code';

/**
 * How far ahead the calendar is kept in step.
 *
 * A fortnight: today's remaining sessions and the whole of the week the training
 * screen proposes, and no further, because a plan built over a longer window
 * would carry sessions the owner has not decided on yet.
 */
export const PLAN_WINDOW_DAYS = 14;

/** The event identifier the create-the-calendar row carries. Never 'primary'. */
export const CALENDAR_ROW_EVENT_ID = 'vrnrcalendar';

export type RunContext = {
  mode: GoogleMode;
  configured: boolean;
  timeZone: string;
  ports: ClientPorts;
  requests: RequestLine[];
  networkFailure: () => NetworkFailure | null;
  /** Set when a permanent refusal landed during this run. Nothing is retried after it. */
  permanent: () => GoogleCause | null;
};

export async function openRun(): Promise<RunContext> {
  const config = getConfig();
  const settings = readGoogleSettings(config.appUrl);
  await ensureConnection(settings.mode);

  let failure: NetworkFailure | null = null;
  let permanent: GoogleCause | null = null;
  const requests: RequestLine[] = [];

  const transport =
    settings.mode === 'demo'
      ? demoTransport(demoStore(), { timeZone: config.timeZone })
      : networkTransport((next) => {
          failure = next;
        });

  const ports: ClientPorts = {
    transport,
    credentials: {
      clientId: settings.clientId,
      clientSecret: settings.clientSecret,
      redirectUri: settings.redirectUri,
    },
    readTokens,
    storeTokens,
    async onPermanentFailure(error) {
      // EVERYTHING F109 ASKS FOR, ONCE, HERE. The token is deleted, the state
      // goes to disconnected with the instant and the raw body, background
      // reads stop, and there is no second attempt anywhere above this line:
      // `callGoogle` returns `disconnected` and every caller reports it.
      permanent =
        error.kind === 'deleted_client'
          ? 'deleted_client'
          : error.kind === 'invalid_client'
            ? 'invalid_client'
            : 'invalid_grant';
      await disconnectPermanently({ kind: permanent, raw: error.raw, at: new Date() });
    },
    now: () => new Date(),
    record: (line) => requests.push(line),
  };

  return {
    mode: settings.mode,
    configured: settings.clientId !== '' && settings.clientSecret !== '',
    timeZone: config.timeZone,
    ports,
    requests,
    networkFailure: () => failure,
    permanent: () => permanent,
  };
}

// --------------------------------------------------------------------------
// Connect.

export type ConnectResult =
  | { kind: 'demo_connected' }
  | { kind: 'authorize'; url: string }
  | { kind: 'not_configured' }
  | { kind: 'failed'; cause: GoogleCause };

export async function connect(run: RunContext): Promise<ConnectResult> {
  if (run.mode === 'demo') {
    await updateConnection({
      state: 'connecting',
      lastErrorKind: null,
      lastErrorRaw: null,
      backgroundSyncStopped: false,
    });
    const exchanged = await exchangeCode(run.ports, DEMO_CODE);
    if (exchanged.outcome !== 'connected') {
      await recordFailure('exchange_failed', null);
      return { kind: 'failed', cause: 'exchange_failed' };
    }
    await updateConnection({ connectedAt: new Date(), state: 'connected' });
    return { kind: 'demo_connected' };
  }

  if (!run.configured) {
    await recordFailure('not_configured', null);
    return { kind: 'not_configured' };
  }

  const minted = mintAuthState();
  await updateConnection({
    state: 'connecting',
    authStateHash: minted.hash,
    authStateIssuedAt: new Date(),
    lastErrorKind: null,
    lastErrorRaw: null,
    backgroundSyncStopped: false,
  });

  return {
    kind: 'authorize',
    url: authorizeUrl({
      clientId: run.ports.credentials.clientId,
      redirectUri: run.ports.credentials.redirectUri,
      state: minted.state,
    }),
  };
}

export type CallbackResult = { kind: 'connected' } | { kind: 'refused'; cause: GoogleCause };

/**
 * The consent page coming back.
 *
 * THE ORDER IS THE POINT. The state is compared before the code is looked at,
 * the pair is spent whatever the outcome so a mismatched value cannot be retried
 * against the same hash, and the refresh token is PERSISTED BEFORE THIS
 * RETURNS, inside `exchangeCode`, because Google issues one only on the first
 * authorization and a handler that answered first would lose it to any crash in
 * between.
 */
export async function completeCallback(
  run: RunContext,
  code: string,
  state: string,
): Promise<CallbackResult> {
  const row = await readConnection();

  await updateConnection({ authStateHash: null, authStateIssuedAt: null });

  const verdict = checkAuthState(
    state,
    row?.authStateHash ?? null,
    row?.authStateIssuedAt ?? null,
    new Date(),
  );
  if (verdict === 'expired') {
    await recordFailure('awaiting_consent', null);
    return { kind: 'refused', cause: 'awaiting_consent' };
  }
  if (verdict !== 'matched') {
    await recordFailure('state_mismatch', null);
    return { kind: 'refused', cause: 'state_mismatch' };
  }
  if (code.trim() === '') {
    await recordFailure('no_code', null);
    return { kind: 'refused', cause: 'no_code' };
  }

  const exchanged = await exchangeCode(run.ports, code);
  if (exchanged.outcome === 'no_refresh_token') {
    await recordFailure('exchange_failed', null);
    return { kind: 'refused', cause: 'exchange_failed' };
  }
  if (exchanged.outcome !== 'connected') {
    await recordFailure('exchange_failed', exchanged.error.raw);
    return { kind: 'refused', cause: 'exchange_failed' };
  }

  await updateConnection({
    connectedAt: new Date(),
    state: 'connected',
    disconnectedAt: null,
    lastErrorKind: null,
    lastErrorRaw: null,
    backgroundSyncStopped: false,
  });
  return { kind: 'connected' };
}

// --------------------------------------------------------------------------
// The picker.

export type PickerResult =
  | { kind: 'ok'; calendars: CalendarChoice[] }
  | { kind: 'not_connected' }
  | { kind: 'failed'; cause: GoogleCause };

export async function offerCalendars(run: RunContext): Promise<PickerResult> {
  const result = await listCalendars(run.ports);
  if (result.outcome === 'ok') return { kind: 'ok', calendars: result.calendars };
  if (result.outcome === 'not_connected') return { kind: 'not_connected' };
  const cause = causeOf(run, result.answer);
  await recordFailure(cause, null);
  return { kind: 'failed', cause };
}

export async function chooseCalendars(ids: string[]): Promise<void> {
  await updateConnection({ watchedCalendarIds: [...new Set(ids)].filter((id) => id !== '') });
}

// --------------------------------------------------------------------------
// The plan.

export type PlanWindow = { from: Date; to: Date };

export function planWindow(now: Date, timeZone: string): PlanWindow {
  const today = localDayKey(now, timeZone);
  const from = instantOnDay(today, 0, 0, timeZone);
  return { from, to: new Date(from.getTime() + PLAN_WINDOW_DAYS * 86_400_000) };
}

export type BuildResult =
  | { kind: 'built'; plan: StoredPlan }
  | { kind: 'not_connected' }
  | { kind: 'missing_calendar' }
  | { kind: 'failed'; cause: GoogleCause };

/**
 * Work out what would change, write it down, and touch nothing outside this
 * machine.
 *
 * Reads only: `freeBusy.query` for availability and `events.list` on the app's
 * own calendar. There is no write site anywhere in this function and there
 * cannot be one: every write needs a confirmation, and a confirmation is minted
 * from a STORED plan, which this function is in the middle of creating.
 */
export async function buildPlan(run: RunContext): Promise<BuildResult> {
  const connection = await readConnection();
  const tokens = await readTokens();
  if (!connection || !tokens) return { kind: 'not_connected' };

  // F105's error state. A calendar was created once and its identifier is gone,
  // and there is no lookup path back to it. Making another one would orphan the
  // first with the owner's history in it, so this refuses and says so.
  if (connection.appCalendarCreatedAt && !connection.appCalendarId) {
    await recordFailure('missing_calendar', null);
    return { kind: 'missing_calendar' };
  }

  const window = planWindow(new Date(), run.timeZone);
  const watched = Array.isArray(connection.watchedCalendarIds)
    ? (connection.watchedCalendarIds as string[])
    : [];

  // ---- availability, fresh if Google answers and stored if it does not
  let busy = [] as Awaited<ReturnType<typeof readAvailability>>['busy'];
  let failures: CalendarFailure[] = [];
  let availabilityAt: Date | null = connection.lastAvailabilityAt ?? null;
  let stale = false;

  if (watched.length > 0) {
    const answer = await queryFreeBusy(run.ports, {
      timeMin: window.from.toISOString(),
      timeMax: window.to.toISOString(),
      timeZone: run.timeZone,
      calendarIds: watched,
    });
    if (answer.outcome === 'ok') {
      const readAt = new Date();
      await storeAvailability(answer.reading, readAt);
      busy = answer.reading.busy;
      failures = answer.reading.failures;
      availabilityAt = readAt;
    } else {
      if (answer.outcome === 'disconnected') return { kind: 'failed', cause: run.permanent() ?? 'invalid_grant' };
      // F111. Google is unreachable and the week is still proposed, from the
      // last availability this machine stored, with the age of it carried on
      // the plan so the screen can name the cause rather than pretend.
      const stored = await readAvailability();
      busy = stored.busy;
      failures = stored.failures;
      availabilityAt = stored.readAt;
      stale = true;
      await recordFailure(causeOf(run, answer.answer), null);
    }
  }

  // ---- what is in the app calendar now
  let events: CalendarEventInput[] = [];
  if (connection.appCalendarId) {
    const answer = await listAppEvents(run.ports, {
      calendarId: connection.appCalendarId,
      timeMin: window.from.toISOString(),
      timeMax: window.to.toISOString(),
    });
    if (answer.outcome === 'disconnected') {
      return { kind: 'failed', cause: run.permanent() ?? 'invalid_grant' };
    }
    if (answer.outcome !== 'ok') {
      stale = true;
      await recordFailure(causeOf(run, answer.answer), null);
    }
    events = answer.events.map((event) => ({
      id: event.id,
      sessionId: event.sessionId,
      title: event.title,
      start: event.start,
      end: event.end,
    }));
  }

  // ---- what the training week says should be there
  const sessions = await readPlannedSessions(window.from, window.to);

  const diff = buildDiff({
    sessions: sessions.map((session) => ({
      id: session.id,
      title: session.title,
      plannedFor: session.plannedFor,
      durationMinutes: session.durationMinutes,
    })),
    events,
    busy,
    failures,
    timeZone: run.timeZone,
  });

  const rows: NewPlan['rows'] = diff.rows.map((row) => ({
    verb: row.verb,
    site: siteFor(row),
    sessionId: row.sessionId,
    eventId: row.eventId,
    title: row.title,
    beforeStart: row.beforeStart,
    beforeEnd: row.beforeEnd,
    afterStart: row.afterStart,
    afterEnd: row.afterEnd,
    cause: renderCause(row.cause, run.timeZone),
    causeKey: row.cause.key,
    defaultSelected: row.selected,
  }));

  // The calendar itself, when there is not one yet, as the first row of the
  // first plan. Creating it is an outbound write, so it is confirmed like every
  // other outbound write rather than happening quietly during connect.
  if (!connection.appCalendarId) {
    rows.unshift({
      verb: 'added',
      site: 'calendars.insert',
      sessionId: null,
      eventId: CALENDAR_ROW_EVENT_ID,
      title: strings.calendar.calendarName,
      beforeStart: null,
      beforeEnd: null,
      afterStart: null,
      afterEnd: null,
      cause: strings.calendar.createCalendarCause,
      causeKey: 'createCalendar',
      defaultSelected: true,
    });
  }

  const plan = await storePlan({
    windowFrom: window.from,
    windowTo: window.to,
    mode: run.mode,
    calendarId: connection.appCalendarId ?? '',
    availabilityAt,
    availabilityStale: stale,
    failures: failures.length,
    beforeEvents: events.map((event) => ({
      eventId: event.id,
      title: event.title,
      start: event.start.toISOString(),
      end: event.end.toISOString(),
    })),
    unplaceable: diff.unplaceable.map((entry) => ({
      sessionId: entry.sessionId,
      title: entry.title,
      plannedFor: entry.plannedFor.toISOString(),
      blockedFrom: entry.blockedFrom.toISOString(),
      blockedTo: entry.blockedTo.toISOString(),
    })),
    totalChanges: diff.totalChanges,
    heldBack: diff.heldBack,
    rows,
  });

  return { kind: 'built', plan };
}

/** Which enumerated write site a diff row will use when it is confirmed. */
function siteFor(row: DiffRow): WriteSiteId {
  if (row.verb === 'added') return 'events.insert';
  if (row.verb === 'moved') return 'events.update';
  return 'events.delete';
}

/**
 * The cause, rendered from the catalogue and frozen on the row.
 *
 * The diff returns a key and its data; this turns it into the sentence the owner
 * reads, once, at build time. A screen never re-derives it and a later rule
 * change never rewrites what he was told, exactly as `dedup_reason` and the
 * training week's cause work.
 */
export function renderCause(cause: Cause, timeZone: string): string {
  const words = strings.calendar.rowCauses;
  if (cause.key === 'movedBusy') {
    const from = new Date(String(cause.params.from));
    const to = new Date(String(cause.params.to));
    const was = new Date(String(cause.params.was));
    return words.movedBusy(
      weekdayName(was, timeZone),
      time24(from, timeZone),
      time24(to, timeZone),
    );
  }
  const at = new Date(String(cause.params.at));
  const day = longDate(at, timeZone);
  const time = time24(at, timeZone);
  if (cause.key === 'clearUnverified') {
    return words.clearUnverified(day, time, Number(cause.params.calendars ?? 1));
  }
  if (cause.key === 'movedInPlan') return words.movedInPlan(day, time);
  if (cause.key === 'sessionGone') return words.sessionGone(day, time);
  return words.clear(day, time);
}

// --------------------------------------------------------------------------
// Apply. THE CONFIRM HANDLER, and the only path to a write site.

export type RowOutcome = {
  rowId: string;
  verb: string;
  site: WriteSiteId;
  title: string;
  state: 'applied' | 'skipped' | 'failed';
  writeId: string | null;
  detail: string | null;
};

export type ApplyResult =
  | { kind: 'applied'; outcomes: RowOutcome[]; written: number; skipped: number; failed: number }
  | { kind: 'no_plan' }
  | { kind: 'nothing_selected' }
  | { kind: 'not_connected' }
  | { kind: 'failed'; cause: GoogleCause };

export async function applyPlan(
  run: RunContext,
  planId: string,
  rowIds: string[],
): Promise<ApplyResult> {
  const stored = await readPlan(planId);
  if (!stored || stored.plan.state !== 'open') return { kind: 'no_plan' };

  const tokens = await readTokens();
  if (!tokens) return { kind: 'not_connected' };

  const now = new Date();
  const confirmations = confirmSelected(
    { id: stored.plan.id, state: stored.plan.state, rowIds: stored.rows.map((row) => row.id) },
    rowIds,
    now,
  );
  const byRow = new Map(confirmations.map((entry) => [entry.rowId, entry]));
  if (byRow.size === 0) return { kind: 'nothing_selected' };

  const connection = await readConnection();
  let calendarId = connection?.appCalendarId ?? stored.plan.calendarId;
  const outcomes: RowOutcome[] = [];

  for (const row of stored.rows) {
    const confirmation = byRow.get(row.id) ?? null;

    // NOT TICKED, NOT WRITTEN. The row is settled as skipped and the write site
    // is never reached, which is the half of F107 that a screen cannot prove on
    // its own.
    if (!confirmation) {
      await markPlanRow(row.id, { state: 'skipped' });
      outcomes.push({
        rowId: row.id,
        verb: row.verb,
        site: row.site as WriteSiteId,
        title: row.title,
        state: 'skipped',
        writeId: null,
        detail: null,
      });
      continue;
    }

    const site = row.site as WriteSiteId;
    if (site !== 'calendars.insert' && calendarId === '') {
      // No calendar to write into and none being created in this plan. Refused
      // rather than guessed at, and never with the primary keyword.
      await markPlanRow(row.id, { state: 'failed', outcomeDetail: 'missing_calendar' });
      outcomes.push({
        rowId: row.id,
        verb: row.verb,
        site,
        title: row.title,
        state: 'failed',
        writeId: null,
        detail: 'missing_calendar',
      });
      continue;
    }

    const input: WriteInput = {
      calendarId,
      eventId: row.eventId,
      sessionId: row.sessionId ?? '',
      summary:
        site === 'calendars.insert'
          ? strings.calendar.calendarName
          : strings.calendar.eventSummary(row.title),
      description:
        site === 'calendars.insert'
          ? strings.calendar.calendarDescription
          : strings.calendar.eventDescription(row.cause),
      start: row.afterStart ?? row.beforeStart ?? now,
      end: row.afterEnd ?? row.beforeEnd ?? now,
      timeZone: run.timeZone,
      mode: run.mode === 'demo' ? DEMONSTRATION_MODE : run.mode,
    };

    const answer = await writeSite(site).run(run.ports, confirmation, input);
    const ok = wroteSomething(site, answer);

    if (ok && site === 'calendars.insert') {
      const body = (answer.outcome === 'ok' ? answer.body : {}) as Record<string, unknown>;
      const created = typeof body.id === 'string' ? body.id : '';
      calendarId = created;
      await updateConnection({
        appCalendarId: created,
        appCalendarSummary: typeof body.summary === 'string' ? body.summary : null,
        appCalendarCreatedAt: new Date(),
      });
    }

    const write = await appendWrite({
      planId: stored.plan.id,
      planRowId: row.id,
      site,
      verb: row.verb as 'added' | 'moved' | 'removed',
      eventId: site === 'calendars.insert' ? row.eventId : row.eventId,
      sessionId: row.sessionId,
      title: row.title,
      beforeStart: row.beforeStart,
      beforeEnd: row.beforeEnd,
      afterStart: row.afterStart,
      afterEnd: row.afterEnd,
      outcome: ok ? 'written' : 'failed',
      httpStatus: answer.outcome === 'ok' || answer.outcome === 'failed' ? answer.status : null,
      detail: ok ? null : detailOf(answer),
      mode: run.mode,
      undoesWriteId: null,
    });

    // The plan and the calendar agree afterwards, or the owner is looking at two
    // different times for one session. A confirmed move moves the planned
    // session too, with the cause he just read frozen on it.
    if (ok && row.sessionId && row.afterStart) {
      await movePlannedSession(row.sessionId, row.afterStart, row.cause);
    }

    await markPlanRow(row.id, {
      state: ok ? 'applied' : 'failed',
      writeId: write.id,
      outcomeDetail: ok ? null : detailOf(answer),
    });

    outcomes.push({
      rowId: row.id,
      verb: row.verb,
      site,
      title: row.title,
      state: ok ? 'applied' : 'failed',
      writeId: write.id,
      detail: ok ? null : detailOf(answer),
    });

    if (answer.outcome === 'disconnected') {
      // Permanent. Everything after this row is left pending rather than
      // hammered against a grant that is dead.
      break;
    }
  }

  await markPlanApplied(stored.plan.id, now);
  const written = outcomes.filter((row) => row.state === 'applied').length;
  if (written > 0) await updateConnection({ lastSuccessfulWriteAt: now });

  return {
    kind: 'applied',
    outcomes,
    written,
    skipped: outcomes.filter((row) => row.state === 'skipped').length,
    failed: outcomes.filter((row) => row.state === 'failed').length,
  };
}

/**
 * Did this call actually change the calendar.
 *
 * A 409 on an insert means the deterministic identifier is already there, which
 * is the idempotence working: the event the owner confirmed is in the calendar,
 * and it is one event rather than two. A 404 or 410 on a delete means it was
 * gone already, which is the same story from the other end. Both are recorded as
 * written, because the calendar now holds what the row said it should.
 */
function wroteSomething(site: WriteSiteId, answer: GoogleAnswer): boolean {
  if (answer.outcome === 'ok') return true;
  if (answer.outcome !== 'failed') return false;
  if (site === 'events.insert' && answer.status === 409) return true;
  if ((site === 'events.delete' || site === 'calendars.delete') && (answer.status === 404 || answer.status === 410)) {
    return true;
  }
  return false;
}

function detailOf(answer: GoogleAnswer): string {
  if (answer.outcome === 'disconnected') return answer.error.raw;
  if (answer.outcome === 'failed') {
    return typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body ?? {});
  }
  if (answer.outcome === 'not_connected') return 'not_connected';
  return '';
}

/** The plan follows the calendar, with the cause the owner read frozen on it. */
async function movePlannedSession(sessionId: string, start: Date, cause: string): Promise<void> {
  const db = getDb();
  await db
    .update(plannedSession)
    .set({ plannedFor: start, cause })
    .where(and(eq(plannedSession.id, sessionId), eq(plannedSession.state, 'planned')));
}

// --------------------------------------------------------------------------
// Undo, on any past write.

export type UndoResult =
  | { kind: 'undone'; writeId: string }
  | { kind: 'unknown' }
  | { kind: 'already_undone' }
  | { kind: 'calendar_not_empty' }
  | { kind: 'not_connected' }
  | { kind: 'failed'; detail: string };

/**
 * Reverse one write, however long ago it happened.
 *
 * Everything needed to reverse it is on the log row: the verb, the event
 * identifier and both sides of the change. Nothing is asked of Google first,
 * which is what makes an undo from two sessions earlier work at all.
 */
export async function undoWrite(run: RunContext, writeId: string): Promise<UndoResult> {
  const log = await readWriteLog(500);
  const entry = log.find((row) => row.id === writeId);
  if (!entry) return { kind: 'unknown' };
  if (entry.undoneByWriteId) return { kind: 'already_undone' };

  const confirmation = confirmUndo(entry, new Date());
  if (!confirmation) return { kind: 'already_undone' };

  const tokens = await readTokens();
  if (!tokens) return { kind: 'not_connected' };

  const connection = await readConnection();
  const calendarId = connection?.appCalendarId ?? '';

  // Undoing the creation of the calendar takes the calendar away, and with it
  // anything still in it. Refused while any event write is still standing: undo
  // them first, one at a time, so nothing disappears that was not named.
  if (entry.site === 'calendars.insert') {
    const standing = log.filter(
      (row) => row.site !== 'calendars.insert' && row.outcome === 'written' && !row.undoneByWriteId,
    );
    if (standing.length > 0) return { kind: 'calendar_not_empty' };
  }

  const site = inverseSite(entry.site, entry.verb);
  const input: WriteInput = {
    calendarId: entry.site === 'calendars.insert' ? entry.eventId || calendarId : calendarId,
    eventId: entry.eventId,
    sessionId: entry.sessionId ?? '',
    summary:
      entry.site === 'calendars.insert'
        ? strings.calendar.calendarName
        : strings.calendar.eventSummary(entry.title),
    description:
      entry.site === 'calendars.insert'
        ? strings.calendar.calendarDescription
        : strings.calendar.eventDescription(strings.calendar.undoneNote),
    // BACK TO EXACTLY THE BEFORE COLUMN. A moved event goes back to where it
    // was, a removed one is written again at the time it held, and an added one
    // is deleted. The times come off the log row rather than being recomputed.
    start: entry.beforeStart ?? entry.afterStart ?? new Date(),
    end: entry.beforeEnd ?? entry.afterEnd ?? new Date(),
    timeZone: run.timeZone,
    mode: run.mode === 'demo' ? DEMONSTRATION_MODE : run.mode,
  };

  const answer = await writeSite(site).run(run.ports, confirmation, input);
  const ok = wroteSomething(site, answer);

  await appendWrite({
    planId: entry.planId,
    planRowId: entry.planRowId,
    site,
    verb: 'undo',
    eventId: entry.eventId,
    sessionId: entry.sessionId,
    title: entry.title,
    beforeStart: entry.afterStart,
    beforeEnd: entry.afterEnd,
    afterStart: entry.beforeStart,
    afterEnd: entry.beforeEnd,
    outcome: ok ? 'written' : 'failed',
    httpStatus: answer.outcome === 'ok' || answer.outcome === 'failed' ? answer.status : null,
    detail: ok ? null : detailOf(answer),
    mode: run.mode,
    undoesWriteId: entry.id,
  });

  if (ok && entry.site === 'calendars.insert') {
    await updateConnection({ appCalendarId: null, appCalendarSummary: null, appCalendarCreatedAt: null });
  }
  if (ok && entry.sessionId && entry.verb === 'moved' && entry.beforeStart) {
    await movePlannedSession(entry.sessionId, entry.beforeStart, strings.calendar.undoneNote);
  }

  return ok ? { kind: 'undone', writeId: entry.id } : { kind: 'failed', detail: detailOf(answer) };
}

/** What reverses each write, as data rather than as a branch nobody can enumerate. */
export function inverseSite(site: string, verb: string): WriteSiteId {
  if (site === 'calendars.insert') return 'calendars.delete';
  if (verb === 'added') return 'events.delete';
  if (verb === 'removed') return 'events.insert';
  return 'events.update';
}

// --------------------------------------------------------------------------
// The rest of what the screens ask for.

export async function disconnect(): Promise<void> {
  await forgetConnection();
}

export async function describeConnection(): Promise<GoogleView> {
  const config = getConfig();
  const settings = readGoogleSettings(config.appUrl);
  await ensureConnection(settings.mode);
  return describeGoogle(settings.mode, settings.clientId !== '' && settings.clientSecret !== '');
}

export async function currentPlan(): Promise<StoredPlan | null> {
  return readOpenPlan();
}

export async function writeLog(limit = 100): Promise<WriteLogEntry[]> {
  return readWriteLog(limit);
}

/** What the log line reads as, with its time, for the screen and for a report. */
export function writeLine(entry: WriteLogEntry, timeZone: string): string {
  return `${longDateTime(entry.at, timeZone)}: ${entry.verb}, ${entry.title}`;
}

/** What went wrong, chosen from the run rather than from a status code alone. */
function causeOf(run: RunContext, answer: GoogleAnswer): GoogleCause {
  const permanent = run.permanent();
  if (permanent) return permanent;
  const failure = run.networkFailure();
  if (failure) {
    return failure.reason === 'timeout'
      ? 'timeout'
      : failure.reason === 'not_json'
        ? 'not_json'
        : 'unreachable';
  }
  if (answer.outcome === 'not_connected') return 'never_connected';
  if (answer.outcome === 'failed') {
    if (answer.status === 403 || answer.status === 429) return 'rate_limited';
    if (answer.status === 0) return 'unreachable';
    return 'api_error';
  }
  return 'api_error';
}

/**
 * Is a scheduled read allowed to run at all.
 *
 * False the moment a permanent refusal lands, and slice 12's Sunday run reads it
 * before it asks Google anything. F109 asks for background synchronisation to
 * STOP rather than to keep failing quietly against a grant that is dead.
 */
export async function backgroundReadsAllowed(): Promise<boolean> {
  const row = await readConnection();
  if (!row) return false;
  if (row.backgroundSyncStopped) return false;
  return row.state === 'connected' || row.state === 'demo';
}

/** Every calendar the availability read could not answer for, for the screen. */
export async function surfacedFailures(): Promise<CalendarFailure[]> {
  return (await readAvailability()).failures;
}

/** A confirmation is never built here. This is the type the screens see. */
export type { Confirmation };

/** The deterministic identifier a session's event carries, for a report or a test. */
export function eventIdOf(sessionId: string): string {
  return eventIdFor(sessionId);
}

// --------------------------------------------------------------------------
// What the confirm screen is handed.

export type PlanRowView = {
  id: string;
  verb: string;
  site: string;
  eventId: string;
  sessionId: string | null;
  title: string;
  cause: string;
  causeKey: string;
  beforeStart: string | null;
  beforeEnd: string | null;
  afterStart: string | null;
  afterEnd: string | null;
  defaultSelected: boolean;
  state: string;
  outcomeDetail: string | null;
  writeId: string | null;
};

export type PlanView = {
  id: string;
  builtAt: string;
  state: string;
  mode: string;
  availabilityAt: string | null;
  availabilityStale: boolean;
  failures: CalendarFailure[];
  counts: { added: number; moved: number; removed: number };
  totalChanges: number;
  heldBack: number;
  beforeEvents: ColumnEvent[];
  unplaceable: Array<{
    sessionId: string;
    title: string;
    plannedFor: string;
    blockedFrom: string;
    blockedTo: string;
  }>;
  rows: PlanRowView[];
};

/**
 * The plan, in the shape a screen may hold.
 *
 * Serialisable, because it crosses to the browser, and complete, because the
 * confirm screen must be able to draw the counts, both columns and every row
 * from this alone. Nothing here carries a token, a client secret or a calendar
 * identifier the owner did not choose.
 */
export async function planView(stored: StoredPlan): Promise<PlanView> {
  const failures = (await readAvailability()).failures;
  const beforeEvents = (Array.isArray(stored.plan.beforeEvents) ? stored.plan.beforeEvents : []) as Array<{
    eventId: string;
    title: string;
    start: string;
    end: string;
  }>;

  return {
    id: stored.plan.id,
    builtAt: stored.plan.builtAt.toISOString(),
    state: stored.plan.state,
    mode: stored.plan.mode,
    availabilityAt: stored.plan.availabilityAt?.toISOString() ?? null,
    availabilityStale: stored.plan.availabilityStale,
    failures,
    counts: {
      added: stored.rows.filter((row) => row.verb === 'added').length,
      moved: stored.rows.filter((row) => row.verb === 'moved').length,
      removed: stored.rows.filter((row) => row.verb === 'removed').length,
    },
    totalChanges: stored.plan.totalChanges,
    heldBack: stored.plan.heldBack,
    beforeEvents: beforeEvents.map((event) => ({ ...event, change: 'same' as const })),
    unplaceable: (Array.isArray(stored.plan.unplaceable) ? stored.plan.unplaceable : []) as PlanView['unplaceable'],
    rows: stored.rows.map((row) => ({
      id: row.id,
      verb: row.verb,
      site: row.site,
      eventId: row.eventId,
      sessionId: row.sessionId,
      title: row.title,
      cause: row.cause,
      causeKey: row.causeKey,
      beforeStart: row.beforeStart?.toISOString() ?? null,
      beforeEnd: row.beforeEnd?.toISOString() ?? null,
      afterStart: row.afterStart?.toISOString() ?? null,
      afterEnd: row.afterEnd?.toISOString() ?? null,
      defaultSelected: row.defaultSelected,
      state: row.state,
      outcomeDetail: row.outcomeDetail,
      writeId: row.writeId,
    })),
  };
}

export type WriteLogView = {
  id: string;
  at: string;
  site: string;
  verb: string;
  eventId: string;
  title: string;
  beforeStart: string | null;
  beforeEnd: string | null;
  afterStart: string | null;
  afterEnd: string | null;
  outcome: string;
  mode: string;
  undoesWriteId: string | null;
  undoneByWriteId: string | null;
};

/** The permanent log, in the shape the screen holds. Undo is offered off this. */
export async function writeLogView(limit = 100): Promise<WriteLogView[]> {
  const rows = await readWriteLog(limit);
  return rows.map((row) => ({
    id: row.id,
    at: row.at.toISOString(),
    site: row.site,
    verb: row.verb,
    eventId: row.eventId,
    title: row.title,
    beforeStart: row.beforeStart?.toISOString() ?? null,
    beforeEnd: row.beforeEnd?.toISOString() ?? null,
    afterStart: row.afterStart?.toISOString() ?? null,
    afterEnd: row.afterEnd?.toISOString() ?? null,
    outcome: row.outcome,
    mode: row.mode,
    undoesWriteId: row.undoesWriteId,
    undoneByWriteId: row.undoneByWriteId,
  }));
}
