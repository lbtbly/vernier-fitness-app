import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from './client';
import { readFoods } from './foods';
import { recipe, recipeIngredient, recipeNutrition, recipeQuestion } from './schema';
import { aliasById, aliasFoodId } from '@/lib/food-aliases';
import { RECIPE_CATALOGUE, type Slot } from '@/lib/recipe-catalogue';
import {
  computeRecipeNutrition,
  type IngredientLine,
  type RecipeNutrition,
} from '@/lib/recipe-nutrition';
import { strings } from '@/lib/strings';

/**
 * The recipe catalogue and its snapshots.
 *
 * Seeded at boot beside the food table, because a plan needs something to plan
 * from and a shipped catalogue is reference data rather than a demonstration.
 * Every recipe is stored as ingredient rows and its nutrition is computed from
 * them, never typed in: the research measured that Anses has no dish-level row
 * for most of what this owner eats, and a hand-typed per-serving figure beside a
 * computed one is a second number that will disagree with the first.
 *
 * A CHANGED SOURCE HASH RAISES A QUESTION AND NEVER REPLACES A SNAPSHOT. That
 * is F87's last clause and it is the quiet half of the panel's unapproved-write
 * risk: an event in a calendar nobody approved is loud, and a recipe silently
 * serving last month's macros has a longer fuse. The trigger in 0009 refuses the
 * overwrite in the database, and `refreshSnapshots` below opens a question the
 * owner answers.
 */

export type Variant = 'base' | 'lactose_free';

export type RecipeRow = typeof recipe.$inferSelect;
export type SnapshotRow = typeof recipeNutrition.$inferSelect;

/** The recipe's name, from the catalogue when Vernier wrote it. */
export function recipeName(row: { nameKey: string | null; name: string | null }): string {
  if (row.nameKey) {
    const names = strings.nutrition.recipes as Record<string, string>;
    return names[row.nameKey] ?? row.nameKey;
  }
  return row.name ?? '';
}

/** The ingredient list for a variant, with the free-from swaps already applied. */
export function variantIngredients(
  ingredients: { aliasId: string; grams: number; boxSupplied: boolean }[],
  variant: Variant,
): { aliasId: string; grams: number; boxSupplied: boolean }[] {
  if (variant === 'base') return ingredients;
  return ingredients.map((line) => {
    const alias = aliasById(line.aliasId);
    return alias?.lactoseFree ? { ...line, aliasId: alias.lactoseFree } : line;
  });
}

/** True when this recipe has a dairy item with an alternative stored. */
export function hasLactoseFreeVariant(ingredients: { aliasId: string }[]): boolean {
  return ingredients.some((line) => aliasById(line.aliasId)?.lactoseFree !== undefined);
}

export async function seedRecipeCatalogue(): Promise<{ recipes: number; written: number }> {
  const db = getDb();
  let written = 0;
  for (const entry of RECIPE_CATALOGUE) {
    const inserted = await db
      .insert(recipe)
      .values({
        id: entry.id,
        nameKey: entry.nameKey,
        name: null,
        servings: entry.servings,
        cookMinutes: entry.cookMinutes,
        slot: entry.slot,
        origin: entry.origin,
        originRef: null,
      })
      .onConflictDoNothing({ target: recipe.id })
      .returning({ id: recipe.id });
    if (inserted.length === 0) continue;
    written += 1;
    await db.insert(recipeIngredient).values(
      entry.ingredients.map((line, position) => {
        const alias = aliasById(line.aliasId);
        return {
          id: `${entry.id}#${position}`,
          recipeId: entry.id,
          aliasId: line.aliasId,
          // Null when the alias layer names nothing, which the snapshot then
          // counts as unresolved rather than quietly leaving out of the sum.
          foodId: alias ? aliasFoodId(alias) : null,
          grams: line.grams,
          position,
          boxSupplied: line.boxSupplied === true,
        };
      }),
    );
  }
  return { recipes: RECIPE_CATALOGUE.length, written };
}

export type RecipeView = {
  id: string;
  name: string;
  nameKey: string | null;
  slot: Slot;
  servings: number;
  cookMinutes: number;
  origin: string;
  ingredients: { id: string; aliasId: string; foodId: string | null; grams: number; boxSupplied: boolean }[];
};

