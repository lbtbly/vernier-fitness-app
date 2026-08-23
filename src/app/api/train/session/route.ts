import { once } from '@/db/idempotency';
import { finishRun, logSet, startRun } from '@/db/training';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { CDC_MAX, CDC_MIN, PAIN_SCALE_MAX, RIR_MAX, RIR_MIN } from '@/lib/training-rules';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * The session player's one endpoint, and every write through it is queued.
 *
 * THE PLAYER NEVER WAITS ON THIS. A set logged in a basement gym goes into the
 * outbox with its own client UUID and the screen moves on, exactly the way the
 * quick log commits. That UUID is the `Idempotency-Key` and the row id, so the
 * queue draining an hour later on the walk home applies each set once however
 * many times it retried.
 *
 * Three actions and no fourth: the session started, a set was done, the session
 * finished. Nothing here interrupts anything, asks anything or returns anything
 * the player has to render mid-set.
 */

const HEADER = 'idempotency-key';

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    console.error(`[vernier] /api/train/session failed: ${(error as Error).message}`);
    return refuse(500, strings.api.train.failed, strings.api.train.failedDetail);
  }
}

function whole(value: unknown, low: number, high: number): number | null {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const rounded = Math.round(number);
  return rounded >= low && rounded <= high ? rounded : null;
}

async function handle(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  const key = request.headers.get(HEADER)?.trim();
  if (!key) return refuse(400, strings.api.train.noKey, strings.api.train.noKeyDetail);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.train.bodyDetail);
  }

  const action = typeof body.action === 'string' ? body.action : '';
  const runId = typeof body.runId === 'string' ? body.runId : '';
  const at =
    typeof body.at === 'string' && !Number.isNaN(Date.parse(body.at)) ? new Date(body.at) : new Date();

  const { handled } = await once(key, `/api/train/session#${action}`, async () => {
    if (action === 'start') {
      const proposalId = typeof body.proposalId === 'string' ? body.proposalId : '';
      const run = await startRun({
        id: runId || key,
        proposalId,
        startedAt: at,
        screenAwake: body.screenAwake === true,
      });
      if (!run) {
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
      return { outcome: 'applied' as const, handled: { status: 201, body: { run } as Record<string, unknown> } };
    }

    if (action === 'set') {
      const movementId = typeof body.movementId === 'string' ? body.movementId : '';
      const setIndex = Number(body.setIndex);
      const target = Number(body.target);
      const achieved = Number(body.achieved);
      if (movementId === '' || !Number.isFinite(setIndex) || !Number.isFinite(achieved) || !Number.isFinite(target)) {
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
      await logSet({
        runId,
        movementId,
        setIndex: Math.max(0, Math.round(setIndex)),
        target: Math.max(1, Math.round(target)),
        achieved: Math.max(0, Math.round(achieved)),
        loadKg: body.loadKg === null || body.loadKg === undefined ? null : Number(body.loadKg),
        rir: whole(body.rir, RIR_MIN, RIR_MAX),
        completedAt: at,
      });
      return { outcome: 'applied' as const, handled: { status: 201, body: { logged: true } as Record<string, unknown> } };
    }

    if (action === 'finish') {
      const effortScale = typeof body.effortScale === 'string' ? body.effortScale : 'rir';
      const result = await finishRun({
        runId,
        finishedAt: at,
        effortScale,
        effort:
          effortScale === 'rir'
            ? whole(body.effort, RIR_MIN, RIR_MAX)
            : whole(body.effort, CDC_MIN, CDC_MAX),
        painSite: typeof body.painSite === 'string' ? body.painSite : 'none',
        painScore: whole(body.painScore, 0, PAIN_SCALE_MAX),
        painSubsidedByMorning:
          body.painSubsidedByMorning === true
            ? true
            : body.painSubsidedByMorning === false
              ? false
              : null,
        note: typeof body.note === 'string' ? body.note.trim() : '',
      });
      return {
        outcome: 'applied' as const,
        handled: {
          status: 201,
          body: { advancements: result.advancements.length } as Record<string, unknown>,
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
