import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from './client';
import { type SourceRecordInput, upsertSourceRecord } from './measurements';
import { mealEntry, mealEntryItem } from './schema';
import type { PortionEvidence } from '@/lib/ai/estimate';
import type { MacroSet } from '@/lib/macros';
import { IMPORT_VERSION, type Confidence } from '@/lib/provenance';
import type { Slot } from '@/lib/recipe-catalogue';

/**
 * The only door into `meal_entry`, and it only ever inserts.
 *
 * The table refuses UPDATE and DELETE outright, so a correction is an insert
 * into the same chain or it does not happen, and a second trigger refuses an
 * insert that would change the origin, the confidence, the call or the
 * photograph of the row it corrects. That is F97 held by the database rather
 * than by every future handler remembering: after three edits the entry still
 * says estimate and still reaches the model reply, and there is no code path
 * that could make it say otherwise.
 */

export type EntryOrigin = 'photo_estimate' | 'typed' | 'recipe_box' | 'planned';

export type EntryItemInput = {
  aliasId: string;
  foodId: string | null;
  gramsLow: number;
  gramsHigh: number;
  exactGrams: number | null;
  evidence: PortionEvidence;
};

export type EntryInput = {
  id?: string;
  eatenAt: Date | null;
  timeZone: string;
  slot: Slot;
  origin: EntryOrigin;
  state?: 'eaten' | 'frozen';
  confidence: Confidence;
  macros: MacroSet;
  kcalLow: number | null;
  kcalHigh: number | null;
  unresolvedCount?: number;
  coveragePct?: number | null;
  recipeId?: string | null;
  photoId?: string | null;
  aiCallId?: string | null;
  items: EntryItemInput[];
  sourceRecord: SourceRecordInput;
};

export type MealEntryRow = typeof mealEntry.$inferSelect;
export type MealEntryItemRow = typeof mealEntryItem.$inferSelect;

function newEntryId(): string {
  return `meal_entry_${crypto.randomUUID()}`;
}

/**
 * One confirmed meal, with its lines, its source record and its origin, all in
 * one transaction.
 *
 * NOTHING CALLS THIS BEFORE THE OWNER CONFIRMS. The estimate screen holds the
 * range in the browser and the photograph in a holding directory; the only
 * writer of a meal row is the confirm route, and F96's "abandoning the screen
 * leaves zero rows" is that fact and not a promise.
 */
export async function writeEntry(input: EntryInput): Promise<{ id: string }> {
  const db = getDb();
  const id = input.id ?? newEntryId();

  await db.transaction(async (tx) => {
    await upsertSourceRecord(input.sourceRecord, tx);
    await tx.insert(mealEntry).values({
      id,
      eatenAt: input.eatenAt,
      timeZone: input.timeZone,
      slot: input.slot,
      origin: input.origin,
      state: input.state ?? 'eaten',
      // Amendment A3. The six sources do not gain a seventh member for this:
      // an estimate the owner confirmed came from the owner, and the model's
      // involvement is the confidence beside it and the record behind it.
      source: 'manual',
      confidence: input.confidence,
      kcal: input.macros.kcal,
      kcalLow: input.kcalLow,
      kcalHigh: input.kcalHigh,
      proteinG: input.macros.proteinG,
      carbG: input.macros.carbG,
      fatG: input.macros.fatG,
      fibreG: input.macros.fibreG,
      unresolvedCount: input.unresolvedCount ?? 0,
      coveragePct: input.coveragePct ?? null,
      recipeId: input.recipeId ?? null,
      photoId: input.photoId ?? null,
      aiCallId: input.aiCallId ?? null,
      sourceRecordId: input.sourceRecord.id,
      importVersion: IMPORT_VERSION,
      rootId: id,
      correctsId: null,
      correctionIndex: 0,
    });
    await insertItems(tx, id, input.items);
  });

  return { id };
}

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Executor = Database | Transaction;

async function insertItems(tx: Executor, entryId: string, items: EntryItemInput[]): Promise<void> {
  if (items.length === 0) return;
  await tx.insert(mealEntryItem).values(
    items.map((item, index) => ({
      id: `meal_item_${crypto.randomUUID()}`,
      entryId,
      aliasId: item.aliasId,
      foodId: item.foodId,
      gramsLow: item.gramsLow,
      gramsHigh: item.gramsHigh,
      exactGrams: item.exactGrams,
      evidence: item.evidence,
      position: index,
    })),
  );
}

export type CorrectionInput = {
  entryId: string;
  macros: MacroSet;
  kcalLow: number | null;
  kcalHigh: number | null;
  reason: string;
  /** The plate as it now stands. Absent means the lines do not change. */
  items?: EntryItemInput[];
  /** A move: the same meal on another day, or into the freezer. */
  eatenAt?: Date | null;
  state?: 'eaten' | 'frozen';
  slot?: Slot;
};

/**
 * An edit, which is an insert.
 *
 * It corrects whatever stands in the chain today rather than whatever the
 * caller happened to be looking at, exactly as `appendCorrection` does for a
 * measurement, so two edits raised from two stale screens produce a chain and
 * never a fork. The origin, the confidence, the call and the photograph are
 * copied from the row being corrected and not taken from the caller, which is
 * belt and braces with the trigger that would refuse them anyway.
 */
