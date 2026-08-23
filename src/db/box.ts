import { and, asc, eq } from 'drizzle-orm';
import { getDb } from './client';
import { writeEntry } from './meals';
import { type SourceRecordInput, upsertSourceRecord } from './measurements';
import { ensureSnapshot, readRecipe, readCurrentSnapshot } from './recipes';
import { recipe, recipeBoxItem, recipeIngredient, takeawayProposal } from './schema';
import { aliasById, aliasFoodId } from '@/lib/food-aliases';
import { instantOnDay, localDayKey, dayAfter } from '@/lib/local-time';
import type { MacroSet } from '@/lib/macros';
import type { ParsedLine, ArtifactKind, SecondPortionAnswer } from '@/lib/recipe-box';
import { secondPortionOffsetDays, storableLines } from '@/lib/recipe-box';
import type { Proposal } from '@/lib/takeaway';

/**
 * The recipe box and the takeaway slots, stored.
 *
 * TWO PORTIONS BECOME TWO ENTRIES AT IMPORT, WHICH IS WHAT "DEFAULT INTO THE
 * WEEK" MEANS. F90 says two recipes of two portions default into the week as
 * four consumed meals, so the four rows exist the moment the second recipe is
 * imported, without anybody answering anything. The question is asked per
 * recipe and its answer MOVES the second portion or takes it out of the week,
 * as a correction on that entry, so the history shows where it went.
 *
 * The dinner hour is 19:30 in the app's own zone. A box recipe is an evening
 * meal in this household, the plan's own dinners are evening meals, and a time
 * has to be chosen for a row that carries an instant. It is one constant here
 * rather than a value each caller picks.
 */

const DINNER_HOUR = 19;
const DINNER_MINUTE = 30;

export type ImportInput = {
  name: string;
  servings: number;
  artifactKind: ArtifactKind;
  /** The link he pasted, the file he uploaded, or nothing at all. */
  originRef: string | null;
  lines: ParsedLine[];
  weekStart: Date;
  /** The day the first portion is eaten, as the app's own calendar day. */
  firstDayKey: string;
  timeZone: string;
  sourceRecord: SourceRecordInput;
};

export type ImportResult = {
  recipeId: string;
  entryIds: string[];
  matched: number;
  unmatched: number;
};

/**
 * One imported recipe, its ingredient lines, its box row and its two meals.
 *
 * The recipe takes the FREE TEXT name column, which slice 9 put there for
 * exactly this: a recipe this app authored is copy and carries a key, and a
 * recipe the owner imported carries his own words. `origin` is 'recipe_box' so
 * the shopping list can deduct what the box supplied, which is F89's other
 * half, already built.
 */
