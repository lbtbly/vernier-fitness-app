import { strings } from '@/lib/strings';

/**
 * The alias layer: everyday English on one side, an Anses row on the other.
 *
 * The research note calls this the one thing worth hand-curating, and it is
 * right. Anses names its rows in French at laboratory length, so the row behind
 * "Chicken breast" reads "Poulet, filet sans peau cru" and the row behind
 * "Frozen blueberries" reads "Myrtille, surgelee, crue". That is translation
 * work, not nutrition work, and it is where the user-visible quality lives.
 *
 * IT IS CODE AND NOT A TABLE ON PURPOSE. Every field here is either copy, which
 * belongs in the string catalogue behind a key, or a fact about how a shop
 * sells a thing, which is reference data this product authored. Neither is
 * owner data, neither is ever edited from a screen, and putting it in a table
 * would only mean seeding a table from a file at boot to get back to where this
 * already is. What DOES go in a table is the Anses row it points at, because
 * that is 3,483 rows of somebody else's data with a licence and a version.
 *
 * `lactoseFree` is the whole of F85's mechanism. Every dairy alias names the
 * alias that replaces it, the replacement is a real Anses row with its own real
 * numbers, and swapping recomputes the recipe from those numbers rather than
 * adjusting the old ones. Two of the three alternatives here have a different
 * energy, a different protein and a different fibre from the item they replace,
 * and one of them has no published fibre at all, which is why the swap renders
 * a fibre coverage that moved.
 */

export type Aisle = 'produce' | 'fish_meat' | 'dairy_chilled' | 'dry_goods' | 'store_cupboard';

export type ShopUnit = 'g' | 'kg' | 'count';

/**
 * What a person can react to, named as its own token.
 *
 * Deliberately not a free-form string: an allergen is matched against a stored
 * rule and a typo in one of the two would silently stop matching, which on
 * shellfish is the failure mode F84 exists to prevent.
 */
export type Allergen = 'shellfish' | 'nuts' | 'gluten' | 'lactose' | 'egg' | 'fish';

export type FoodAlias = {
  id: string;
  nameKey: keyof typeof strings.nutrition.foods;
  /** The Anses alim_code. The food row's id is `ciqual:` and this. */
  ciqual: string;
  aisle: Aisle;
  unit: ShopUnit;
  /** Grams in one of them, when the shop sells them one at a time. */
  itemGrams?: number;
  countNoun?: keyof typeof strings.nutrition.countNouns;
  /** The pack the shop actually sells, in grams. A list rounds up to it. */
  packGrams?: number;
  /** The step the quantity control moves by, in grams or in items. */
  step: number;
  allergens: Allergen[];
  dairy?: true;
  /** The alias that replaces this one for a lactose intolerance. */
  lactoseFree?: string;
};

