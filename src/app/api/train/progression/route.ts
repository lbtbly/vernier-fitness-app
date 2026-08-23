import { decideProgression, readProgressions } from '@/db/training';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * Confirming or declining one advancement.
 *
 * There is no path that applies one. The 2-for-2 trigger writes a proposal when
 * a session finishes and this endpoint is the only thing that turns a proposal
 * into a changed target, which is what "proposed, then confirmed, never applied
 * silently" means in code rather than in a sentence on a screen.
 */

export async function GET() {
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;
  return ok({ proposed: await readProgressions('proposed') });
}

export async function POST(request: Request) {
  try {
    const csrf = await csrfFailure(request);
    if (csrf) return csrf.response;

    const { refusal } = await sessionOrRefusal();
    if (refusal) return refusal;

    let body: { id?: unknown; decision?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return refuse(400, strings.api.jsonBody, strings.api.train.bodyDetail);
    }

    const id = typeof body.id === 'string' ? body.id : '';
    const decision = body.decision === 'confirm' ? 'confirm' : body.decision === 'decline' ? 'decline' : null;
    if (id === '' || decision === null) {
      return refuse(422, strings.api.train.unknownAction, strings.api.train.unknownActionDetail);
    }

    const decided = await decideProgression(id, decision);
    if (!decided) {
      return refuse(404, strings.api.train.notFound, strings.api.train.notFoundDetail);
    }
    return ok({ decided, proposed: await readProgressions('proposed') });
  } catch (error) {
    console.error(`[vernier] /api/train/progression failed: ${(error as Error).message}`);
    return refuse(500, strings.api.train.failed, strings.api.train.failedDetail);
  }
}