export async function readRecipes(): Promise<RecipeView[]> {
  const db = getDb();
  const rows = await db.select().from(recipe).orderBy(asc(recipe.id));
  const lines = await db.select().from(recipeIngredient).orderBy(asc(recipeIngredient.position));
  const byRecipe = new Map<string, RecipeView['ingredients']>();
  for (const line of lines) {
    const list = byRecipe.get(line.recipeId) ?? [];
    list.push({
      id: line.id,
      aliasId: line.aliasId,
      foodId: line.foodId,
      grams: line.grams,
      boxSupplied: line.boxSupplied,
    });
    byRecipe.set(line.recipeId, list);
  }
  return rows.map((row) => ({
    id: row.id,
    name: recipeName(row),
    nameKey: row.nameKey,
    slot: row.slot as Slot,
    servings: row.servings,
    cookMinutes: row.cookMinutes,
    origin: row.origin,
    ingredients: byRecipe.get(row.id) ?? [],
  }));
}

export async function readRecipe(id: string): Promise<RecipeView | null> {
  const all = await readRecipes();
  return all.find((row) => row.id === id) ?? null;
}

/**
 * Resolves a recipe's ingredient lines against the food table.
 *
 * An alias with no row behind it comes back with `food: null` and is counted as
 * unresolved by the sum, which drops the coverage. It is not dropped from the
 * list, because a recipe whose numbers cover 82 percent of its mass has to say
 * 82 and not a number it has not earned.
 */
export async function resolveIngredients(
  ingredients: { aliasId: string; grams: number }[],
): Promise<IngredientLine[]> {
  const ids: string[] = [];
  for (const line of ingredients) {
    const alias = aliasById(line.aliasId);
    if (alias) ids.push(aliasFoodId(alias));
  }
  const foods = await readFoods(ids);
  return ingredients.map((line) => {
    const alias = aliasById(line.aliasId);
    const row = alias ? foods.get(aliasFoodId(alias)) : undefined;
    return {
      aliasId: line.aliasId,
      grams: line.grams,
      food: row
        ? {
            id: row.id,
            source: row.source,
            kcal100g: row.kcal100g,
            proteinG: row.proteinG,
            carbG: row.carbG,
            fatG: row.fatG,
            fibreG: row.fibreG,
            energySource: row.energySource,
          }
        : null,
    };
  });
}

export async function computeVariant(
  view: RecipeView,
  variant: Variant,
): Promise<RecipeNutrition> {
  const lines = variantIngredients(view.ingredients, variant);
  const resolved = await resolveIngredients(lines);
  return computeRecipeNutrition(resolved, view.servings);
}

export async function readCurrentSnapshot(
  recipeId: string,
  variant: Variant,
): Promise<SnapshotRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(recipeNutrition)
    .where(
      and(
        eq(recipeNutrition.recipeId, recipeId),
        eq(recipeNutrition.variant, variant),
        isNull(recipeNutrition.supersededAt),
      ),
    );
  return row ?? null;
}

export async function readCurrentSnapshots(): Promise<Map<string, SnapshotRow>> {
  const db = getDb();
  const rows = await db
    .select()
    .from(recipeNutrition)
    .where(isNull(recipeNutrition.supersededAt));
  return new Map(rows.map((row) => [`${row.recipeId}|${row.variant}`, row]));
}

function snapshotValues(
  recipeId: string,
  variant: Variant,
  version: number,
  computed: RecipeNutrition,
): typeof recipeNutrition.$inferInsert {
  return {
    id: `${recipeId}|${variant}|v${version}`,
    recipeId,
    variant,
    version,
    perServingKcal: computed.perServing.kcal,
    perServingProteinG: computed.perServing.proteinG,
    perServingCarbG: computed.perServing.carbG,
    perServingFatG: computed.perServing.fatG,
    perServingFibreG: computed.perServing.fibreG,
    provenance: computed.provenance,
    coveragePct: computed.coveragePct,
    fibreCoveragePct: computed.fibreCoveragePct,
    sourceFoodIdsHash: computed.sourceFoodIdsHash,
    computedEnergyCount: computed.computedEnergyCount,
    ingredientCount: computed.ingredientCount,
    unresolvedCount: computed.unresolvedCount,
  };
}

/**
 * Writes the first snapshot for a recipe and variant, and does nothing at all
 * when one already stands. A boot never walks over a stored figure.
 */
export async function ensureSnapshot(view: RecipeView, variant: Variant): Promise<boolean> {
  const existing = await readCurrentSnapshot(view.id, variant);
  if (existing) return false;
  const computed = await computeVariant(view, variant);
  const db = getDb();
  const [{ highest }] = await db
    .select({ highest: sql<number>`coalesce(max(${recipeNutrition.version}), 0)::int` })
    .from(recipeNutrition)
    .where(and(eq(recipeNutrition.recipeId, view.id), eq(recipeNutrition.variant, variant)));
  await db
    .insert(recipeNutrition)
    .values(snapshotValues(view.id, variant, Number(highest) + 1, computed))
    .onConflictDoNothing();
  return true;
}

