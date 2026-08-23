import { type RuleCandidate, type RuleSet, applyDietaryRules } from '@/lib/dietary-rules';
import { aliasById, aliasFoodId } from '@/lib/food-aliases';
import { roundEnergy } from '@/lib/macros';
import { NUTRITION } from '@/lib/nutrition';
import { computeRecipeNutrition, type FoodFacts } from '@/lib/recipe-nutrition';
import { strings } from '@/lib/strings';

/**
 * Two takeaway meals a week, proposed as KINDS OF DISH and never as items on
 * somebody's menu.
 *
 * WHAT THIS FILE DELIBERATELY CANNOT DO. It cannot name a restaurant, quote a
 * price, or build a link to an item, because none of those can be obtained
 * lawfully: the provider has no public consumer API, publishes no deep-link
 * format for its food product, and its terms prohibit scraping and bulk
 * collection. `.forge/research/scout.md`, verified 2026-08-21, is the source
 * and `docs/product.md` records it with its date. So the whole of the
 * integration is one link to the provider's own search page with words in the
 * query, which is a thing any browser could be typed into by hand.
 *
 * WHERE THE NUMBERS COME FROM. Not from a menu, because no menu was read. Each
 * dish type names a handful of aliases and typical cooked weights, the energy
 * is summed off the same Anses rows the recipes use, and the band is as wide as
 * a photo estimate because a portion cooked by a stranger is at least as
 * uncertain as one on your own plate. A dish whose rows are not in the food
 * table renders "unknown", never a zero.
 */

export type DishType = {
  id: keyof typeof strings.meals.dishes;
  /** The plate, as aliases and typical cooked grams. */
  ingredients: { aliasId: string; grams: number }[];
};

/**
 * Eight dish types, chosen so the four rules have something to do: two carry
 * shellfish-free fish, one carries nuts, two carry gluten, one carries dairy,
 * and three carry none of the four subjects at all.
 */
export const DISH_TYPES: DishType[] = [
  {
    id: 'grilled-chicken-salad',
    ingredients: [
      { aliasId: 'chicken-breast', grams: 130 },
      { aliasId: 'tomatoes', grams: 80 },
      { aliasId: 'spinach', grams: 60 },
      { aliasId: 'olive-oil', grams: 14 },
    ],
  },
  {
    id: 'poke-bowl-salmon',
    ingredients: [
      { aliasId: 'salmon', grams: 120 },
      { aliasId: 'white-rice', grams: 180 },
      { aliasId: 'courgette', grams: 60 },
      { aliasId: 'olive-oil', grams: 10 },
    ],
  },
  {
    id: 'chicken-shawarma-plate',
    ingredients: [
      { aliasId: 'chicken-breast', grams: 150 },
      { aliasId: 'bulgur', grams: 150 },
      { aliasId: 'tomatoes', grams: 70 },
      { aliasId: 'olive-oil', grams: 14 },
    ],
  },
  {
    id: 'falafel-mezze',
    ingredients: [
      { aliasId: 'chickpeas', grams: 180 },
      { aliasId: 'bulgur', grams: 120 },
      { aliasId: 'tomatoes', grams: 80 },
      { aliasId: 'olive-oil', grams: 20 },
    ],
  },
  {
    id: 'vegetable-curry-rice',
    ingredients: [
      { aliasId: 'chickpeas', grams: 150 },
      { aliasId: 'white-rice', grams: 200 },
      { aliasId: 'cauliflower', grams: 120 },
      { aliasId: 'curry-powder', grams: 6 },
    ],
  },
  {
    id: 'grilled-fish-vegetables',
    ingredients: [
      { aliasId: 'salmon', grams: 140 },
      { aliasId: 'green-beans', grams: 120 },
      { aliasId: 'potatoes', grams: 180 },
      { aliasId: 'olive-oil', grams: 14 },
    ],
  },
  {
    id: 'lentil-soup-bread',
    ingredients: [
      { aliasId: 'red-lentils', grams: 120 },
      { aliasId: 'onion', grams: 60 },
      { aliasId: 'tomatoes', grams: 100 },
      { aliasId: 'olive-oil', grams: 10 },
    ],
  },
  {
    id: 'roast-chicken-potatoes',
    ingredients: [
      { aliasId: 'chicken-breast', grams: 160 },
      { aliasId: 'potatoes', grams: 220 },
      { aliasId: 'broccoli', grams: 100 },
      { aliasId: 'olive-oil', grams: 14 },
    ],
  },
];

export function dishName(id: string): string {
  const names = strings.meals.dishes as Record<string, string>;
  return names[id] ?? id;
}

