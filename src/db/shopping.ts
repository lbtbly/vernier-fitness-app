import { asc, eq, inArray } from 'drizzle-orm';
import { getDb } from './client';
import { readPlanMeals, readWantedIngredients } from './nutrition';
import { readRecipes } from './recipes';
import { shoppingItem, shoppingItemSource, shoppingList, stockItem } from './schema';
import { aliasById, aliasName, type Aisle, type ShopUnit } from '@/lib/food-aliases';
import { buildShoppingList, type Deduction, type StockHolding } from '@/lib/shopping';

/**
 * The shopping list, built from one confirmed week and kept across reloads.
 *
 * F88 asks for check boxes that survive a page reload, and they survive it by
 * being a column rather than a browser state: the phone posts a tick through
 * the same offline outbox every other write in this app uses, so a tick in a
 * shop with no signal lands on the phone first and uploads on the way out.
 *
 * F89 asks for deducted lines to stay visible with the original quantity struck
 * through. They do, and a rebuild keeps them: the rebuild preserves the tick on
 * every line whose ingredient and deduction are unchanged, so confirming one
 * more meal on a Sunday does not empty a trolley the owner already filled.
 */

export type ShoppingItemRow = typeof shoppingItem.$inferSelect;
export type StockRow = typeof stockItem.$inferSelect;

export async function readStock(): Promise<StockHolding[]> {
  const db = getDb();
  const rows = await db.select().from(stockItem);
  return rows.map((row) => ({
    aliasId: row.aliasId,
    quantity: row.quantity,
    unit: row.unit as ShopUnit,
  }));
}

export async function setStock(
  aliasId: string,
  quantity: number,
  unit: ShopUnit,
): Promise<boolean> {
  const db = getDb();
  const values = { id: `stock:${aliasId}`, aliasId, quantity, unit, markedAt: new Date() };
  await db
    .insert(stockItem)
    .values(values)
    .onConflictDoUpdate({ target: stockItem.aliasId, set: values });
  return true;
}

export async function clearStock(aliasId: string): Promise<boolean> {
  const db = getDb();
  const removed = await db
    .delete(stockItem)
    .where(eq(stockItem.aliasId, aliasId))
    .returning({ id: stockItem.id });
  return removed.length > 0;
}

export type BuildResult = {
  listId: string;
  items: number;
  /** Aliases the meals wanted that the alias layer does not know. Printed, not hidden. */
  unknownAliases: string[];
};

export async function buildListForPlan(planId: string): Promise<BuildResult> {
  const db = getDb();
  const wanted = await readWantedIngredients(planId);
  const stock = await readStock();
  const { items, unknownAliases } = buildShoppingList(wanted, stock);

  const listId = `list|${planId}`;
  await db
    .insert(shoppingList)
    .values({ id: listId, planId, builtAt: new Date() })
    .onConflictDoUpdate({ target: shoppingList.planId, set: { builtAt: new Date() } });

  // What the owner has already done to this list, kept across the rebuild.
  const previous = await db.select().from(shoppingItem).where(eq(shoppingItem.listId, listId));
  const kept = new Map(
    previous.map((row) => [
      `${row.aliasId}|${row.deduction}`,
      { checked: row.checked, checkedAt: row.checkedAt, quantity: row.quantity, removed: row.removed },
    ]),
  );

  const previousIds = previous.map((row) => row.id);
  if (previousIds.length > 0) {
    await db.delete(shoppingItemSource).where(inArray(shoppingItemSource.itemId, previousIds));
    await db.delete(shoppingItem).where(eq(shoppingItem.listId, listId));
  }

  for (const item of items) {
    const id = `${listId}|${item.aliasId}|${item.deduction}`;
    const carried = kept.get(`${item.aliasId}|${item.deduction}`);
    await db.insert(shoppingItem).values({
      id,
      listId,
      aliasId: item.aliasId,
      aisle: item.aisle,
      unit: item.unit,
      neededQuantity: item.neededQuantity,
      originalQuantity: item.quantity,
      quantity: carried?.quantity ?? item.quantity,
      countNoun: item.unit === 'count' ? item.countNoun : null,
      deduction: item.deduction,
      deductionDayIndex: item.deductionDayIndex,
      checked: item.deduction === 'none' ? (carried?.checked ?? false) : false,
      checkedAt: item.deduction === 'none' ? (carried?.checkedAt ?? null) : null,
      removed: carried?.removed ?? false,
      position: item.position,
    });
    if (item.sources.length > 0) {
      await db.insert(shoppingItemSource).values(
        item.sources.map((source, index) => ({
          id: `${id}#${index}`,
          itemId: id,
          plannedMealId: source.plannedMealId,
          grams: source.grams,
        })),
      );
    }
  }

  return { listId, items: items.length, unknownAliases };
}

export type ItemSourceView = {
  plannedMealId: string;
  recipeName: string;
  dayIndex: number;
  slot: string;
  grams: number;
};

