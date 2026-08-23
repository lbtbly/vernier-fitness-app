import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { strings } from '@/lib/strings';
import {
  applyPlan,
  buildPlan,
  chooseCalendars,
  connect,
  currentPlan,
  describeConnection,
  disconnect,
  offerCalendars,
  openRun,
  planById,
  planView,
  undoWrite,
  writeLogView,
} from '@/lib/google/service';

export const dynamic = 'force-dynamic';

/**
 * The six things the calendar screens can ask the connection to do, and the one
 * of them that writes.
 *
 * Anti-forgery first, session second, work third. The same order as every other
 * mutating route in this app, with no exemption list.
 *
 * APPLY IS THE ONLY ACTION THAT REACHES A WRITE SITE, and it cannot reach one
 * without a stored open plan and the row identifiers the owner ticked. `plan`
 * reads Google and writes nothing outbound; `connect`, `calendars`, `choose` and
 * `disconnect` write nothing outbound either. That is F110 at the route layer,
 * above the guard in `callGoogle` that enforces it whatever a route does.
 *
 * Nothing this route answers with carries a token, a client secret or a refresh
 * token. The shapes it returns are the ones `src/lib/google/service.ts` defines,
 * and none of them has a field that could hold one.
 */

const ACTIONS = ['connect', 'calendars', 'choose', 'plan', 'apply', 'undo', 'disconnect'] as const;
type Action = (typeof ACTIONS)[number];

function isAction(value: unknown): value is Action {
  return typeof value === 'string' && (ACTIONS as readonly string[]).includes(value);
}

export async function GET() {
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;
  const open = await currentPlan();
  return ok({
    calendar: await describeConnection(),
    plan: open ? await planView(open) : null,
    writes: await writeLogView(),
  });
}

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    console.error(`[vernier] /api/calendar failed: ${(error as Error).message}`);
    return refuse(500, strings.api.calendar.failed, strings.api.calendar.failedDetail);
  }
}

async function handle(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  let body: { action?: unknown; calendarIds?: unknown; planId?: unknown; rowIds?: unknown; writeId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.calendar.bodyDetail);
  }

  if (!isAction(body.action)) {
    return refuse(422, strings.api.calendar.unknownAction, strings.api.calendar.unknownActionDetail);
  }

  if (body.action === 'disconnect') {
    await disconnect();
    return ok({ calendar: await describeConnection(), plan: null, writes: await writeLogView() });
  }

  const run = await openRun();

  if (body.action === 'connect') {
    const result = await connect(run);
    if (result.kind === 'not_configured') {
      return refuse(409, strings.api.calendar.notConfigured, strings.api.calendar.notConfiguredDetail, {
        calendar: await describeConnection(),
      });
    }
    if (result.kind === 'failed') {
      return refuse(502, strings.api.calendar.exchangeFailed, strings.api.calendar.exchangeFailedDetail, {
        calendar: await describeConnection(),
      });
    }
    return ok({
      connected: result.kind === 'demo_connected',
      authorizeUrl: result.kind === 'authorize' ? result.url : null,
      calendar: await describeConnection(),
    });
  }

  if (body.action === 'calendars') {
    const result = await offerCalendars(run);
    if (result.kind === 'not_connected') {
      return refuse(409, strings.api.calendar.notConnected, strings.api.calendar.notConnectedDetail, {
        calendar: await describeConnection(),
      });
    }
    if (result.kind === 'failed') {
      return refuse(502, strings.api.calendar.failed, strings.api.calendar.failedDetail, {
        calendar: await describeConnection(),
      });
    }
    return ok({ calendars: result.calendars, calendar: await describeConnection() });
  }

  if (body.action === 'choose') {
    const ids = Array.isArray(body.calendarIds)
      ? body.calendarIds.filter((id): id is string => typeof id === 'string')
      : [];
    await chooseCalendars(ids);
    return ok({ calendar: await describeConnection() });
  }

  if (body.action === 'plan') {
    const result = await buildPlan(run);
    if (result.kind === 'not_connected') {
      return refuse(409, strings.api.calendar.notConnected, strings.api.calendar.notConnectedDetail, {
        calendar: await describeConnection(),
      });
    }
    if (result.kind === 'missing_calendar') {
      // F105. A grant that works and no stored identifier for the calendar this
      // app made. It is an error, and it is never a second calendar.
      return refuse(409, strings.api.calendar.noCalendar, strings.api.calendar.noCalendarDetail, {
        calendar: await describeConnection(),
      });
    }
    if (result.kind === 'failed') {
      return refuse(502, strings.api.calendar.failed, strings.api.calendar.failedDetail, {
        calendar: await describeConnection(),
      });
    }
    return ok({
      plan: await planView(result.plan),
      calendar: await describeConnection(),
      writes: await writeLogView(),
    });
  }

  if (body.action === 'apply') {
    const planId = typeof body.planId === 'string' ? body.planId : '';
    const rowIds = Array.isArray(body.rowIds)
      ? body.rowIds.filter((id): id is string => typeof id === 'string')
      : [];
    const result = await applyPlan(run, planId, rowIds);

    if (result.kind === 'no_plan') {
      return refuse(409, strings.api.calendar.noPlan, strings.api.calendar.noPlanDetail, {
        calendar: await describeConnection(),
      });
    }
    if (result.kind === 'nothing_selected') {
      return refuse(422, strings.api.calendar.noRows, strings.api.calendar.noRowsDetail, {
        calendar: await describeConnection(),
      });
    }
    if (result.kind === 'not_connected') {
      return refuse(409, strings.api.calendar.notConnected, strings.api.calendar.notConnectedDetail, {
        calendar: await describeConnection(),
      });
    }
    if (result.kind === 'failed') {
      return refuse(502, strings.api.calendar.failed, strings.api.calendar.failedDetail, {
        calendar: await describeConnection(),
      });
    }

    // The plan BY NAME rather than whatever is open, because applying it closed
    // it: the screen has to come back holding the same list with its outcomes on
    // it, which is the half of F108 that happens before any undo.
    const stored = await planById(planId);
    return ok({
      applied: {
        written: result.written,
        skipped: result.skipped,
        failed: result.failed,
        outcomes: result.outcomes,
      },
      plan: stored ? await planView(stored) : null,
      calendar: await describeConnection(),
      writes: await writeLogView(),
    });
  }

  const writeId = typeof body.writeId === 'string' ? body.writeId : '';
  const result = await undoWrite(run, writeId);
  if (result.kind === 'unknown') {
    return refuse(404, strings.api.calendar.unknownWrite, strings.api.calendar.unknownWriteDetail, {
      calendar: await describeConnection(),
    });
  }
  if (result.kind === 'already_undone') {
    return refuse(409, strings.api.calendar.alreadyUndone, strings.api.calendar.alreadyUndoneDetail, {
      calendar: await describeConnection(),
    });
  }
  if (result.kind === 'calendar_not_empty') {
    return refuse(409, strings.api.calendar.calendarNotEmpty, strings.api.calendar.calendarNotEmptyDetail, {
      calendar: await describeConnection(),
    });
  }
  if (result.kind === 'not_connected') {
    return refuse(409, strings.api.calendar.notConnected, strings.api.calendar.notConnectedDetail, {
      calendar: await describeConnection(),
    });
  }
  if (result.kind === 'failed') {
    return refuse(502, strings.api.calendar.failed, strings.api.calendar.failedDetail, {
      calendar: await describeConnection(),
      writes: await writeLogView(),
    });
  }

  return ok({
    undone: result.writeId,
    calendar: await describeConnection(),
    writes: await writeLogView(),
  });
}
