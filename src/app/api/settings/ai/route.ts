import { readConsent, setConsent } from '@/db/ai';
import { isAiCategory } from '@/lib/ai/consent';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * One switch, moved on its own.
 *
 * The body names ONE category and one boolean. A route that took four would
 * make turning photo analysis off a write that also restates the other three,
 * and two screens open at once would then undo each other. F94's independence
 * is a property of this route as much as of the four columns behind it.
 */
export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  let body: { category?: unknown; on?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.meals.bodyDetail);
  }

  const category = typeof body.category === 'string' ? body.category : '';
  if (!isAiCategory(category)) {
    return refuse(422, strings.api.meals.badCategory, strings.api.meals.badCategoryDetail);
  }
  if (typeof body.on !== 'boolean') {
    return refuse(422, strings.api.meals.badCategory, strings.api.meals.badCategoryDetail);
  }

  const consent = await setConsent(category, body.on);
  return ok({ consent });
}

export async function GET() {
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;
  return ok({ consent: await readConsent() });
}
