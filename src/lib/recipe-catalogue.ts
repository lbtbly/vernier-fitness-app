import type { strings } from '@/lib/strings';

/**
 * The recipes Vernier ships, as ingredient rows.
 *
 * COMPUTED FROM INGREDIENTS, NEVER TYPED AS A PER-SERVING FIGURE. The research
 * note settles it on measured grounds: Anses has 19 rows matching Indian
 * keywords and no naan, no paneer and no dal, so a dish-level lookup does not
 * exist for the food this owner eats, while the ingredient level covers all six
 * cuisines. A stored per-serving estimate beside a computed one would be a
 * second number that will disagree with the first and nobody will know which is
 * right, and it cannot answer "swap the rice for quinoa", which the plan has to
 * do.
 *
 * GRAMS ARE RAW WEIGHTS AGAINST RAW ANSES ROWS. Rice is 60 g of dry rice, not
 * 160 g of cooked, and the row behind it is "Riz blanc, cru". That is exact
 * arithmetic on what the shopping list buys and an approximation of what
 * reaches the plate: cooking absorbs oil and loses water, this version models
 * neither, and `strings.nutrition.rawWeightNote` says so on the screen rather
 * than in this comment alone.
 *
 * THREE OF THESE CONTAIN SHELLFISH, DELIBERATELY. F84 wants a four-week menu
 * with zero shellfish in it, and a denylist run over a catalogue that never had
 * any is a check that passes by not checking, which this run has now hit seven
 * times. The exclusion has something real to exclude, and the unit test proves
 * the mechanism by dropping the rule and watching all three come back.
 */

export type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type CatalogueIngredient = {
  aliasId: string;
  /** Grams for the whole recipe, across every serving it makes. */
  grams: number;
  /** True when a recipe box supplies it, so the shopping list deducts it. */
  boxSupplied?: true;
};

export type CatalogueRecipe = {
  id: string;
  nameKey: keyof typeof strings.nutrition.recipes;
  slot: Slot;
  servings: number;
  cookMinutes: number;
  origin: 'vernier' | 'recipe_box';
  ingredients: CatalogueIngredient[];
};

