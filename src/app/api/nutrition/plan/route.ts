import {
  DEFAULT_MAX_COOK_MINUTES,
  confirmPlan,
  generateAndStoreWeek,
  nextWeekStart,
  readPlan,
  readTarget,
} from '@/db/nutrition';
import { buildListForPlan } from '@/db/shopping';
import { getConfig } from '@/lib/config';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * The week: generated, regenerated, or confirmed into a shopping list.
 *
 * Anti-forgery first, then the session, then the work. Same order as every
 * other mutating route here and there is no exemption list.
 *
 * Generating writes proposals and nothing else. Nothing on this route accepts a
 * meal: a meal is accepted on its own, through /api/nutrition/meal, which is
 * F86's "one at a time" and the reason there is no accept-all anywhere.
 */
const MIN_COOK = 10;
const MAX_COOK = 180;

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    console.error(`[vernier] /api/nutrition/plan failed: ${(error as Error).message}`);
    return refuse(500, strings.api.nutrition.generateFailed, strings.api.nutrition.generateFailedDetail);
  }
}

async function handle(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  let body: { action?: unknown; maxCookMinutes?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.nutrition.bodyDetail);
  }

  const { timeZone } = getConfig();
  const now = new Date();

  if (body.action === 'confirm') {
    const plan = await readPlan(nextWeekStart(now, timeZone));
    if (!plan) return refuse(409, strings.api.nutrition.noPlan, strings.api.nutrition.noPlanDetail);
    const confirmed = await confirmPlan(plan.id);
    const built = await buildListForPlan(plan.id);
    return ok({
      plan: confirmed ? { id: confirmed.id, state: confirmed.state } : null,
      list: { id: built.listId, items: built.items, unknownAliases: built.unknownAliases },
    });
  }

  const raw = body.maxCookMinutes;
  const minutes = typeof raw === 'number' ? raw : Number(typeof raw === 'string' ? raw : NaN);
  const maxCookMinutes = Number.isFinite(minutes) ? Math.round(minutes) : DEFAULT_MAX_COOK_MINUTES;
  if (maxCookMinutes < MIN_COOK || maxCookMinutes > MAX_COOK) {
    return refuse(422, strings.api.nutrition.badCookTime, strings.api.nutrition.badCookTimeDetail);
  }

  const target = await readTarget();
  const result = await generateAndStoreWeek({
    now,
    timeZone,
    maxCookMinutes,
    targetKcal: target?.kcalTarget ?? 2000,
  });

  if (result.outcome === 'empty_catalogue') {
    return refuse(
      422,
      strings.api.nutrition.emptyCatalogue,
      strings.api.nutrition.emptyCatalogueDetail,
      { poolSizes: result.week.poolSizes, catalogueSizes: result.week.catalogueSizes },
    );
  }
  if (result.outcome === 'over_limit') {
    // The second enforcement of the cooking limit, refusing the write rather
    // than shipping a 40-minute dinner onto a 20-minute Tuesday.
    return refuse(
      500,
      strings.api.nutrition.generateFailed,
      strings.api.nutrition.generateFailedDetail,
      { offenders: result.offenders.length },
    );
  }

  return ok({
    plan: { id: result.plan.id, generation: result.plan.generation, maxCookMinutes },
    meals: result.meals,
    poolSizes: result.week.poolSizes,
    catalogueSizes: result.week.catalogueSizes,
    refused: result.week.refused.length,
    omitted: result.week.omitted.length,
    substitutions: result.week.substitutions.length,
  });
}
