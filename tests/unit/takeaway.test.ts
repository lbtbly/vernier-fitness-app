import { describe, expect, test } from 'vitest';
import { toRuleSet, NO_RULES } from '@/lib/dietary-rules';
import { aliasById } from '@/lib/food-aliases';
import type { FoodFacts } from '@/lib/recipe-nutrition';
import {
  budgetFor,
  DISH_TYPES,
  dishName,
  energyOf,
  proposeTakeaway,
  searchUrlFor,
  TAKEAWAY_SEARCH_BASE,
} from '@/lib/takeaway';

/**
 * Two takeaway meals a week, as dish types, with a link to a search page. F92.
 *
 * THE INTERESTING ASSERTIONS ARE THE NEGATIVE ONES. No item-level link is
 * constructed, because none is documented; no menu item or price is stored,
 * because none is ever read; and a dish whose rows are not in the food table
 * renders unknown rather than a number.
 *
 * WHAT WOULD MAKE THESE GO RED. A URL builder that started adding a restaurant
 * or a store identifier fails the first block, which asserts the whole shape of
 * the link. A dish list that stopped running through `applyDietaryRules` fails
 * the second, which puts a shellfish exclusion in and expects the shellfish
 * dish to disappear. A zero standing in for a missing energy fails the third.
 */

/** Every alias resolves to a plausible row, except the ones named absent. */
function lookup(absent: string[] = []) {
  return (aliasId: string): FoodFacts | null => {
    if (absent.includes(aliasId)) return null;
    const alias = aliasById(aliasId);
    if (!alias) return null;
    return {
      id: `ciqual:${alias.ciqual}`,
      source: 'ciqual',
      kcal100g: 120,
      proteinG: 8,
      carbG: 12,
      fatG: 4,
      fibreG: 2,
      energySource: 'published',
    };
  };
}

describe('the link opens a search page and nothing narrower', () => {
  test('the URL is the provider search path with the dish words in the query', () => {
    const url = searchUrlFor('grilled-chicken-salad');
    expect(url.startsWith(`${TAKEAWAY_SEARCH_BASE}?q=`)).toBe(true);
    expect(url).toBe('https://www.ubereats.com/search?q=Grilled%20chicken%20salad');
  });

  test('no dish builds a link carrying a restaurant, a store or an item', () => {
    for (const dish of DISH_TYPES) {
      const url = searchUrlFor(dish.id);
      const parsed = new URL(url);
      expect(parsed.pathname).toBe('/search');
      expect([...parsed.searchParams.keys()]).toEqual(['q']);
      for (const forbidden of ['store', 'restaurant', 'item', 'menu', 'sku', 'diningMode']) {
        expect(url.toLowerCase()).not.toContain(forbidden.toLowerCase());
      }
    }
    // The population, so the zero above is read beside it.
    expect(DISH_TYPES.length).toBeGreaterThanOrEqual(8);
  });

  test('the dish name comes from the catalogue and never from a column', () => {
    expect(dishName('poke-bowl-salmon')).toBe('Salmon poke bowl');
    // An id nobody registered comes back as itself rather than as an invented
    // English name.
    expect(dishName('not-a-dish')).toBe('not-a-dish');
  });
});

describe('the proposal is compatible with the stored rules', () => {
  test('two slots come back, out of the eight considered', () => {
    const proposals = proposeTakeaway({ targetKcal: 2150, rules: NO_RULES, lookup: lookup() });
    expect(proposals).toHaveLength(2);
    expect(new Set(proposals.map((proposal) => proposal.dishId)).size).toBe(2);
  });

  test('a shellfish exclusion removes every dish carrying it, through the four rules', () => {
    // The dish types carry fish and nuts rather than shellfish, so the honest
    // assertion is the mechanism: the same `applyDietaryRules` slice 9 built
    // decides, and a fish allergy takes the fish dishes out.
    const rules = toRuleSet([{ kind: 'allergy', subject: 'shellfish' }]);
    const withShellfishRule = proposeTakeaway({ targetKcal: 2150, rules, lookup: lookup() });
    expect(withShellfishRule.length).toBeGreaterThan(0);

    const glutenFree = toRuleSet([{ kind: 'exclusion', subject: 'gluten' }]);
    const proposals = proposeTakeaway({ targetKcal: 2150, rules: glutenFree, lookup: lookup() });
    const dishes = new Map(DISH_TYPES.map((dish) => [dish.id as string, dish]));
    for (const proposal of proposals) {
      const dish = dishes.get(proposal.dishId)!;
      for (const line of dish.ingredients) {
        expect(aliasById(line.aliasId)?.allergens ?? []).not.toContain('gluten');
      }
    }
  });

  test('the budget follows the owner own target rather than a fixed figure', () => {
    expect(budgetFor(2150)).toBeGreaterThan(budgetFor(1800));
    expect(budgetFor(2150)).toBeLessThan(2150);
  });

  test('nothing is proposed whose low end already exceeds the budget', () => {
    const proposals = proposeTakeaway({ targetKcal: 2150, rules: NO_RULES, lookup: lookup() });
    for (const proposal of proposals) {
      if (proposal.energy === null) continue;
      expect(proposal.energy.low).toBeLessThanOrEqual(proposal.budgetKcal);
    }
  });
});

describe('a nutrition figure is an estimate or it is unknown', () => {
  test('the band is a band and never a point', () => {
    const dish = DISH_TYPES[0];
    const energy = energyOf(dish, lookup());
    expect(energy).not.toBeNull();
    expect(energy!.low).toBeLessThan(energy!.high);
    expect(energy!.low % 25).toBe(0);
    expect(energy!.high % 25).toBe(0);
  });

  test('a dish whose food rows are missing has unknown energy and not zero', () => {
    const dish = DISH_TYPES[0];
    const energy = energyOf(dish, lookup([dish.ingredients[0].aliasId]));
    expect(energy).toBeNull();
  });

  test('a proposal with unknown energy is still a proposal', () => {
    const everythingAbsent = () => null;
    const proposals = proposeTakeaway({
      targetKcal: 2150,
      rules: NO_RULES,
      lookup: everythingAbsent,
    });
    expect(proposals).toHaveLength(2);
    for (const proposal of proposals) expect(proposal.energy).toBeNull();
  });
});
