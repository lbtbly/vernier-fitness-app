import { MEAL_STATES, setMealLactoseFree, setMealState, type MealState } from '@/db/nutrition';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * One meal, decided on its own.
 *
 * F86 says each meal is accepted, edited or rejected one at a time, and this
 * route takes exactly one id. There is no list form, no select-all and no
 * autosave: a decision about Tuesday's lunch says nothing about Tuesday's
 * dinner, and one wrong line does not cost the whole plan.
 *
 * The free-from swap comes through here too, because it is a decision about one
 * meal like any other. It moves the meal onto the snapshot computed from the
 * alternative ingredient rows, so the macronutrients that come back are
 * recomputed figures and not adjusted ones.
 */
export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  let body: { id?: unknown; state?: unknown; lactoseFree?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.nutrition.bodyDetail);
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (id === '') return refuse(422, strings.api.nutrition.noMeal, strings.api.nutrition.noMealDetail);

  if (typeof body.lactoseFree === 'boolean') {
    const row = await setMealLactoseFree(id, body.lactoseFree);
    if (!row) {
      return refuse(
        422,
        strings.api.nutrition.noAlternative,
        strings.api.nutrition.noAlternativeDetail,
      );
    }
    return ok({ meal: { id: row.id, lactoseFree: row.lactoseFree, snapshotId: row.snapshotId } });
  }

  const state = typeof body.state === 'string' ? body.state : '';
  if (!MEAL_STATES.includes(state as MealState)) {
    return refuse(422, strings.api.nutrition.badState, strings.api.nutrition.badStateDetail);
  }

  const row = await setMealState(id, state as MealState);
  if (!row) return refuse(404, strings.api.nutrition.noMeal, strings.api.nutrition.noMealDetail);
  return ok({ meal: { id: row.id, state: row.state } });
}