export type ShoppingItemView = {
  id: string;
  aliasId: string;
  name: string;
  aisle: Aisle;
  unit: ShopUnit;
  neededQuantity: number;
  originalQuantity: number;
  quantity: number;
  countNoun: string | null;
  deduction: Deduction;
  deductionDayIndex: number | null;
  checked: boolean;
  removed: boolean;
  step: number;
  sources: ItemSourceView[];
};

export async function readListForPlan(planId: string): Promise<{
  listId: string;
  builtAt: Date;
  items: ShoppingItemView[];
} | null> {
  const db = getDb();
  const [list] = await db.select().from(shoppingList).where(eq(shoppingList.planId, planId));
  if (!list) return null;

  const rows = await db
    .select()
    .from(shoppingItem)
    .where(eq(shoppingItem.listId, list.id))
    .orderBy(asc(shoppingItem.position));
  const sources = await db
    .select()
    .from(shoppingItemSource)
    .where(inArray(shoppingItemSource.itemId, rows.map((row) => row.id).concat(['none'])));

  const meals = await readPlanMeals(planId);
  const recipes = await readRecipes();
  const recipeById = new Map(recipes.map((view) => [view.id, view]));
  const mealById = new Map(meals.map((meal) => [meal.id, meal]));

  const sourcesByItem = new Map<string, ItemSourceView[]>();
  for (const source of sources) {
    const meal = mealById.get(source.plannedMealId);
    if (!meal) continue;
    const view = recipeById.get(meal.recipeId);
    if (!view) continue;
    const list_ = sourcesByItem.get(source.itemId) ?? [];
    list_.push({
      plannedMealId: source.plannedMealId,
      recipeName: view.name,
      dayIndex: meal.dayIndex,
      slot: meal.slot,
      grams: source.grams,
    });
    sourcesByItem.set(source.itemId, list_);
  }

  return {
    listId: list.id,
    builtAt: list.builtAt,
    items: rows.map((row) => {
      const alias = aliasById(row.aliasId);
      return {
        id: row.id,
        aliasId: row.aliasId,
        // Through the catalogue, always. The column holds an id and never a word.
        name: alias ? aliasName(alias) : row.aliasId,
        aisle: row.aisle as Aisle,
        unit: row.unit as ShopUnit,
        neededQuantity: row.neededQuantity,
        originalQuantity: row.originalQuantity,
        quantity: row.quantity,
        countNoun: row.countNoun,
        deduction: row.deduction as Deduction,
        deductionDayIndex: row.deductionDayIndex,
        checked: row.checked,
        removed: row.removed,
        step: alias ? (alias.unit === 'kg' ? alias.step / 1000 : alias.step) : 1,
        sources: sourcesByItem.get(row.id) ?? [],
      };
    }),
  };
}

export async function readItem(id: string): Promise<ShoppingItemRow | null> {
  const db = getDb();
  const [row] = await db.select().from(shoppingItem).where(eq(shoppingItem.id, id));
  return row ?? null;
}

export async function setItemChecked(id: string, checked: boolean): Promise<ShoppingItemRow | null> {
  const db = getDb();
  const [row] = await db
    .update(shoppingItem)
    .set({ checked, checkedAt: checked ? new Date() : null })
    .where(eq(shoppingItem.id, id))
    .returning();
  return row ?? null;
}

export async function setItemQuantity(id: string, quantity: number): Promise<ShoppingItemRow | null> {
  const db = getDb();
  const [row] = await db
    .update(shoppingItem)
    .set({ quantity })
    .where(eq(shoppingItem.id, id))
    .returning();
  return row ?? null;
}

export async function setItemRemoved(id: string, removed: boolean): Promise<ShoppingItemRow | null> {
  const db = getDb();
  const [row] = await db
    .update(shoppingItem)
    .set({ removed })
    .where(eq(shoppingItem.id, id))
    .returning();
  return row ?? null;
}

/**
 * One line the owner added by hand, which the week did not ask for.
 *
 * It joins the list at the end of its aisle with no meal behind it, and a
 * rebuild keeps it the way it keeps a tick: same ingredient, same deduction,
 * same row. It is not a deduction and never can be, because nothing supplied
 * it: the owner wants it.
 */
export async function addItem(
  listId: string,
  aliasId: string,
  quantity: number,
): Promise<ShoppingItemRow | null> {
  const alias = aliasById(aliasId);
  if (!alias) return null;
  const db = getDb();
  const rows = await db.select().from(shoppingItem).where(eq(shoppingItem.listId, listId));
  const position = rows.reduce((highest, row) => Math.max(highest, row.position), 0) + 1;
  const [row] = await db
    .insert(shoppingItem)
    .values({
      id: `${listId}|${alias.id}|none`,
      listId,
      aliasId: alias.id,
      aisle: alias.aisle,
      unit: alias.unit,
      neededQuantity: quantity,
      originalQuantity: quantity,
      quantity,
      countNoun: alias.unit === 'count' ? (alias.countNoun ?? null) : null,
      deduction: 'none',
      deductionDayIndex: null,
      checked: false,
      removed: false,
      position,
    })
    .onConflictDoNothing({ target: shoppingItem.id })
    .returning();
  return row ?? null;
}
