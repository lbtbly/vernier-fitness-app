import { describe, expect, test } from 'vitest';
import { AISLE_ORDER, aliasById } from '@/lib/food-aliases';
import {
  buildShoppingList,
  countList,
  groupByAisle,
  quantityText,
  roundToShopUnit,
  stockGrams,
  toDisplayQuantity,
  type StockHolding,
  type WantedLine,
} from '@/lib/shopping';
import { strings } from '@/lib/strings';

/**
 * The shopping list, graded against F88 and F89.
 *
 * F88: one list grouped by aisle, with adjustable quantities and check boxes.
 * F89: items supplied by the recipe box and items marked in stock render as
 * VISIBLY DEDUCTED, showing the original quantity struck through, RATHER THAN
 * DISAPPEARING FROM THE LIST.
 *
 * WHAT WOULD MAKE THESE GO RED. Filtering a box-supplied or in-stock line out of
 * the built list is the obvious implementation and it fails every deduction test
 * below: the assertions look for the row, not for its absence. Rounding a
 * quantity down to the nearest pack fails the rounding test, which is the
 * difference between a full trolley and a Tuesday night without potatoes.
 */

function line(overrides: Partial<WantedLine> = {}): WantedLine {
  return {
    aliasId: 'potatoes',
    grams: 600,
    plannedMealId: 'meal-1',
    boxSupplied: false,
    dayIndex: 0,
    ...overrides,
  };
}

describe('consolidation', () => {
  test('the same ingredient across three meals becomes one line', () => {
    const { items } = buildShoppingList(
      [
        line({ grams: 600, plannedMealId: 'meal-1' }),
        line({ grams: 500, plannedMealId: 'meal-2' }),
        line({ grams: 250, plannedMealId: 'meal-3' }),
      ],
      [],
    );
    expect(items.length).toBe(1);
    expect(items[0].sources.length).toBe(3);
    // 1.35 kg needed, rounded up to a 1.5 kg bag.
    expect(items[0].neededQuantity).toBeCloseTo(1.35, 5);
    expect(items[0].quantity).toBe(1.5);
  });

  test('an unknown ingredient is reported rather than dropped in silence', () => {
    const { items, unknownAliases } = buildShoppingList([line({ aliasId: 'unobtainium' })], []);
    expect(items.length).toBe(0);
    expect(unknownAliases).toEqual(['unobtainium']);
  });

  test('the list is grouped in the order a shop is walked, not alphabetically', () => {
    const { items } = buildShoppingList(
      [
        line({ aliasId: 'olive-oil', grams: 100 }),
        line({ aliasId: 'salmon', grams: 300 }),
        line({ aliasId: 'spinach', grams: 200 }),
      ],
      [],
    );
    const groups = groupByAisle(items);
    expect(groups.map((group) => group.aisle)).toEqual(['produce', 'fish_meat', 'store_cupboard']);
    expect(AISLE_ORDER[0]).toBe('produce');
  });
});

describe('rounding up to something a shop sells', () => {
  test('mass rounds up to a whole pack, never down', () => {
    const potatoes = aliasById('potatoes');
    expect(potatoes).toBeTruthy();
    if (!potatoes) return;
    expect(roundToShopUnit(potatoes, 1100)).toBe(1.5);
    expect(roundToShopUnit(potatoes, 1500)).toBe(1.5);
    expect(roundToShopUnit(potatoes, 1600)).toBe(3);
  });

  test('a countable thing rounds up to a whole one', () => {
    const eggs = aliasById('eggs');
    expect(eggs).toBeTruthy();
    if (!eggs) return;
    // 150 g of egg is three eggs at 50 g each.
    expect(roundToShopUnit(eggs, 150)).toBe(3);
    expect(roundToShopUnit(eggs, 151)).toBe(4);
    expect(toDisplayQuantity(eggs, 150)).toBe(3);
  });

  test('a quantity is never a millilitre and never a bare number', () => {
    expect(quantityText({ quantity: 1.5, unit: 'kg', countNoun: null })).toBe(
      `1.5 ${strings.units.kg}`,
    );
    expect(quantityText({ quantity: 400, unit: 'g', countNoun: null })).toBe(
      `400 ${strings.units.g}`,
    );
    expect(quantityText({ quantity: 12, unit: 'count', countNoun: 'eggs' })).toBe(
      `12 ${strings.nutrition.countNouns.eggs}`,
    );
  });
});

