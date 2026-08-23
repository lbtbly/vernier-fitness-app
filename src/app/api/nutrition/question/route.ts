import { answerQuestion } from '@/db/recipes';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * The answer to "an ingredient source changed".
 *
 * Two answers and no third: recompute, which supersedes the standing snapshot
 * and writes the next version beside it, or keep, which records that the owner
 * looked and decided. Neither one edits a stored figure, and the trigger in
 * 0009 would refuse it if one tried.
 */
export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  let body: { id?: unknown; answer?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.nutrition.bodyDetail);
  }

  const id = typeof body.id === 'string' ? body.id : '';
  const answer = body.answer === 'recomputed' ? 'recomputed' : body.answer === 'kept' ? 'kept' : null;
  if (id === '' || !answer) {
    return refuse(422, strings.api.nutrition.badState, strings.api.nutrition.badStateDetail);
  }

  const done = await answerQuestion(id, answer);
  if (!done) return refuse(404, strings.api.nutrition.noRecipe, strings.api.nutrition.noRecipeDetail);
  return ok({ answered: id, answer });
}
