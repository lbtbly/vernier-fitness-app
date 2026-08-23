import { AISLE_ORDER, aliasById, type Aisle, type FoodAlias, type ShopUnit } from '@/lib/food-aliases';
import { strings } from '@/lib/strings';

/**
 * The week, consolidated into one list, grouped the way the shop is laid out,
 * with what the recipe box brings and what is already in the cupboard visibly
 * deducted rather than silently removed.
 *
 * F89 IS THE WHOLE SHAPE OF THIS FILE. A deducted line does not disappear: it
 * keeps its place, keeps its quantity, and gets struck through with the reason
 * beside it. A line that vanishes is a line nobody can check, and the entire
 * value of a deduction is that the owner sees it happen instead of trusting
 * that it did. That is why an ingredient the box partly supplies becomes TWO
 * lines and not one line with a subtraction hidden inside it, which is exactly
 * what screen 10 draws: salmon bought for Friday on one line, salmon the box
 * brings on Monday struck through on the next.
 */

export type WantedLine = {
  aliasId: string;
  grams: number;
  plannedMealId: string;
  boxSupplied: boolean;
  dayIndex: number;
};

export type StockHolding = { aliasId: string; quantity: number; unit: ShopUnit };

export type Deduction = 'none' | 'box' | 'stock';

export type BuiltItem = {
  aliasId: string;
  aisle: Aisle;
  unit: ShopUnit;
  /** What the meals need, in the display unit, before any rounding. */
  neededQuantity: number;
  /** What the list says to get, rounded up to something a shop sells. */
  quantity: number;
  countNoun: string | null;
  deduction: Deduction;
  deductionDayIndex: number | null;
  sources: { plannedMealId: string; grams: number }[];
  position: number;
};

/** Grams to the unit the line is read in. Mass in g or kg, or a count of items. */
export function toDisplayQuantity(alias: FoodAlias, grams: number): number {
  if (alias.unit === 'count') return grams / (alias.itemGrams ?? 1);
  if (alias.unit === 'kg') return grams / 1000;
  return grams;
}

/**
 * Rounds up to something the shop actually sells.
 *
 * Up and never down, because a list that rounds 1.1 kg of potatoes down to a
 * 1 kg bag is a list that sends the owner home short on a Tuesday. The wireframe
 * draws this decision on the line itself: "1.1 kg needed, 1.5 kg bag".
 */
export function roundToShopUnit(alias: FoodAlias, grams: number): number {
  if (alias.unit === 'count') {
    return Math.max(1, Math.ceil(grams / (alias.itemGrams ?? 1)));
  }
  const pack = alias.packGrams ?? 1;
  const packs = Math.max(1, Math.ceil(grams / pack));
  const rounded = packs * pack;
  return alias.unit === 'kg' ? rounded / 1000 : rounded;
}

/** How much of an alias a stock holding covers, in grams. */
export function stockGrams(alias: FoodAlias, holding: StockHolding): number {
  if (holding.unit === 'count') return holding.quantity * (alias.itemGrams ?? 1);
  if (holding.unit === 'kg') return holding.quantity * 1000;
  return holding.quantity;
}

const AISLE_RANK = new Map(AISLE_ORDER.map((aisle, index) => [aisle, index]));

/**
 * Builds the list.
 *
 * Every wanted line is bucketed by ingredient and by whether the box supplies
 * it, which yields at most two rows per ingredient. The bought row is then
 * checked against the cupboard: a holding that covers the whole of it turns the
 * row into a stock deduction, and a holding that covers part of it does not,
 * because "you have some of this" is not an instruction and pretending it is
 * would be the app assuming the cupboard on the owner's behalf.
 */