export const RECIPE_CATALOGUE: CatalogueRecipe[] = [
  // ---- Breakfast -------------------------------------------------------
  {
    id: 'vernier:greek-yoghurt-berries-walnuts',
    nameKey: 'greekYoghurtBerriesWalnuts',
    slot: 'breakfast',
    servings: 1,
    cookMinutes: 5,
    origin: 'vernier',
    ingredients: [
      { aliasId: 'greek-yoghurt', grams: 200 },
      { aliasId: 'frozen-blueberries', grams: 80 },
      { aliasId: 'walnuts', grams: 25 },
      { aliasId: 'rolled-oats', grams: 30 },
    ],
  },
  {
    id: 'vernier:oats-banana-almonds',
    nameKey: 'oatsBananaAlmonds',
    slot: 'breakfast',
    servings: 1,
    cookMinutes: 10,
    origin: 'vernier',
    ingredients: [
      { aliasId: 'rolled-oats', grams: 70 },
      { aliasId: 'banana', grams: 120 },
      { aliasId: 'almonds', grams: 15 },
      { aliasId: 'semi-skimmed-milk', grams: 200 },
    ],
  },
  {
    id: 'vernier:eggs-spinach-potatoes',
    nameKey: 'eggsSpinachPotatoes',
    slot: 'breakfast',
    servings: 1,
    cookMinutes: 15,
    origin: 'vernier',
    ingredients: [
      { aliasId: 'eggs', grams: 150 },
      { aliasId: 'spinach', grams: 80 },
      { aliasId: 'potatoes', grams: 200 },
      { aliasId: 'olive-oil', grams: 10 },
    ],
  },
  {
    id: 'vernier:fromage-blanc-apple-almonds',
    nameKey: 'fromageBlancAppleAlmonds',
    slot: 'breakfast',
    servings: 1,
    cookMinutes: 5,
    origin: 'vernier',
    ingredients: [
      { aliasId: 'fromage-blanc', grams: 250 },
      { aliasId: 'apple', grams: 180 },
      { aliasId: 'almonds', grams: 25 },
      { aliasId: 'rolled-oats', grams: 30 },
    ],
  },

  // ---- Lunch -----------------------------------------------------------
  {
    id: 'vernier:salmon-spinach-polenta',
    nameKey: 'salmonSpinachPolenta',
    slot: 'lunch',
    servings: 1,
    cookMinutes: 25,
    origin: 'vernier',
    ingredients: [
      { aliasId: 'salmon', grams: 150 },
      { aliasId: 'spinach', grams: 120 },
      { aliasId: 'polenta', grams: 60 },
      { aliasId: 'olive-oil', grams: 12 },
    ],
  },
  {
    id: 'vernier:chicken-quinoa-peppers',
    nameKey: 'chickenQuinoaPeppers',
    slot: 'lunch',
    servings: 1,
    cookMinutes: 30,
    origin: 'vernier',
    ingredients: [
      { aliasId: 'chicken-breast', grams: 170 },
      { aliasId: 'quinoa', grams: 70 },
      { aliasId: 'peppers', grams: 150 },
      { aliasId: 'olive-oil', grams: 12 },
    ],
  },
  {
    id: 'vernier:tuna-chickpea-tomato',
    nameKey: 'tunaChickpeaTomato',
    slot: 'lunch',
    servings: 1,
    cookMinutes: 15,
    origin: 'vernier',
    ingredients: [
      { aliasId: 'tinned-tuna', grams: 120 },
      { aliasId: 'chickpeas', grams: 200 },
      { aliasId: 'tomatoes', grams: 150 },
      { aliasId: 'sun-dried-tomatoes', grams: 25 },
      { aliasId: 'olive-oil', grams: 12 },
    ],
  },
  {
    id: 'vernier:chicken-bulgur-vegetables',
    nameKey: 'chickenBulgurVegetables',
    slot: 'lunch',
    servings: 1,
    cookMinutes: 30,
    origin: 'vernier',
    ingredients: [
      { aliasId: 'chicken-breast', grams: 160 },
      { aliasId: 'bulgur', grams: 70 },
      { aliasId: 'courgette', grams: 150 },
      { aliasId: 'peppers', grams: 100 },
      { aliasId: 'olive-oil', grams: 12 },
    ],
  },
  {
    id: 'vernier:prawn-quinoa-salad',
    nameKey: 'prawnQuinoaSalad',
    slot: 'lunch',
    servings: 1,
    cookMinutes: 15,
    origin: 'vernier',
    ingredients: [
      { aliasId: 'prawns', grams: 150 },
      { aliasId: 'quinoa', grams: 70 },
      { aliasId: 'tomatoes', grams: 120 },
      { aliasId: 'olive-oil', grams: 12 },
    ],
  },

  // ---- Dinner ----------------------------------------------------------
  {
    id: 'vernier:salmon-dill-potatoes',
    nameKey: 'salmonDillPotatoes',
    slot: 'dinner',
    servings: 2,
    cookMinutes: 30,
    origin: 'recipe_box',
    ingredients: [
      { aliasId: 'salmon', grams: 300, boxSupplied: true },
      { aliasId: 'potatoes', grams: 600 },
      { aliasId: 'green-beans', grams: 300, boxSupplied: true },
      { aliasId: 'dill', grams: 10, boxSupplied: true },
      { aliasId: 'olive-oil', grams: 20 },
    ],
  },
  {
    id: 'vernier:chicken-broccoli-traybake',
    nameKey: 'chickenBroccoliTraybake',
    slot: 'dinner',
    servings: 1,
    cookMinutes: 35,
    origin: 'vernier',
    ingredients: [
      { aliasId: 'chicken-breast', grams: 180 },
      { aliasId: 'broccoli', grams: 200 },
      { aliasId: 'potatoes', grams: 250 },
      { aliasId: 'olive-oil', grams: 14 },
    ],
  },
  {
    id: 'vernier:lentil-dal-cauliflower-rice',
    nameKey: 'lentilDalCauliflowerRice',
    slot: 'dinner',
    servings: 1,
    cookMinutes: 40,
    origin: 'vernier',
    ingredients: [
      { aliasId: 'red-lentils', grams: 90 },
      { aliasId: 'cauliflower', grams: 200 },
      { aliasId: 'white-rice', grams: 60 },
      { aliasId: 'onion', grams: 80 },
      { aliasId: 'turmeric', grams: 3 },
      { aliasId: 'cumin', grams: 2 },
      { aliasId: 'olive-oil', grams: 12 },
    ],
  },
  {
    id: 'vernier:polenta-vegetables-eggs',
    nameKey: 'polentaVegetablesEggs',
    slot: 'dinner',
    servings: 1,
    cookMinutes: 20,
    origin: 'vernier',
    ingredients: [
      { aliasId: 'polenta', grams: 70 },
      { aliasId: 'courgette', grams: 150 },
      { aliasId: 'peppers', grams: 120 },
      { aliasId: 'eggs', grams: 100 },
      { aliasId: 'olive-oil', grams: 12 },
    ],
  },
  {
    id: 'vernier:chicken-tikka-rice',
    nameKey: 'chickenTikkaRice',
    slot: 'dinner',
    servings: 2,
    cookMinutes: 40,
    origin: 'recipe_box',
    ingredients: [
      { aliasId: 'chicken-breast', grams: 340, boxSupplied: true },
      { aliasId: 'white-rice', grams: 130 },
      { aliasId: 'greek-yoghurt', grams: 160 },
      { aliasId: 'curry-powder', grams: 12, boxSupplied: true },
      { aliasId: 'onion', grams: 140 },
      { aliasId: 'olive-oil', grams: 20 },
    ],
  },
  {
    id: 'vernier:tuna-quinoa-green-beans',
    nameKey: 'tunaQuinoaGreenBeans',
    slot: 'dinner',
    servings: 1,
    cookMinutes: 20,
    origin: 'vernier',
    ingredients: [
      { aliasId: 'tinned-tuna', grams: 130 },
      { aliasId: 'quinoa', grams: 70 },
      { aliasId: 'green-beans', grams: 150 },
      { aliasId: 'olive-oil', grams: 12 },
    ],
  },
  {
    id: 'vernier:vegetable-frittata',
    nameKey: 'vegetableFrittata',
    slot: 'dinner',
    servings: 1,
    cookMinutes: 25,
    origin: 'vernier',
    ingredients: [
      { aliasId: 'eggs', grams: 200 },
      { aliasId: 'courgette', grams: 150 },
      { aliasId: 'peppers', grams: 100 },
      { aliasId: 'potatoes', grams: 150 },
      { aliasId: 'olive-oil', grams: 12 },
    ],
  },
  {
    id: 'vernier:prawn-courgette-rice',
    nameKey: 'prawnCourgetteRice',
    slot: 'dinner',
    servings: 1,
    cookMinutes: 20,
    origin: 'vernier',
    ingredients: [
      { aliasId: 'prawns', grams: 150 },
      { aliasId: 'courgette', grams: 200 },
      { aliasId: 'white-rice', grams: 65 },
      { aliasId: 'olive-oil', grams: 12 },
    ],
  },
  {
    id: 'vernier:mussels-potatoes',
    nameKey: 'musselsPotatoes',
    slot: 'dinner',
    servings: 1,
    cookMinutes: 30,
    origin: 'vernier',
    ingredients: [
      { aliasId: 'mussels', grams: 300 },
      { aliasId: 'potatoes', grams: 300 },
      { aliasId: 'onion', grams: 60 },
      { aliasId: 'olive-oil', grams: 12 },
    ],
  },

  // ---- Snack -----------------------------------------------------------
  {
    id: 'vernier:apple-almonds',
    nameKey: 'appleAlmonds',
    slot: 'snack',
    servings: 1,
    cookMinutes: 0,
    origin: 'vernier',
    ingredients: [
      { aliasId: 'apple', grams: 180 },
      { aliasId: 'almonds', grams: 30 },
    ],
  },
  {
    id: 'vernier:greek-yoghurt-walnuts',
    nameKey: 'greekYoghurtWalnuts',
    slot: 'snack',
    servings: 1,
    cookMinutes: 0,
    origin: 'vernier',
    ingredients: [
      { aliasId: 'greek-yoghurt', grams: 170 },
      { aliasId: 'walnuts', grams: 25 },
    ],
  },
  {
    id: 'vernier:banana-almonds',
    nameKey: 'bananaAlmonds',
    slot: 'snack',
    servings: 1,
    cookMinutes: 0,
    origin: 'vernier',
    ingredients: [
      { aliasId: 'banana', grams: 120 },
      { aliasId: 'almonds', grams: 25 },
    ],
  },
  {
    id: 'vernier:fromage-blanc-raspberries',
    nameKey: 'fromageBlancRaspberries',
    slot: 'snack',
    servings: 1,
    cookMinutes: 0,
    origin: 'vernier',
    ingredients: [
      { aliasId: 'fromage-blanc', grams: 250 },
      { aliasId: 'raspberries', grams: 125 },
      { aliasId: 'walnuts', grams: 20 },
    ],
  },
];

const BY_ID = new Map(RECIPE_CATALOGUE.map((recipe) => [recipe.id, recipe]));

export function catalogueRecipe(id: string): CatalogueRecipe | null {
  return BY_ID.get(id) ?? null;
}
