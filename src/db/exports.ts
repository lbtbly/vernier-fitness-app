import { getPool } from './client';
import * as schema from './schema';
import { EXPORT_FORMAT, type ExportMeta, csvLine, jsonDocument, zipEntries } from '@/lib/backup/export';
import { ROWS_PER_STATEMENT, qualify } from '@/lib/backup/dump';
import { EXPORT_EXCLUSIONS, enumerateSchemaTables, exportedTables, loadOrder } from '@/lib/backup/tables';
import { getConfig } from '@/lib/config';

/**
 * The owner's own copy of his own record, in two shapes.
 *
 * WHICH TABLES ARE IN IT IS DECIDED BY A WALK AND NOT BY A LIST. Everything
 * `src/db/schema.ts` declares is in the export unless `EXPORT_EXCLUSIONS` names
 * it with a reason, so a table a later slice adds is in his download the day it
 * is declared. The exclusions are credentials, the machine's own diagnostics
 * and the reference data this app shipped with, and the file itself says which
 * were left out and why: a person holding this download can see the shape of
 * what he was not given.
 *
 * ONE SNAPSHOT, LIKE THE ARCHIVE. Both exports read inside one REPEATABLE READ
 * transaction, so the counts in the meta block are the counts in the file.
 */

export type ExportTally = { table: string; rows: number };

function tablesToExport() {
  const modelled = enumerateSchemaTables(schema as unknown as Record<string, unknown>);
  const order = loadOrder(modelled);
  const carried = exportedTables(modelled);
  const byName = new Map(carried.map((table) => [table.name, table]));
  // Foreign-key order, so the file itself is loadable top to bottom.
  return order.map((name) => byName.get(name)).filter((table) => table !== undefined);
}

function excludedList(): Array<{ table: string; reason: string }> {
  return Object.entries(EXPORT_EXCLUSIONS)
    .map(([table, reason]) => ({ table, reason }))
    .sort((left, right) => left.table.localeCompare(right.table));
}

export function exportMeta(at: Date, tables: string[]): ExportMeta {
  return {
    exportedAt: at.toISOString(),
    app: 'vernier',
    format: EXPORT_FORMAT,
    timeZone: getConfig().timeZone,
    tables,
    excluded: excludedList(),
  };
}

/** The row counts the screen shows and the re-import is compared against. */
export async function exportCounts(): Promise<ExportTally[]> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('begin isolation level repeatable read read only');
    const counts: ExportTally[] = [];
    for (const table of tablesToExport()) {
      const { rows } = await client.query(
        `select count(*)::int as n from ${qualify({ schema: 'public', name: table.name })}`,
      );
      counts.push({ table: table.name, rows: Number(rows[0]?.n ?? 0) });
    }
    await client.query('commit');
    return counts;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * The structured export, streamed.
 *
 * Every row leaves as `row_to_json`, exactly as the archive's dump does, so the
 * server that owns the types is the one that formats them and a timestamp is
 * never assembled by hand.
 */
export async function* streamJsonExport(at: Date = new Date()): AsyncGenerator<string> {
  const tables = tablesToExport();
  const pool = getPool();
  const client = await pool.connect();
  const meta = exportMeta(at, tables.map((table) => table.name));
  try {
    await client.query('begin isolation level repeatable read read only');
    yield* jsonDocument(meta, {
      async *[Symbol.asyncIterator]() {
        for (const table of tables) {
          yield {
            table: table.name,
            rows: (async function* () {
              const cursor = 'vernier_export_cursor';
              await client.query(
                `declare ${cursor} no scroll cursor for select row_to_json(t) as row from ${qualify({ schema: 'public', name: table.name })} t`,
              );
              try {
                for (;;) {
                  const batch = await client.query(`fetch ${ROWS_PER_STATEMENT} from ${cursor}`);
                  if (batch.rows.length === 0) break;
                  yield batch.rows.map((row: { row: unknown }) =>
                    typeof row.row === 'string' ? row.row : JSON.stringify(row.row),
                  );
                }
              } finally {
                await client.query(`close ${cursor}`);
              }
            })(),
          };
        }
      },
    });
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * The tabular export: one CSV per table, zipped, plus the same meta as a JSON
 * member so both downloads say the same thing about themselves.
 *
 * IT ASSEMBLES IN MEMORY, and that is a deliberate limit rather than an
 * oversight. A zip's central directory needs every entry's size and CRC, and
 * this is one person's health record on one machine: the biggest table here is
 * a few tens of megabytes of text. The archive, which has no such ceiling
 * because it holds the photographs too, streams instead.
 */
export async function buildCsvZip(at: Date = new Date()): Promise<Buffer> {
  const tables = tablesToExport();
  const pool = getPool();
  const client = await pool.connect();
  const entries: Array<{ name: string; body: Uint8Array }> = [];
  try {
    await client.query('begin isolation level repeatable read read only');
    for (const table of tables) {
      const columns = table.storedColumns;
      let text = csvLine(columns);
      const cursor = 'vernier_export_cursor';
      await client.query(
        `declare ${cursor} no scroll cursor for select ${columns
          .map((column) => `"${column.replace(/"/g, '""')}"`)
          .join(', ')} from ${qualify({ schema: 'public', name: table.name })}`,
      );
      try {
        for (;;) {
          const batch = await client.query(`fetch ${ROWS_PER_STATEMENT} from ${cursor}`);
          if (batch.rows.length === 0) break;
          for (const row of batch.rows) {
            text += csvLine(columns.map((column) => (row as Record<string, unknown>)[column]));
          }
        }
      } finally {
        await client.query(`close ${cursor}`);
      }
      entries.push({ name: `${table.name}.csv`, body: Buffer.from(text, 'utf8') });
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  entries.push({
    name: 'export.json',
    body: Buffer.from(
      `${JSON.stringify(exportMeta(at, tables.map((table) => table.name)), null, 2)}\n`,
      'utf8',
    ),
  });
  return zipEntries(entries, at);
}