const ALIASES: FoodAlias[] = [
  // Produce
  { id: 'spinach', nameKey: 'spinach', ciqual: '20059', aisle: 'produce', unit: 'g', packGrams: 200, step: 100, allergens: [] },
  { id: 'broccoli', nameKey: 'broccoli', ciqual: '20057', aisle: 'produce', unit: 'count', itemGrams: 300, countNoun: 'heads', step: 1, allergens: [] },
  { id: 'potatoes', nameKey: 'potatoes', ciqual: '4008', aisle: 'produce', unit: 'kg', packGrams: 1500, step: 100, allergens: [] },
  { id: 'green-beans', nameKey: 'greenBeans', ciqual: '20061', aisle: 'produce', unit: 'g', packGrams: 250, step: 100, allergens: [] },
  { id: 'courgette', nameKey: 'courgette', ciqual: '20020', aisle: 'produce', unit: 'count', itemGrams: 200, countNoun: 'items', step: 1, allergens: [] },
  { id: 'peppers', nameKey: 'peppers', ciqual: '20041', aisle: 'produce', unit: 'count', itemGrams: 150, countNoun: 'items', step: 1, allergens: [] },
  { id: 'onion', nameKey: 'onion', ciqual: '20034', aisle: 'produce', unit: 'count', itemGrams: 110, countNoun: 'items', step: 1, allergens: [] },
  { id: 'cauliflower', nameKey: 'cauliflower', ciqual: '20016', aisle: 'produce', unit: 'count', itemGrams: 600, countNoun: 'heads', step: 1, allergens: [] },
  { id: 'tomatoes', nameKey: 'tomatoes', ciqual: '20276', aisle: 'produce', unit: 'g', packGrams: 500, step: 100, allergens: [] },
  { id: 'apple', nameKey: 'apple', ciqual: '13039', aisle: 'produce', unit: 'count', itemGrams: 180, countNoun: 'items', step: 1, allergens: [] },
  { id: 'banana', nameKey: 'banana', ciqual: '13005', aisle: 'produce', unit: 'count', itemGrams: 120, countNoun: 'items', step: 1, allergens: [] },
  { id: 'raspberries', nameKey: 'raspberries', ciqual: '13015', aisle: 'produce', unit: 'g', packGrams: 125, step: 125, allergens: [] },
  { id: 'dill', nameKey: 'dill', ciqual: '11093', aisle: 'produce', unit: 'count', itemGrams: 20, countNoun: 'bunches', step: 1, allergens: [] },

  // Fish and meat
  { id: 'salmon', nameKey: 'salmon', ciqual: '26036', aisle: 'fish_meat', unit: 'count', itemGrams: 130, countNoun: 'fillets', step: 1, allergens: ['fish'] },
  { id: 'chicken-breast', nameKey: 'chickenBreast', ciqual: '36017', aisle: 'fish_meat', unit: 'g', packGrams: 400, step: 100, allergens: [] },
  { id: 'tinned-tuna', nameKey: 'tinnedTuna', ciqual: '26039', aisle: 'fish_meat', unit: 'count', itemGrams: 120, countNoun: 'tins', step: 1, allergens: ['fish'] },
  /*
   * The two the exclusion has to have something to exclude.
   *
   * F84 asks for a generated four-week menu with zero shellfish matches, and a
   * denylist run over a catalogue that never had shellfish in it is a check
   * that passes by not checking. This run has hit that failure seven times. So
   * the catalogue carries three real shellfish recipes, the generator refuses
   * them, and tests/unit/dietary-rules.test.ts proves the refusal by removing
   * the rule and watching them come back.
   */
  { id: 'prawns', nameKey: 'prawns', ciqual: '10007', aisle: 'fish_meat', unit: 'g', packGrams: 200, step: 100, allergens: ['shellfish'] },
  { id: 'mussels', nameKey: 'mussels', ciqual: '10013', aisle: 'fish_meat', unit: 'g', packGrams: 500, step: 250, allergens: ['shellfish'] },

  // Dairy and chilled
  { id: 'greek-yoghurt', nameKey: 'greekYoghurt', ciqual: '19860', aisle: 'dairy_chilled', unit: 'g', packGrams: 500, step: 100, allergens: ['lactose'], dairy: true, lactoseFree: 'soya-yoghurt' },
  { id: 'semi-skimmed-milk', nameKey: 'semiSkimmedMilk', ciqual: '19041', aisle: 'dairy_chilled', unit: 'g', packGrams: 1000, step: 100, allergens: ['lactose'], dairy: true, lactoseFree: 'almond-drink' },
  { id: 'fromage-blanc', nameKey: 'fromageBlanc', ciqual: '19644', aisle: 'dairy_chilled', unit: 'g', packGrams: 500, step: 100, allergens: ['lactose'], dairy: true, lactoseFree: 'plant-dessert' },
  { id: 'eggs', nameKey: 'eggs', ciqual: '22000', aisle: 'dairy_chilled', unit: 'count', itemGrams: 50, countNoun: 'eggs', step: 1, allergens: ['egg'] },
  { id: 'soya-yoghurt', nameKey: 'soyaYoghurt', ciqual: '19693', aisle: 'dairy_chilled', unit: 'g', packGrams: 400, step: 100, allergens: [] },
  { id: 'almond-drink', nameKey: 'almondDrink', ciqual: '18107', aisle: 'dairy_chilled', unit: 'g', packGrams: 1000, step: 100, allergens: ['nuts'] },
  /*
   * The plant dessert Anses publishes no fibre for. It is the lactose-free
   * alternative to fromage blanc, and it is chosen for that job deliberately:
   * swapping to it drops the recipe's fibre coverage, so the swap that F85
   * measures and the "unknown" that F78 measures meet on one real screen
   * instead of on two contrived ones.
   */
  { id: 'plant-dessert', nameKey: 'plantDessert', ciqual: '20927', aisle: 'dairy_chilled', unit: 'g', packGrams: 400, step: 100, allergens: [] },

  // Dry goods
  { id: 'rolled-oats', nameKey: 'rolledOats', ciqual: '32140', aisle: 'dry_goods', unit: 'g', packGrams: 500, step: 100, allergens: ['gluten'] },
  { id: 'polenta', nameKey: 'polenta', ciqual: '9614', aisle: 'dry_goods', unit: 'g', packGrams: 500, step: 100, allergens: [] },
  { id: 'white-rice', nameKey: 'whiteRice', ciqual: '9100', aisle: 'dry_goods', unit: 'kg', packGrams: 1000, step: 100, allergens: [] },
  { id: 'quinoa', nameKey: 'quinoa', ciqual: '9340', aisle: 'dry_goods', unit: 'g', packGrams: 500, step: 100, allergens: [] },
  { id: 'bulgur', nameKey: 'bulgur', ciqual: '9690', aisle: 'dry_goods', unit: 'g', packGrams: 500, step: 100, allergens: ['gluten'] },
  { id: 'red-lentils', nameKey: 'redLentils', ciqual: '20535', aisle: 'dry_goods', unit: 'g', packGrams: 500, step: 100, allergens: [] },
  { id: 'chickpeas', nameKey: 'chickpeas', ciqual: '20532', aisle: 'dry_goods', unit: 'count', itemGrams: 240, countNoun: 'tins', step: 1, allergens: [] },
  { id: 'walnuts', nameKey: 'walnuts', ciqual: '15005', aisle: 'dry_goods', unit: 'g', packGrams: 200, step: 100, allergens: ['nuts'] },
  { id: 'almonds', nameKey: 'almonds', ciqual: '15000', aisle: 'dry_goods', unit: 'g', packGrams: 200, step: 100, allergens: ['nuts'] },
  /*
   * Anses publishes no energy for the frozen berry, so the seed computes one by
   * the EU 1169/2011 factors and marks it. It is in the catalogue because F79
   * asks for that marker to be visible one tap from the number on a screen, and
   * a marker that only ever appears on a food nobody eats is a marker nobody
   * sees. Frozen berries are what a person actually buys in August.
   */
  { id: 'frozen-blueberries', nameKey: 'frozenBlueberries', ciqual: '13132', aisle: 'dry_goods', unit: 'g', packGrams: 300, step: 100, allergens: [] },
  { id: 'sun-dried-tomatoes', nameKey: 'sunDriedTomatoes', ciqual: '20189', aisle: 'dry_goods', unit: 'g', packGrams: 100, step: 50, allergens: [] },

  // Store cupboard
  { id: 'olive-oil', nameKey: 'oliveOil', ciqual: '17270', aisle: 'store_cupboard', unit: 'g', packGrams: 750, step: 100, allergens: [] },
  { id: 'turmeric', nameKey: 'turmeric', ciqual: '11089', aisle: 'store_cupboard', unit: 'g', packGrams: 40, step: 10, allergens: [] },
  { id: 'cumin', nameKey: 'cumin', ciqual: '11042', aisle: 'store_cupboard', unit: 'g', packGrams: 40, step: 10, allergens: [] },
  { id: 'curry-powder', nameKey: 'curryPowder', ciqual: '11005', aisle: 'store_cupboard', unit: 'g', packGrams: 40, step: 10, allergens: [] },
];

const BY_ID = new Map(ALIASES.map((alias) => [alias.id, alias]));

export function allAliases(): FoodAlias[] {
  return ALIASES;
}

export function aliasById(id: string): FoodAlias | null {
  return BY_ID.get(id) ?? null;
}

/** The Anses row id this alias points at, in the shape the food table uses. */
export function aliasFoodId(alias: FoodAlias): string {
  return `ciqual:${alias.ciqual}`;
}

/** The name a person reads. Always through the catalogue, never a column. */
export function aliasName(alias: FoodAlias): string {
  return strings.nutrition.foods[alias.nameKey];
}

/** The name a person reads, from an id, or null when nothing is registered. */
export function aliasNameById(id: string): string | null {
  const alias = aliasById(id);
  return alias ? aliasName(alias) : null;
}

/**
 * The aisles, in the order a shop is walked rather than in alphabetical order.
 * Produce first because it is by the door and it bruises last in the trolley.
 */
export const AISLE_ORDER: Aisle[] = [
  'produce',
  'fish_meat',
  'dairy_chilled',
  'dry_goods',
  'store_cupboard',
];

export function aisleLabel(aisle: Aisle): string {
  return strings.nutrition.aisles[aisle];
}