export async function importBoxRecipe(input: ImportInput): Promise<ImportResult> {
  const db = getDb();
  const recipeId = `recipe_box_${crypto.randomUUID()}`;
  /*
   * EVERY LINE THAT CARRIES A WEIGHT, MATCHED OR NOT.
   *
   * This filtered on `aliasId !== null && grams !== null`, so a line the parser
   * could weigh but not name never became a row. F87 measures coverage as
   * resolved mass over total mass, and total mass is summed over the rows: a
   * card reading "200 g samphire, 300 g potatoes" stored one row, summed 300 g
   * of total mass, resolved 300 g of it, and reported 100 percent coverage over
   * three fifths of the food. The below-85-percent branch could not fire on any
   * input, which makes "renders as a range and states the shortfall" a sentence
   * about a state the product could not reach.
   *
   * A line with no weight is still not stored, and that is not the same
   * omission: mass coverage is a share of a total, and a line with no grams
   * contributes nothing to either side of it. `ImportResult.unmatched` counts
   * both kinds, so the screen can still say how many lines it could not read.
   */
  const storedLines = storableLines(input.lines);

  /*
   * The lines that named something the alias layer knows, which is a different
   * question from the one above and is used for two different things: the plate
   * items on the meal entry, which need an alias to point at a food row, and
   * the matched and unmatched counts the import screen reports. A line with a
   * weight and no name is a recipe ingredient and is not a plate item.
   */
  const matchedLines = storedLines.filter((line) => line.aliasId !== null);

  await db.transaction(async (tx) => {
    await upsertSourceRecord(input.sourceRecord, tx);
    await tx.insert(recipe).values({
      id: recipeId,
      nameKey: null,
      name: input.name,
      servings: input.servings,
      // A box recipe arrives cooked in about half an hour and the card says so,
      // but this import does not read a time off the card and will not invent
      // one: 30 is the plan's own default cooking time and it is what the week
      // generator compares against.
      cookMinutes: 30,
      slot: 'dinner',
      origin: 'recipe_box',
      originRef: input.originRef,
    });

    let position = 0;
    for (const line of storedLines) {
      const alias = line.aliasId === null ? null : aliasById(line.aliasId);
      await tx.insert(recipeIngredient).values({
        id: `recipe_ing_${crypto.randomUUID()}`,
        recipeId,
        aliasId: line.aliasId,
        foodId: alias ? aliasFoodId(alias) : null,
        grams: line.grams as number,
        position,
        // The box supplies what it sends. That is what makes these lines
        // deduct on the shopping list rather than being bought twice.
        boxSupplied: true,
      });
      position += 1;
    }

    await tx.insert(recipeBoxItem).values({
      id: `box_item_${crypto.randomUUID()}`,
      recipeId,
      weekStart: input.weekStart,
      portions: input.servings,
      artifactKind: input.artifactKind,
      secondPortionAnswer: null,
      sourceRecordId: input.sourceRecord.id,
    });
  });

  // The snapshot, through slice 9's own writer, so an imported recipe carries
  // the same versioned per-serving figures with the same coverage rules as a
  // shipped one. A recipe with no matched line gets a snapshot whose coverage
  // is zero, which is the honest number and renders as unknown.
  const view = await readRecipe(recipeId);
  if (view) await ensureSnapshot(view, 'base');
  const snapshot = view ? await readCurrentSnapshot(recipeId, 'base') : null;

  const macros: MacroSet = {
    kcal: snapshot?.perServingKcal ?? null,
    proteinG: snapshot?.perServingProteinG ?? null,
    carbG: snapshot?.perServingCarbG ?? null,
    fatG: snapshot?.perServingFatG ?? null,
    fibreG: snapshot?.perServingFibreG ?? null,
  };

  const entryIds: string[] = [];
  for (let portion = 0; portion < Math.min(2, input.servings); portion += 1) {
    const dayKey = portion === 0 ? input.firstDayKey : dayAfter(input.firstDayKey, 1);
    const { id } = await writeEntry({
      eatenAt: instantOnDay(dayKey, DINNER_HOUR, DINNER_MINUTE, input.timeZone),
      timeZone: input.timeZone,
      slot: 'dinner',
      origin: 'recipe_box',
      // Reported by the owner: he told Vernier what arrived and what he cooked.
      // Not 'estimated', because nothing about this figure came from a model,
      // and not 'measured_manual', because he did not weigh the plate.
      confidence: 'reported',
      macros,
      kcalLow: null,
      kcalHigh: null,
      coveragePct: snapshot?.coveragePct ?? null,
      unresolvedCount: input.lines.length - matchedLines.length,
      recipeId,
      items: matchedLines.map((line) => ({
        aliasId: line.aliasId as string,
        foodId: aliasById(line.aliasId as string)
          ? aliasFoodId(aliasById(line.aliasId as string)!)
          : null,
        // One serving of what the card makes. The band is the same at both ends
        // because the card said the weight: this is not an estimate off a
        // photograph and it does not pretend to be one.
        gramsLow: (line.grams as number) / Math.max(1, input.servings),
        gramsHigh: (line.grams as number) / Math.max(1, input.servings),
        exactGrams: null,
        evidence: 'named_portion' as const,
      })),
      sourceRecord: input.sourceRecord,
    });
    entryIds.push(id);
  }

  return {
    recipeId,
    entryIds,
    matched: matchedLines.length,
    unmatched: input.lines.length - matchedLines.length,
  };
}