export async function ensureAllSnapshots(): Promise<{ recipes: number; written: number }> {
  const views = await readRecipes();
  let written = 0;
  for (const view of views) {
    if (await ensureSnapshot(view, 'base')) written += 1;
    if (hasLactoseFreeVariant(view.ingredients) && (await ensureSnapshot(view, 'lactose_free'))) {
      written += 1;
    }
  }
  return { recipes: views.length, written };
}

/**
 * Walks every stored snapshot and compares its hash against the rows behind it
 * right now.
 *
 * A MISMATCH RAISES A QUESTION AND WRITES NOTHING ELSE. The stored figures do
 * not move, the plan that used them does not move, and the owner is told which
 * recipe changed and what the two hashes are. Recomputing is his call, made on
 * a screen, and it writes a new version rather than editing the old one.
 */
export async function refreshSnapshots(): Promise<{ walked: number; questions: number }> {
  const db = getDb();
  const views = await readRecipes();
  const current = await readCurrentSnapshots();
  let walked = 0;
  let questions = 0;

  for (const view of views) {
    for (const variant of ['base', 'lactose_free'] as Variant[]) {
      const snapshot = current.get(`${view.id}|${variant}`);
      if (!snapshot) continue;
      walked += 1;
      const computed = await computeVariant(view, variant);
      if (computed.sourceFoodIdsHash === snapshot.sourceFoodIdsHash) continue;
      const raised = await db
        .insert(recipeQuestion)
        .values({
          id: `question|${view.id}|${variant}|${computed.sourceFoodIdsHash}`,
          recipeId: view.id,
          snapshotId: snapshot.id,
          storedHash: snapshot.sourceFoodIdsHash,
          incomingHash: computed.sourceFoodIdsHash,
        })
        .onConflictDoNothing()
        .returning({ id: recipeQuestion.id });
      questions += raised.length;
    }
  }
  return { walked, questions };
}

export type QuestionView = {
  id: string;
  recipeId: string;
  recipeName: string;
  storedHash: string;
  incomingHash: string;
  raisedAt: Date;
};

export async function readOpenQuestions(): Promise<QuestionView[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: recipeQuestion.id,
      recipeId: recipeQuestion.recipeId,
      storedHash: recipeQuestion.storedHash,
      incomingHash: recipeQuestion.incomingHash,
      raisedAt: recipeQuestion.raisedAt,
      nameKey: recipe.nameKey,
      name: recipe.name,
    })
    .from(recipeQuestion)
    .innerJoin(recipe, eq(recipe.id, recipeQuestion.recipeId))
    .where(eq(recipeQuestion.state, 'open'))
    .orderBy(desc(recipeQuestion.raisedAt));
  return rows.map((row) => ({
    id: row.id,
    recipeId: row.recipeId,
    recipeName: recipeName(row),
    storedHash: row.storedHash,
    incomingHash: row.incomingHash,
    raisedAt: row.raisedAt,
  }));
}

/**
 * Answers a question. Keeping is a decision and is recorded as one; recomputing
 * supersedes the standing snapshot and writes the next version beside it.
 */
export async function answerQuestion(
  id: string,
  answer: 'recomputed' | 'kept',
): Promise<boolean> {
  const db = getDb();
  const [question] = await db.select().from(recipeQuestion).where(eq(recipeQuestion.id, id));
  if (!question || question.state !== 'open') return false;

  if (answer === 'recomputed') {
    const [snapshot] = await db
      .select()
      .from(recipeNutrition)
      .where(eq(recipeNutrition.id, question.snapshotId));
    const view = await readRecipe(question.recipeId);
    if (snapshot && view) {
      const variant = snapshot.variant as Variant;
      const computed = await computeVariant(view, variant);
      await db
        .update(recipeNutrition)
        .set({ supersededAt: new Date() })
        .where(eq(recipeNutrition.id, snapshot.id));
      await db
        .insert(recipeNutrition)
        .values(snapshotValues(view.id, variant, snapshot.version + 1, computed))
        .onConflictDoNothing();
    }
  }

  await db
    .update(recipeQuestion)
    .set({ state: 'answered', answeredAt: new Date(), answer })
    .where(eq(recipeQuestion.id, id));
  return true;
}
