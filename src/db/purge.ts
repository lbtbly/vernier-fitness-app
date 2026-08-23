import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { getPool } from './client';
import { recordDeletionRun } from './backup';
import * as schema from './schema';
import { qualify } from '@/lib/backup/dump';
import {
  DELETABLE_CATEGORIES,
  EVERYTHING,
  type DataCategory,
  categoryById,
  deletePhrase,
} from '@/lib/backup/categories';
import { deleteOrder, enumerateSchemaTables } from '@/lib/backup/tables';
import { storageRoot } from '@/lib/lab-storage';

/**
 * Permanent deletion, by category, behind a typed phrase.
 *
 * THE PHRASE IS CHECKED TWICE AND THE SECOND CHECK IS THE ONE THAT COUNTS. The
 * screen compares what the owner typed before it sends anything, and
 * `vernier_delete_category` in the database recomputes the phrase from the
 * category and refuses anything else. A route that stopped checking, a script
 * that called the function directly, or a hand at a psql prompt all meet the
 * same refusal, which is what "behind a typed phrase" has to mean to be worth
 * anything.
 *
 * AND IT IS THE SECOND OF THE THREE WAYS PAST THE APPEND-ONLY GUARANTEE. The
 * function disables only the triggers whose names end in `_append_only`, only
 * for the tables of the category being emptied, and only inside one
 * transaction. Every one of them is named in `docs/backup-restore.md` and in
 * the SQL itself. Nothing else in this application can reach that door.
 *
 * THE ZERO AFTERWARDS IS EVIDENCE ONLY BESIDE THE POPULATION IT COVERS, so the
 * count BEFORE is read first, in the same call, and stored on the deletion row.
 * A category that was already empty says so rather than reporting a triumphant
 * nothing.
 */

export type CategoryCount = { table: string; rows: number };

export type CategoryPreview = {
  category: string;
  tables: CategoryCount[];
  rows: number;
  files: number;
  phrase: string;
};

function tablesOf(category: DataCategory | 'everything'): string[] {
  const modelled = enumerateSchemaTables(schema as unknown as Record<string, unknown>);
  const order = deleteOrder(modelled);
  const wanted =
    category === 'everything'
      ? new Set(DELETABLE_CATEGORIES.flatMap((one) => one.tables))
      : new Set(category.tables);
  return order.filter((name) => wanted.has(name));
}

function directoriesOf(category: DataCategory | 'everything'): string[] {
  return category === 'everything'
    ? [...new Set(DELETABLE_CATEGORIES.flatMap((one) => one.directories))]
    : category.directories;
}

async function countFiles(directories: string[]): Promise<number> {
  let files = 0;
  for (const directory of directories) {
    const entries = await readdir(join(storageRoot(), directory)).catch(() => [] as string[]);
    files += entries.filter((name) => !name.startsWith('.')).length;
  }
  return files;
}

/** What is there now, per table, which is the population a zero afterwards covers. */
export async function previewCategory(id: string): Promise<CategoryPreview | null> {
  const category = id === EVERYTHING ? EVERYTHING : categoryById(id);
  if (category === null) return null;
  if (category !== EVERYTHING && !category.deletable) return null;

  const target = category === EVERYTHING ? 'everything' : category;
  const tables = tablesOf(target);
  const pool = getPool();
  const counts: CategoryCount[] = [];
  for (const table of tables) {
    const { rows } = await pool.query(
      `select count(*)::int as n from ${qualify({ schema: 'public', name: table })}`,
    );
    counts.push({ table, rows: Number(rows[0]?.n ?? 0) });
  }
  return {
    category: id,
    tables: counts,
    rows: counts.reduce((total, row) => total + row.rows, 0),
    files: await countFiles(directoriesOf(target)),
    phrase: deletePhrase(id),
  };
}

export type PurgeOutcome = {
  ok: boolean;
  category: string;
  before: Record<string, number>;
  removed: Record<string, number>;
  filesRemoved: number;
  rows: number;
  /** A token when it was refused, empty when it was done. */
  cause: string;
  /** Every append-only trigger the database stepped past, named. */
  steppedPast: string[];
};

/**
 * Empties a category, then records what it emptied.
 *
 * The record survives the rows, which is the point: what is left afterwards is
 * a row saying the owner asked for this category to be destroyed on this date,
 * with the counts. It never holds the phrase he typed, only that one matched.
 */
export async function purgeCategory(id: string, phrase: string): Promise<PurgeOutcome> {
  const preview = await previewCategory(id);
  if (!preview) {
    return {
      ok: false,
      category: id,
      before: {},
      removed: {},
      filesRemoved: 0,
      rows: 0,
      cause: 'unknown_category',
      steppedPast: [],
    };
  }

  const before = Object.fromEntries(preview.tables.map((row) => [row.table, row.rows]));

  if (phrase.trim() !== preview.phrase) {
    await recordDeletionRun({
      category: id,
      outcome: 'refused',
      before,
      removed: {},
      filesRemoved: 0,
      cause: 'phrase_mismatch',
    });
    return {
      ok: false,
      category: id,
      before,
      removed: {},
      filesRemoved: 0,
      rows: 0,
      cause: 'phrase_mismatch',
      steppedPast: [],
    };
  }

  const category = id === EVERYTHING ? EVERYTHING : categoryById(id)!;
  const target = category === EVERYTHING ? 'everything' : category;
  const tables = tablesOf(target);
  const pool = getPool();

  const { rows } = await pool.query('select vernier_delete_category($1, $2, $3) as result', [
    id,
    preview.phrase,
    tables,
  ]);
  const result = (rows[0]?.result ?? {}) as {
    removed?: Record<string, number>;
    triggers_stepped_past?: string[];
  };
  const removed = result.removed ?? {};

  // The files, after the rows, because a row that points at a file the database
  // still has is a recoverable state and a file with no row is an orphan
  // nothing will ever clean up.
  let filesRemoved = 0;
  for (const directory of directoriesOf(target)) {
    const path = join(storageRoot(), directory);
    for (const name of await readdir(path).catch(() => [] as string[])) {
      if (name.startsWith('.')) continue;
      await rm(join(path, name), { recursive: true, force: true });
      filesRemoved += 1;
    }
  }

  await recordDeletionRun({
    category: id,
    outcome: 'done',
    before,
    removed,
    filesRemoved,
  });

  return {
    ok: true,
    category: id,
    before,
    removed,
    filesRemoved,
    rows: Object.values(removed).reduce((total, count) => total + Number(count), 0),
    cause: '',
    steppedPast: result.triggers_stepped_past ?? [],
  };
}

/** What the delete control offers, with what each one holds right now. */
export async function readDeletableCategories(): Promise<CategoryPreview[]> {
  const previews: CategoryPreview[] = [];
  for (const category of DELETABLE_CATEGORIES) {
    const preview = await previewCategory(category.id);
    if (preview) previews.push(preview);
  }
  const everything = await previewCategory(EVERYTHING);
  if (everything) previews.push(everything);
  return previews;
}
