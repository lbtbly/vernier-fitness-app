import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb } from './client';
import { food } from './schema';

/**
 * The food table: 3,483 rows of ANSES CIQUAL 2025, seeded at boot from a file
 * committed with this build.
 *
 * NO NETWORK, EVER. `scripts/fetch-ciqual.sh` downloads and verifies the
 * spreadsheet on a developer's machine, `scripts/build-food-seed.mjs` derives
 * `drizzle/seed/foods.csv` from it, and that CSV is committed and copied into
 * the image beside the migrations. The container starts with a food table on a
 * machine that has never heard of ciqual.anses.fr, which is the whole point of
 * bundling a composition table rather than calling one.
 *
 * The load is idempotent by conflict, so a restart writes nothing and no
 * timestamp moves, the same way the demonstration seed is. It is NOT gated on
 * DEMO_MODE: this is reference data the product cannot function without, not a
 * demonstration of it, and every row carries its publisher and its table
 * version so the data-sources screen reads both off the table.
 *
 * Licence Ouverte / Open Licence 2.0 (Etalab) permits the redistribution. The
 * obligation in return is paternite: name the publisher and the date of the
 * last update, and do not suggest the reuse is endorsed. The data-sources
 * screen does all three.
 */

export const FOOD_SOURCE = 'ciqual';
export const TABLE_VERSION = 'ciqual-2025-11-03';

const SEED_FILE = join(process.cwd(), 'drizzle', 'seed', 'foods.csv');

export type FoodRow = typeof food.$inferSelect;

/** One CSV line, split on commas that are not inside a quoted field. */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else quoted = false;
      } else current += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      fields.push(current);
      current = '';
    } else current += character;
  }
  fields.push(current);
  return fields;
}

export type ParsedFood = typeof food.$inferInsert;

const NUMBER_OR_NULL = (text: string): number | null => {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
};

/**
 * The committed CSV, as rows.
 *
 * An empty field is null and never zero. That is the single most important line
 * in this file: the column it fills is nullable for exactly this reason, and a
 * parser that coerced an empty string to 0 would destroy the distinction at the
 * moment of the insert, where no screen could ever get it back.
 */
export function parseFoodCsv(text: string): ParsedFood[] {
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  const rows: ParsedFood[] = [];
  for (const line of lines.slice(1)) {
    const fields = splitCsvLine(line);
    const [code, nameFr, groupCode, subgroupCode, kcal, protein, carb, fat, fibre, energySource, censored] =
      fields;
    rows.push({
      id: `${FOOD_SOURCE}:${code}`,
      source: FOOD_SOURCE,
      sourceRef: code,
      nameFr,
      groupCode,
      subgroupCode,
      kcal100g: NUMBER_OR_NULL(kcal),
      proteinG: NUMBER_OR_NULL(protein),
      carbG: NUMBER_OR_NULL(carb),
      fatG: NUMBER_OR_NULL(fat),
      fibreG: NUMBER_OR_NULL(fibre),
      energySource: energySource.trim() === '' ? null : energySource.trim(),
      censoredFields: censored.trim() === '' ? [] : censored.trim().split('|'),
      tableVersion: TABLE_VERSION,
    });
  }
  return rows;
}

export type FoodSeedResult = { read: number; written: number; total: number };

export async function seedFoodTable(): Promise<FoodSeedResult> {
  const db = getDb();
  const text = await readFile(SEED_FILE, 'utf8');
  const rows = parseFoodCsv(text);

  // In batches, because one insert of 3,483 rows with 14 columns each is over
  // the parameter ceiling `pg` will accept in a single statement.
  let written = 0;
  const BATCH = 250;
  for (let start = 0; start < rows.length; start += BATCH) {
    const inserted = await db
      .insert(food)
      .values(rows.slice(start, start + BATCH))
      .onConflictDoNothing({ target: food.id })
      .returning({ id: food.id });
    written += inserted.length;
  }

  const [{ n }] = await db.select({ n: count() }).from(food);
  return { read: rows.length, written, total: Number(n) };
}

