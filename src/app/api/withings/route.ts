import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { strings } from '@/lib/strings';
import {
  connect,
  describeConnection,
  disconnect,
  importOnce,
  openRun,
  testConnection,
} from '@/lib/withings/service';

export const dynamic = 'force-dynamic';

/**
 * The five things the status screen can ask the Withings connection to do.
 *
 * Anti-forgery first, session second, work third. Same order as every other
 * mutating route in this app and there is no exemption list.
 *
 * Nothing this route answers with carries a token, a client secret or the
 * Withings account identifier. The status shape it returns is the one
 * `src/db/withings.ts` defines, which has no field that could hold one.
 */

const ACTIONS = ['connect', 'import', 'sync', 'test', 'disconnect'] as const;
type Action = (typeof ACTIONS)[number];

function isAction(value: unknown): value is Action {
  return typeof value === 'string' && (ACTIONS as readonly string[]).includes(value);
}

export async function GET() {
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;
  return ok({ withings: await describeConnection() });
}

/**
 * An unhandled throw in a route handler is answered by the framework with a
 * bare 500 and an empty body, and an empty body renders on screen as the two
 * words "HTTP 500", which names no cause and offers no action. Screen 00
 * defines what an error looks like and that is not it.
 */
export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    console.error(`[vernier] /api/withings failed: ${(error as Error).message}`);
    return refuse(500, strings.api.withings.failed, strings.api.withings.failedDetail);
  }
}

async function handle(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  let body: { action?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.withings.bodyDetail);
  }

  if (!isAction(body.action)) {
    return refuse(
      422,
      strings.api.withings.unknownAction,
      strings.api.withings.unknownActionDetail,
    );
  }

  if (body.action === 'disconnect') {
    await disconnect();
    return ok({ withings: await describeConnection() });
  }

  const run = await openRun();

  if (body.action === 'connect') {
    const result = await connect(run);
    if (result.kind === 'not_configured') {
      return refuse(
        409,
        strings.api.withings.notConfigured,
        strings.api.withings.notConfiguredDetail,
        { withings: await describeConnection() },
      );
    }
    if (result.kind === 'failed') {
      return refuse(
        502,
        strings.api.withings.exchangeFailed,
        strings.api.withings.exchangeFailedDetail,
        { withings: await describeConnection() },
      );
    }
    return ok({
      connected: result.kind === 'demo_connected',
      authorizeUrl: result.kind === 'authorize' ? result.url : null,
      withings: await describeConnection(),
    });
  }

  if (body.action === 'test') {
    const result = await testConnection(run);
    return ok({ test: result, withings: await describeConnection() });
  }

  const report = await importOnce(run, { historical: body.action === 'import' });
  return ok({
    report: {
      ran: report.ran,
      outcome: report.outcome,
      pages: report.pages,
      cappedOut: report.cappedOut,
      measuresSeen: report.measuresSeen,
      groupsSeen: report.groupsSeen,
      groupsDropped: report.groupsDropped,
      bloodPressureGroupsDropped: report.bloodPressureGroupsDropped,
      cursor: report.cursor,
      cursorAdvanced: report.cursorAdvanced,
      batchId: report.batchId,
      stored: report.commit?.stored ?? 0,
      revised: report.commit?.revised ?? 0,
      duplicates: report.commit?.duplicates ?? 0,
      questions: report.commit?.questions ?? 0,
      refused: report.commit?.refused ?? 0,
      counters: report.counters,
    },
    withings: await describeConnection(),
  });
}