export async function correctEntry(input: CorrectionInput): Promise<{ id: string } | null> {
  const db = getDb();
  const current = await readCurrentOfChainOf(input.entryId);
  if (!current) return null;

  const id = newEntryId();
  await db.transaction(async (tx) => {
    await tx.insert(mealEntry).values({
      id,
      eatenAt: input.eatenAt === undefined ? current.eatenAt : input.eatenAt,
      timeZone: current.timeZone,
      slot: input.slot ?? (current.slot as Slot),
      origin: current.origin,
      state: input.state ?? current.state,
      source: current.source,
      confidence: current.confidence,
      kcal: input.macros.kcal,
      kcalLow: input.kcalLow,
      kcalHigh: input.kcalHigh,
      proteinG: input.macros.proteinG,
      carbG: input.macros.carbG,
      fatG: input.macros.fatG,
      fibreG: input.macros.fibreG,
      unresolvedCount: current.unresolvedCount,
      coveragePct: current.coveragePct,
      recipeId: current.recipeId,
      photoId: current.photoId,
      aiCallId: current.aiCallId,
      sourceRecordId: current.sourceRecordId,
      importVersion: IMPORT_VERSION,
      rootId: current.rootId,
      correctsId: current.id,
      correctionIndex: current.correctionIndex + 1,
      correctionReason: input.reason,
    });
    const lines = input.items ?? (await readEntryItems(current.id));
    await insertItems(
      tx,
      id,
      lines.map((line) => ({
        aliasId: line.aliasId,
        foodId: line.foodId,
        gramsLow: line.gramsLow,
        gramsHigh: line.gramsHigh,
        exactGrams: line.exactGrams,
        evidence: line.evidence as PortionEvidence,
      })),
    );
  });

  return { id };
}

export async function readEntry(id: string): Promise<MealEntryRow | undefined> {
  const db = getDb();
  const [row] = await db.select().from(mealEntry).where(eq(mealEntry.id, id)).limit(1);
  return row;
}

export async function readEntryChain(rootId: string): Promise<MealEntryRow[]> {
  const db = getDb();
  return db
    .select()
    .from(mealEntry)
    .where(eq(mealEntry.rootId, rootId))
    .orderBy(asc(mealEntry.correctionIndex));
}

/** The row that stands for the chain the given id belongs to. */
export async function readCurrentOfChainOf(id: string): Promise<MealEntryRow | undefined> {
  const row = await readEntry(id);
  if (!row) return undefined;
  const chain = await readEntryChain(row.rootId);
  return chain.at(-1);
}

export async function readEntryItems(entryId: string): Promise<MealEntryItemRow[]> {
  const db = getDb();
  return db
    .select()
    .from(mealEntryItem)
    .where(eq(mealEntryItem.entryId, entryId))
    .orderBy(asc(mealEntryItem.position));
}

/** The day key an instant falls on, in the app's own zone. */
function dayKey(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/**
 * Every entry that stands for one day: one row per chain, the latest of each.
 *
 * The whole chain is read and reduced here rather than in SQL, because the rule
 * "the last correction stands" lives in one place in this product and a window
 * function in a query would be a second copy of it.
 */
export async function readDayEntries(day: Date, timeZone: string): Promise<MealEntryRow[]> {
  const db = getDb();
  const wanted = dayKey(day, timeZone);
  const from = new Date(day.getTime() - 48 * 3600_000);
  const until = new Date(day.getTime() + 48 * 3600_000);
  const rows = await db
    .select()
    .from(mealEntry)
    .where(
      and(
        sql`${mealEntry.eatenAt} >= ${from.toISOString()}`,
        sql`${mealEntry.eatenAt} <= ${until.toISOString()}`,
      ),
    );

  const byChain = new Map<string, MealEntryRow>();
  for (const row of rows) {
    const held = byChain.get(row.rootId);
    if (!held || row.correctionIndex > held.correctionIndex) byChain.set(row.rootId, row);
  }
  return [...byChain.values()]
    .filter((row) => row.state === 'eaten' && row.eatenAt !== null && dayKey(row.eatenAt, timeZone) === wanted)
    .sort((left, right) => (left.eatenAt?.getTime() ?? 0) - (right.eatenAt?.getTime() ?? 0));
}

/** Every entry that stands, latest first. The Eat screen's recent list. */
export async function readRecentEntries(limit = 20): Promise<MealEntryRow[]> {
  const db = getDb();
  const rows = await db.select().from(mealEntry).orderBy(desc(mealEntry.createdAt)).limit(limit * 4);
  const byChain = new Map<string, MealEntryRow>();
  for (const row of rows) {
    const held = byChain.get(row.rootId);
    if (!held || row.correctionIndex > held.correctionIndex) byChain.set(row.rootId, row);
  }
  return [...byChain.values()]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, limit);
}

/**
 * How many rows the two meal tables hold. The population F96's zero is read
 * beside, so a count of none is never reported without saying what was walked.
 */
export async function countMealRows(): Promise<{ entries: number; items: number }> {
  const db = getDb();
  const [entries] = await db.select({ count: sql<string>`count(*)` }).from(mealEntry);
  const [items] = await db.select({ count: sql<string>`count(*)` }).from(mealEntryItem);
  return { entries: Number(entries?.count ?? 0), items: Number(items?.count ?? 0) };
}
