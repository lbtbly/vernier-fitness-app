import { purgeCategory } from '@/db/purge';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * Permanent deletion, by category, behind the phrase the owner typed.
 *
 * THIS ROUTE IS NOT THE GUARD AND MUST NEVER BE THE ONLY ONE. It checks the
 * category is deletable and hands the phrase to `vernier_delete_category`,
 * which recomputes the phrase from the category and refuses anything else. If
 * this handler were replaced tomorrow by one that forgot to check, the database
 * would still refuse. That is what "behind a typed phrase" means.
 *
 * It answers with what went, per table, and with what was there BEFORE. A zero
 * afterwards is evidence only beside the population it covered, and the caller
 * renders both.
 */
export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  let body: { category?: unknown; phrase?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.data.unknownCategoryDetail);
  }

  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const phrase = typeof body.phrase === 'string' ? body.phrase : '';
  if (category === '') {
    return refuse(422, strings.api.data.unknownCategory, strings.api.data.unknownCategoryDetail);
  }

  try {
    const outcome = await purgeCategory(category, phrase);
    if (!outcome.ok && outcome.cause === 'unknown_category') {
      return refuse(422, strings.api.data.unknownCategory, strings.api.data.unknownCategoryDetail);
    }
    if (!outcome.ok) {
      return refuse(422, strings.api.data.phraseMismatch, strings.api.data.phraseMismatchDetail, {
        outcome,
      });
    }
    return ok({ outcome });
  } catch (error) {
    console.error(`[vernier] delete category: ${(error as Error).message}`);
    return refuse(500, strings.api.data.deleteFailed, strings.api.data.deleteFailedDetail);
  }
}