/**
 * The provider's own search page, with the dish words in the query.
 *
 * ONE HOST, ONE PATH, ONE PARAMETER, and 10-meals.sql refuses to store anything
 * else. There is no restaurant id, no item id and no store slug here, because
 * no format for any of them is documented and inventing one would be a guess
 * against terms that prohibit exactly that kind of guessing.
 */
export const TAKEAWAY_SEARCH_BASE = 'https://www.ubereats.com/search';

export function searchUrlFor(dishId: string): string {
  return `${TAKEAWAY_SEARCH_BASE}?q=${encodeURIComponent(dishName(dishId))}`;
}

/**
 * The share of a day's energy a takeaway meal is proposed against.
 *
 * A takeaway stands in for the evening meal, and the evening meal is the
 * largest of the three in this plan. It is a share and not a fixed figure so it
 * follows the owner's own target: a person on 2,150 kcal and a person on 1,800
 * do not want the same dish proposed.
 */
export const TAKEAWAY_SHARE_OF_DAY = 0.35;

export function budgetFor(targetKcal: number): number {
  return Math.round(targetKcal * TAKEAWAY_SHARE_OF_DAY);
}

export type DishEnergy = { low: number; high: number } | null;

/**
 * The band, computed off the food table and widened like any other estimate.
 *
 * Null when the rows behind the dish do not carry energy, which is how "unknown"
 * reaches the screen. A dish with no numbers is still a proposal: what it is
 * not is a number this product made up.
 */
export function energyOf(dish: DishType, lookup: (aliasId: string) => FoodFacts | null): DishEnergy {
  const computed = computeRecipeNutrition(
    dish.ingredients.map((line) => ({
      aliasId: line.aliasId,
      grams: line.grams,
      food: lookup(line.aliasId),
    })),
    1,
  );
  const kcal = computed.perServing.kcal;
  if (kcal === null || computed.unresolvedCount > 0) return null;
  return {
    low: roundEnergy(kcal * NUTRITION.photoEstimateBand.low, 'estimated'),
    high: roundEnergy(kcal * NUTRITION.photoEstimateBand.high, 'estimated'),
  };
}

export function foodIdOf(aliasId: string): string | null {
  const alias = aliasById(aliasId);
  return alias ? aliasFoodId(alias) : null;
}

export type Proposal = {
  dishId: string;
  searchUrl: string;
  energy: DishEnergy;
  budgetKcal: number;
};

/**
 * Two proposals, compatible with the stored targets and the stored rules.
 *
 * THE RULES RUN THROUGH `applyDietaryRules` AND NOWHERE ELSE. Slice 9 built the
 * four verbs and F84 says no query path resolves one as another, so a takeaway
 * matcher of its own would be exactly the second matcher that line forbids. A
 * dish type is a `RuleCandidate` like a recipe is, and the same four functions
 * refuse, omit, substitute and rank it.
 *
 * COMPATIBLE MEANS IT CAN FIT. A dish whose low end is already over the budget
 * cannot, whatever the owner orders. The rest are ordered by how close the
 * middle of the band sits to the budget, so the first two are the two that fit
 * best rather than the two that come first alphabetically.
 */
export function proposeTakeaway(input: {
  targetKcal: number;
  rules: RuleSet;
  lookup: (aliasId: string) => FoodFacts | null;
  count?: number;
}): Proposal[] {
  const budgetKcal = budgetFor(input.targetKcal);
  const candidates: RuleCandidate[] = DISH_TYPES.map((dish) => ({
    id: dish.id,
    cookMinutes: 0,
    slot: 'dinner',
    ingredients: dish.ingredients,
  }));

  const outcome = applyDietaryRules(candidates, input.rules);
  const allowedIds = new Set(outcome.candidates.map((candidate) => candidate.id));
  const order = new Map(outcome.candidates.map((candidate, index) => [candidate.id, index]));

  const scored = DISH_TYPES.filter((dish) => allowedIds.has(dish.id))
    .map((dish) => {
      const energy = energyOf(dish, input.lookup);
      return { dish, energy };
    })
    .filter((entry) => entry.energy === null || entry.energy.low <= budgetKcal)
    .sort((left, right) => {
      const distance = (energy: DishEnergy) =>
        energy === null ? Number.MAX_SAFE_INTEGER : Math.abs((energy.low + energy.high) / 2 - budgetKcal);
      const byFit = distance(left.energy) - distance(right.energy);
      if (byFit !== 0) return byFit;
      // The preference ranking decides a tie, so a taste the owner recorded
      // still moves the order when two dishes fit the budget equally well.
      return (order.get(left.dish.id) ?? 0) - (order.get(right.dish.id) ?? 0);
    });

  return scored.slice(0, input.count ?? 2).map((entry) => ({
    dishId: entry.dish.id,
    searchUrl: searchUrlFor(entry.dish.id),
    energy: entry.energy,
    budgetKcal,
  }));
}