describe('F89: a deducted line stays on the list', () => {
  test('a box-supplied ingredient gets its own row rather than vanishing', () => {
    const { items } = buildShoppingList(
      [
        line({ aliasId: 'salmon', grams: 300, boxSupplied: true, dayIndex: 0, plannedMealId: 'box' }),
        line({ aliasId: 'salmon', grams: 150, boxSupplied: false, dayIndex: 4, plannedMealId: 'own' }),
      ],
      [],
    );
    expect(items.length).toBe(2);
    const box = items.find((item) => item.deduction === 'box');
    const buy = items.find((item) => item.deduction === 'none');
    expect(box).toBeTruthy();
    expect(buy).toBeTruthy();
    // The deducted row keeps a real quantity, which is what gets struck through.
    expect(box?.quantity).toBeGreaterThan(0);
    expect(box?.deductionDayIndex).toBe(0);
    expect(buy?.quantity).toBeGreaterThan(0);
  });

  test('an ingredient the cupboard fully covers is deducted, not removed', () => {
    const stock: StockHolding[] = [{ aliasId: 'potatoes', quantity: 2, unit: 'kg' }];
    const { items } = buildShoppingList([line({ grams: 600 })], stock);
    expect(items.length).toBe(1);
    expect(items[0].deduction).toBe('stock');
    expect(items[0].quantity).toBeGreaterThan(0);
  });

  test('a cupboard that covers only part of it deducts nothing, because part is not an instruction', () => {
    const stock: StockHolding[] = [{ aliasId: 'potatoes', quantity: 200, unit: 'g' }];
    const { items } = buildShoppingList([line({ grams: 600 })], stock);
    expect(items[0].deduction).toBe('none');
  });

  test('stock converts to grams the same way the alias measures', () => {
    const potatoes = aliasById('potatoes');
    const eggs = aliasById('eggs');
    if (!potatoes || !eggs) throw new Error('missing alias');
    expect(stockGrams(potatoes, { aliasId: 'potatoes', quantity: 1.5, unit: 'kg' })).toBe(1500);
    expect(stockGrams(eggs, { aliasId: 'eggs', quantity: 6, unit: 'count' })).toBe(300);
  });

  test('bought lines sort above deducted ones inside an aisle', () => {
    const { items } = buildShoppingList(
      [
        line({ aliasId: 'salmon', grams: 300, boxSupplied: true }),
        line({ aliasId: 'salmon', grams: 150, boxSupplied: false }),
      ],
      [],
    );
    const fish = items.filter((item) => item.aisle === 'fish_meat');
    expect(fish[0].deduction).toBe('none');
    expect(fish[1].deduction).toBe('box');
  });
});

describe('the three counts at the head of the list', () => {
  test('to buy, deducted and in the trolley add up to what is on the screen', () => {
    const counts = countList([
      { deduction: 'none', checked: false, removed: false },
      { deduction: 'none', checked: true, removed: false },
      { deduction: 'box', checked: false, removed: false },
      { deduction: 'stock', checked: false, removed: false },
      { deduction: 'none', checked: false, removed: true },
    ]);
    expect(counts.total).toBe(4);
    expect(counts.toBuy).toBe(1);
    expect(counts.inTrolley).toBe(1);
    expect(counts.deducted).toBe(2);
    expect(counts.toBuy + counts.inTrolley + counts.deducted).toBe(counts.total);
  });

  test('a deducted line is never counted as being in the trolley', () => {
    const counts = countList([{ deduction: 'box', checked: true, removed: false }]);
    expect(counts.inTrolley).toBe(0);
    expect(counts.deducted).toBe(1);
  });
});