export type BoxItemRow = typeof recipeBoxItem.$inferSelect;

export async function readBoxItems(weekStart: Date): Promise<BoxItemRow[]> {
  const db = getDb();
  return db
    .select()
    .from(recipeBoxItem)
    .where(eq(recipeBoxItem.weekStart, weekStart))
    .orderBy(asc(recipeBoxItem.createdAt));
}

export async function readBoxItem(recipeId: string, weekStart: Date): Promise<BoxItemRow | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(recipeBoxItem)
    .where(and(eq(recipeBoxItem.recipeId, recipeId), eq(recipeBoxItem.weekStart, weekStart)))
    .limit(1);
  return row;
}

/**
 * The answer, stored on the recipe it is about.
 *
 * PER RECIPE, WHICH IS THE WHOLE OF F90's SECOND CLAUSE. Two recipes produce
 * two rows and two answers, and answering one says nothing about the other. The
 * route takes one recipe id and there is no form that answers both.
 */
export async function answerSecondPortion(input: {
  recipeId: string;
  weekStart: Date;
  answer: SecondPortionAnswer;
}): Promise<BoxItemRow | null> {
  const db = getDb();
  const [row] = await db
    .update(recipeBoxItem)
    .set({ secondPortionAnswer: input.answer, answeredAt: new Date() })
    .where(
      and(
        eq(recipeBoxItem.recipeId, input.recipeId),
        eq(recipeBoxItem.weekStart, input.weekStart),
      ),
    )
    .returning();
  return row ?? null;
}

/** Where the second portion should sit, given an answer. Null means frozen. */
export function secondPortionInstant(
  firstDayKey: string,
  answer: SecondPortionAnswer,
  timeZone: string,
): Date | null {
  const offset = secondPortionOffsetDays(answer);
  if (offset === null) return null;
  return instantOnDay(dayAfter(firstDayKey, offset), DINNER_HOUR, DINNER_MINUTE, timeZone);
}

export function dayKeyOf(at: Date, timeZone: string): string {
  return localDayKey(at, timeZone);
}

export type TakeawayRow = typeof takeawayProposal.$inferSelect;

/**
 * The two slots for a week, rewritten whole.
 *
 * A proposal is not owner data: it is this product's suggestion, computed from
 * the target and the rules as they stand. When either moves, the old suggestion
 * is wrong rather than historic, so the two rows for the week are replaced. The
 * meal tables next door are append only for the opposite reason: what he ate is
 * a fact about a moment.
 */
export async function writeProposals(weekStart: Date, proposals: Proposal[]): Promise<TakeawayRow[]> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.delete(takeawayProposal).where(eq(takeawayProposal.weekStart, weekStart));
    if (proposals.length === 0) return [];
    return tx
      .insert(takeawayProposal)
      .values(
        proposals.map((proposal, index) => ({
          id: `takeaway_${crypto.randomUUID()}`,
          weekStart,
          position: index + 1,
          dishId: proposal.dishId,
          searchUrl: proposal.searchUrl,
          kcalLow: proposal.energy?.low ?? null,
          kcalHigh: proposal.energy?.high ?? null,
          budgetKcal: proposal.budgetKcal,
        })),
      )
      .returning();
  });
}

export async function readProposals(weekStart: Date): Promise<TakeawayRow[]> {
  const db = getDb();
  return db
    .select()
    .from(takeawayProposal)
    .where(eq(takeawayProposal.weekStart, weekStart))
    .orderBy(asc(takeawayProposal.position));
}
