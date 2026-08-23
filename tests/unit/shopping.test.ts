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
import { RECIPE_CATALOGUE } from '@/lib/recipe-catalogue';
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

/**
 * THE WHOLE SHIPPED CATALOGUE, THROUGH THE BUILDER, AGAINST THE COLUMNS.
 *
 * F88's end-to-end walk builds a week, confirms it and reads the list back, and
 * when it came back empty the report said only `waiting for
 * locator('[data-aisle]')`. Nothing in the unit suite could have caught a
 * catalogue entry that cannot become a `shopping_item` row, because every test
 * above builds a list out of two or three hand-written lines.
 *
 * So this one takes every ingredient of every recipe the product actually
 * ships, puts them all through the same builder, and checks each item against
 * the four CHECK constraints `shopping_item` carries in 0007_wave_a.sql. A row
 * that violates one of them does not become a refused line: the whole insert
 * throws inside the confirm route, the route answers 500, and the owner gets an
 * empty shopping list with no line missing from it, which is the failure that
 * says the least about itself of any in this product.
 *
 * It also refuses an unknown alias, because an ingredient the alias layer does
 * not name is bought by nobody: it is silently absent from the list and the
 * only trace is a string in a response body no screen reads.
 *
 * GOES RED IF: a recipe names an alias that does not exist, an alias in `count`
 * loses its noun, a pack size or an item weight goes to zero so a quantity
 * rounds to nothing, or an alias lands in an aisle the shopping screen does not
 * draw. Each of those ships a catalogue the product cannot shop from.
 */
describe('every recipe this product ships can become a shopping list', () => {
  test('all of it at once, checked against the columns the rows have to fit', () => {
    const wanted: WantedLine[] = [];
    RECIPE_CATALOGUE.forEach((entry, index) => {
      for (const ingredient of entry.ingredients) {
        wanted.push({
          aliasId: ingredient.aliasId,
          grams: ingredient.grams,
          plannedMealId: `${entry.id}@${index}`,
          boxSupplied: ingredient.boxSupplied === true,
          dayIndex: index % 7,
        });
      }
    });

    const { items, unknownAliases } = buildShoppingList(wanted, []);
    // The population, printed beside every count below it.
    console.log(
      `${RECIPE_CATALOGUE.length} recipes, ${wanted.length} ingredient lines, ` +
        `${items.length} shopping lines, ${unknownAliases.length} unknown alias(es)`,
    );
    expect(RECIPE_CATALOGUE.length).toBeGreaterThan(0);
    expect(wanted.length).toBeGreaterThan(0);
    expect(items.length).toBeGreaterThan(0);
    expect(unknownAliases, `recipes name aliases that do not exist: ${unknownAliases.join(', ')}`)
      .toEqual([]);

    const faults: string[] = [];
    for (const item of items) {
      // shopping_item_unit_is_known
      if (!['g', 'kg', 'count'].includes(item.unit)) {
        faults.push(`${item.aliasId}: unit ${item.unit} is not one the column takes`);
      }
      // shopping_item_quantities_are_positive
      if (!(item.quantity > 0)) faults.push(`${item.aliasId}: quantity ${item.quantity}`);
      if (!(item.neededQuantity > 0)) faults.push(`${item.aliasId}: needed ${item.neededQuantity}`);
      // shopping_item_count_names_its_noun
      if ((item.unit === 'count') !== (item.countNoun !== null)) {
        faults.push(`${item.aliasId}: unit ${item.unit} with noun ${String(item.countNoun)}`);
      }
      // shopping_item_deduction_is_known
      if (!['none', 'box', 'stock'].includes(item.deduction)) {
        faults.push(`${item.aliasId}: deduction ${item.deduction}`);
      }
      // And the screen only draws the aisles it was given, so a line in any
      // other aisle exists in the database and on no page.
      if (!AISLE_ORDER.includes(item.aisle)) {
        faults.push(`${item.aliasId}: aisle ${item.aisle} is not drawn by the shopping screen`);
      }
    }
    for (const fault of faults) console.log(`fault  ${fault}`);
    expect(faults).toEqual([]);

    // And the noun a count line carries is a catalogue key, never the word, so
    // the constraint being satisfied is not the same as the screen having words
    // to print.
    const counted = items.filter((item) => item.unit === 'count');
    console.log(`${counted.length} of ${items.length} lines are counted rather than weighed`);
    for (const item of counted) {
      expect(
        Object.keys(strings.nutrition.countNouns),
        `${item.aliasId} counts in "${item.countNoun}", which is not a catalogued noun`,
      ).toContain(item.countNoun);
    }
  });
});
