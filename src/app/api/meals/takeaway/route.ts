import { readProposals, writeProposals } from '@/db/box';
import { aliasFoodLookup } from '@/db/foods';
import { nextWeekStart, readRules, readTarget } from '@/db/nutrition';
import { getConfig } from '@/lib/config';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { DISH_TYPES, proposeTakeaway } from '@/lib/takeaway';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * Two takeaway slots for the week, proposed on demand.
 *
 * On demand and never on a schedule, which is the same rule the recipe box
 * follows and for the same reason: nothing in this repository fetches from
 * either provider, and the only thing that happens here is arithmetic over the
 * owner's own target, his own four rules and this build's own dish types.
 *
 * NOTHING IS FETCHED, NOTHING IS SCRAPED, NO MENU IS READ. What is stored is a
 * dish type, a search URL and an energy band computed off Anses rows. The check
 * constraint in 10-meals.sql refuses a stored link that is not a search page.
 */
export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  const { timeZone } = getConfig();
  const target = await readTarget();
  if (!target) {
    return refuse(422, strings.api.targets.noBody, strings.api.targets.noBodyDetail);
  }

  const rules = await readRules();
  const aliasIds = DISH_TYPES.flatMap((dish) => dish.ingredients.map((line) => line.aliasId));
  const lookup = await aliasFoodLookup(aliasIds);
  const proposals = proposeTakeaway({ targetKcal: target.kcalTarget, rules, lookup });

  const weekStart = nextWeekStart(new Date(), timeZone);
  const written = await writeProposals(weekStart, proposals);

  return ok({
    proposals: written.map((row) => ({
      position: row.position,
      dishId: row.dishId,
      searchUrl: row.searchUrl,
      kcalLow: row.kcalLow,
      kcalHigh: row.kcalHigh,
    })),
    // The population the two came out of, so a pair of proposals is never read
    // as "these were the only two dishes".
    consideredDishTypes: DISH_TYPES.length,
  });
}

export async function GET() {
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;
  const { timeZone } = getConfig();
  const rows = await readProposals(nextWeekStart(new Date(), timeZone));
  return ok({ proposals: rows.length, consideredDishTypes: DISH_TYPES.length });
}