export function buildShoppingList(
  wanted: WantedLine[],
  stock: StockHolding[],
): { items: BuiltItem[]; unknownAliases: string[] } {
  const stockByAlias = new Map(stock.map((holding) => [holding.aliasId, holding]));
  const buckets = new Map<string, { alias: FoodAlias; box: boolean; grams: number; days: number[]; sources: { plannedMealId: string; grams: number }[] }>();
  const unknownAliases: string[] = [];

  for (const line of wanted) {
    const alias = aliasById(line.aliasId);
    if (!alias) {
      if (!unknownAliases.includes(line.aliasId)) unknownAliases.push(line.aliasId);
      continue;
    }
    const key = `${alias.id}|${line.boxSupplied ? 'box' : 'buy'}`;
    const bucket = buckets.get(key) ?? {
      alias,
      box: line.boxSupplied,
      grams: 0,
      days: [],
      sources: [],
    };
    bucket.grams += line.grams;
    bucket.days.push(line.dayIndex);
    bucket.sources.push({ plannedMealId: line.plannedMealId, grams: line.grams });
    buckets.set(key, bucket);
  }

  const items: BuiltItem[] = [];
  for (const bucket of buckets.values()) {
    const { alias } = bucket;
    const needed = toDisplayQuantity(alias, bucket.grams);
    const quantity = roundToShopUnit(alias, bucket.grams);

    let deduction: Deduction = bucket.box ? 'box' : 'none';
    if (!bucket.box) {
      const holding = stockByAlias.get(alias.id);
      if (holding && stockGrams(alias, holding) >= bucket.grams) deduction = 'stock';
    }

    items.push({
      aliasId: alias.id,
      aisle: alias.aisle,
      unit: alias.unit,
      neededQuantity: needed,
      quantity,
      countNoun: alias.countNoun ?? null,
      deduction,
      deductionDayIndex: bucket.box ? Math.min(...bucket.days) : null,
      sources: bucket.sources,
      position: 0,
    });
  }

  items.sort((left, right) => {
    const aisle = (AISLE_RANK.get(left.aisle) ?? 99) - (AISLE_RANK.get(right.aisle) ?? 99);
    if (aisle !== 0) return aisle;
    // Bought lines first inside an aisle, deducted ones under them, so the
    // rows a person has to act on are the rows at the top of the card.
    if (left.deduction !== right.deduction) return left.deduction === 'none' ? -1 : 1;
    return left.aliasId.localeCompare(right.aliasId);
  });
  items.forEach((item, index) => {
    item.position = index;
  });

  return { items, unknownAliases };
}

const NUMBER = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

/** "1.5 kg", "400 g", "12 eggs". Never a millilitre, and never a bare number. */
export function quantityText(item: {
  quantity: number;
  unit: ShopUnit;
  countNoun: string | null;
}): string {
  if (item.unit === 'count') {
    const noun = item.countNoun
      ? (strings.nutrition.countNouns as Record<string, string>)[item.countNoun] ??
        strings.nutrition.countNouns.items
      : strings.nutrition.countNouns.items;
    return strings.nutrition.quantityCount(NUMBER.format(item.quantity), noun);
  }
  const unit = item.unit === 'kg' ? strings.units.kg : strings.units.g;
  return strings.nutrition.quantityMass(NUMBER.format(item.quantity), unit);
}

export type AisleGroup = { aisle: Aisle; items: BuiltItem[] };

/** The list, in aisle order, with an empty aisle left out rather than drawn. */
export function groupByAisle<T extends { aisle: Aisle }>(items: T[]): { aisle: Aisle; items: T[] }[] {
  const groups: { aisle: Aisle; items: T[] }[] = [];
  for (const aisle of AISLE_ORDER) {
    const inAisle = items.filter((item) => item.aisle === aisle);
    if (inAisle.length > 0) groups.push({ aisle, items: inAisle });
  }
  return groups;
}

export type ListCounts = { toBuy: number; deducted: number; inTrolley: number; total: number };

/**
 * The three numbers at the head of the list.
 *
 * `toBuy` counts what is still to find, which is the number the owner is
 * actually shopping against. A deducted line is neither to buy nor in the
 * trolley: it is covered, and it is counted on its own so the head of the list
 * adds up to what is on the screen.
 */
export function countList(
  items: { deduction: Deduction; checked: boolean; removed: boolean }[],
): ListCounts {
  const live = items.filter((item) => !item.removed);
  const deducted = live.filter((item) => item.deduction !== 'none').length;
  const inTrolley = live.filter((item) => item.deduction === 'none' && item.checked).length;
  return {
    toBuy: live.length - deducted - inTrolley,
    deducted,
    inTrolley,
    total: live.length,
  };
}