export async function readFood(id: string): Promise<FoodRow | null> {
  const db = getDb();
  const [row] = await db.select().from(food).where(eq(food.id, id));
  return row ?? null;
}

export async function readFoods(ids: string[]): Promise<Map<string, FoodRow>> {
  if (ids.length === 0) return new Map();
  const db = getDb();
  // inArray, not a hand-written any(). Drizzle interpolates a JS array into a
  // sql`` template as a TUPLE of parameters, so `any(${ids})` reached Postgres
  // as `any(($1, $2))`, which is not valid syntax, and every call to this
  // function threw. It is the only read of the food table the recipe snapshot
  // has, so no recipe nutrition computed at all and the boot log said
  // "nutrition seed did not run" once and moved on.
  //
  // Five other files in src/db reach for inArray for exactly this. Matching the
  // nearest precedent would have avoided it.
  const rows = await db.select().from(food).where(inArray(food.id, ids));
  return new Map(rows.map((row) => [row.id, row]));
}

export type FoodTableFacts = {
  total: number;
  /** Rows carrying energy, protein, carbohydrate, fat and fibre all at once. */
  allFive: number;
  published: number;
  computed: number;
  noEnergy: number;
  nullFibre: number;
  tableVersion: string | null;
  /** A live row with no fibre value, so the "unknown" rendering has a screen. */
  nullFibreExample: string | null;
  /** A live row whose energy Vernier computed, so F79's marker has a screen. */
  computedExample: string | null;
  /**
   * A live row whose energy Anses published, so the marker has something to be
   * distinguishable FROM. F79 is a comparison and a screen that can only reach
   * one side of it cannot show one.
   */
  publishedExample: string | null;
};

/**
 * What the data-sources screen states, counted off the table rather than
 * copied from a comment.
 *
 * Every number here is a count over the rows that are actually loaded, and the
 * two examples are ids of real rows chosen by query. A screen that named a
 * hard-coded id would keep naming it after a release moved the row, and a
 * screen that stated a hard-coded count would keep stating it after a seed
 * failed halfway.
 */
export async function readFoodTableFacts(): Promise<FoodTableFacts> {
  const db = getDb();
  const [totals] = await db
    .select({
      total: count(),
      allFive: sql<number>`count(*) filter (where ${food.kcal100g} is not null and ${food.proteinG} is not null and ${food.carbG} is not null and ${food.fatG} is not null and ${food.fibreG} is not null)::int`,
      published: sql<number>`count(*) filter (where ${food.energySource} = 'published')::int`,
      computed: sql<number>`count(*) filter (where ${food.energySource} = 'computed_atwater')::int`,
      noEnergy: sql<number>`count(*) filter (where ${food.energySource} is null)::int`,
      nullFibre: sql<number>`count(*) filter (where ${food.fibreG} is null)::int`,
    })
    .from(food);

  const [version] = await db
    .select({ tableVersion: food.tableVersion })
    .from(food)
    .limit(1);

  const [noFibre] = await db
    .select({ id: food.id })
    .from(food)
    .where(and(isNull(food.fibreG), sql`${food.kcal100g} is not null`))
    .orderBy(asc(food.id))
    .limit(1);

  const [computedRow] = await db
    .select({ id: food.id })
    .from(food)
    .where(eq(food.energySource, 'computed_atwater'))
    .orderBy(asc(food.id))
    .limit(1);

  const [publishedRow] = await db
    .select({ id: food.id })
    .from(food)
    .where(eq(food.energySource, 'published'))
    .orderBy(asc(food.id))
    .limit(1);

  return {
    total: Number(totals?.total ?? 0),
    allFive: Number(totals?.allFive ?? 0),
    published: Number(totals?.published ?? 0),
    computed: Number(totals?.computed ?? 0),
    noEnergy: Number(totals?.noEnergy ?? 0),
    nullFibre: Number(totals?.nullFibre ?? 0),
    tableVersion: version?.tableVersion ?? null,
    nullFibreExample: noFibre?.id ?? null,
    computedExample: computedRow?.id ?? null,
    publishedExample: publishedRow?.id ?? null,
  };
}
