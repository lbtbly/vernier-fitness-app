import { once } from '@/db/idempotency';
import {
  decideProposal,
  editProposal,
  proposeNextWeek,
  readProposals,
  upcomingWeekStart,
} from '@/db/training';
import { getConfig } from '@/lib/config';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * The proposed week: read it, propose one, and decide ONE row at a time.
 *
 * There is no endpoint that accepts a week. That is not an omission, it is
 * F72's second half and DESIGN.md section 5's first decision: a control that
 * commits every row at once is a control that writes things the owner did not
 * read. Accept, edit and reject each take one id, and rejecting one leaves
 * every other row exactly where it was.
 *
 * Anti-forgery first, session second, work third, same as every other mutating
 * route in this app, with no exemption list.
 */

const HEADER = 'idempotency-key';

export async function GET() {
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;
  const { timeZone } = getConfig();
  const weekStart = upcomingWeekStart(new Date(), timeZone);
  return ok({ weekStart, proposals: await readProposals(weekStart) });
}

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    console.error(`[vernier] /api/train/week failed: ${(error as Error).message}`);
    return refuse(500, strings.api.train.failed, strings.api.train.failedDetail);
  }
}

async function handle(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  const key = request.headers.get(HEADER)?.trim();
  if (!key) return refuse(400, strings.api.train.noKey, strings.api.train.noKeyDetail);

  let body: { action?: unknown; id?: unknown; plannedFor?: unknown; durationMinutes?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.train.bodyDetail);
  }

  const { timeZone } = getConfig();
  const action = typeof body.action === 'string' ? body.action : '';
  const id = typeof body.id === 'string' ? body.id : '';

  const { handled } = await once(key, `/api/train/week#${action}`, async () => {
    if (action === 'propose') {
      const result = await proposeNextWeek(new Date(), timeZone);
      return {
        outcome: 'applied' as const,
        handled: {
          status: 201,
          body: {
            weekStart: result.weekStart,
            written: result.written,
            proposals: await readProposals(result.weekStart),
          } as Record<string, unknown>,
        },
      };
    }

    if (action === 'accept' || action === 'reject') {
      const decided = await decideProposal(id, action === 'accept' ? 'accept' : 'reject');
      if (!decided) {
        return {
          outcome: 'refused' as const,
          handled: {
            status: 404,
            body: {
              error: strings.api.train.notFound,
              detail: strings.api.train.notFoundDetail,
            } as Record<string, unknown>,
          },
        };
      }
      // The whole week comes back, because the screen has to be able to prove
      // that deciding one row left the others alone. It reads the answer rather
      // than assuming it.
      return {
        outcome: 'applied' as const,
        handled: {
          status: 200,
          body: {
            decided,
            proposals: await readProposals(decided.weekStart),
          } as Record<string, unknown>,
        },
      };
    }

    if (action === 'edit') {
      const plannedFor =
        typeof body.plannedFor === 'string' && !Number.isNaN(Date.parse(body.plannedFor))
          ? new Date(body.plannedFor)
          : null;
      const durationMinutes = Number(body.durationMinutes);
      if (!plannedFor || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        return {
          outcome: 'refused' as const,
          handled: {
            status: 422,
            body: {
              error: strings.api.train.unknownAction,
              detail: strings.api.train.bodyDetail,
            } as Record<string, unknown>,
          },
        };
      }
      const edited = await editProposal(id, { plannedFor, durationMinutes }, timeZone);
      if (!edited) {
        return {
          outcome: 'refused' as const,
          handled: {
            status: 404,
            body: {
              error: strings.api.train.notFound,
              detail: strings.api.train.notFoundDetail,
            } as Record<string, unknown>,
          },
        };
      }
      return {
        outcome: 'applied' as const,
        handled: {
          status: 200,
          body: {
            decided: edited,
            proposals: await readProposals(edited.weekStart),
          } as Record<string, unknown>,
        },
      };
    }

    return {
      outcome: 'refused' as const,
      handled: {
        status: 422,
        body: {
          error: strings.api.train.unknownAction,
          detail: strings.api.train.unknownActionDetail,
        } as Record<string, unknown>,
      },
    };
  });

  return ok(handled.body, handled.status);
}
