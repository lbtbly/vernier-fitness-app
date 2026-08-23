import { randomBytes } from 'node:crypto';
import type { TableShape } from './tables';

/**
 * The database dump: plain SQL a `psql` can load, produced by the app itself.
 *
 * WHY NOT `pg_dump`. The runtime image is `node:24-slim`, which carries no
 * Postgres client, and the whole stated defence of this stack is that the image
 * carries no CLI and no native binary. Installing a client to shell out to it
 * would trade that away, and reaching for one during a restore is the exact
 * failure this slice exists to prevent. So the dump is written here, over the
 * connection the app already holds, and what comes out is the same SHAPE
 * `pg_dump --format=plain` produces: a schema section, a data section, and
 * statements a psql prompt applies in order with nothing else installed.
 *
 * POSTGRES DOES BOTH SIDES OF THE SERIALISATION AND WE DO NEITHER. Every row
 * leaves as `row_to_json` and goes back in through `json_populate_recordset`,
 * so the timestamp, the jsonb, the array and the double are formatted and
 * parsed by the same server that owns the types. A dump that hand-formatted a
 * timestamp would be a dump that is wrong twice a year.
 *
 * ONE SNAPSHOT, ALL TABLES. The caller opens one REPEATABLE READ transaction
 * and every count and every cursor in this file reads inside it, so the row
 * counts in the manifest are the row counts in the dump even if the owner logs
 * a waist measurement from his phone while the archive is running. A dump whose
 * manifest disagrees with its own data is worse than no manifest.
 *
 * Nothing here speaks English. The SQL it emits is machine text, its comments
 * are for whoever opens the file in an emergency, and every failure is a code.
 */

export type DumpClient = {
  query(text: string): Promise<{ rows: Array<Record<string, unknown>> }>;
};

export class DumpError extends Error {
  readonly code:
    | 'dump_table_missing'
    | 'dump_quote_collision'
    | 'dump_no_tables'
    | 'dump_row_not_json';
  readonly table: string | null;

  constructor(code: DumpError['code'], table: string | null = null) {
    super(code);
    this.name = 'DumpError';
    this.code = code;
    this.table = table;
  }
}

/** A table as the DATABASE holds it, which is the list the dump is built from. */
export type LiveTable = {
  schema: string;
  name: string;
  /** True when `src/db/schema.ts` declares it. False for the migrator's own ledger. */
  modelled: boolean;
  /** The columns a loader may write, in order. */
  columns: string[];
};

export type SequenceReset = { schema: string; table: string; column: string };

export type DumpPlan = {
  tables: LiveTable[];
  sequences: SequenceReset[];
};

/** How many rows go into one INSERT. Small enough to read, big enough to be quick. */
export const ROWS_PER_STATEMENT = 250;

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function qualify(table: { schema: string; name: string }): string {
  return `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`;
}

/**
 * Every base table Postgres actually holds, and the writable columns of each.
 *
 * ASKED OF THE DATABASE, NOT OF THE APPLICATION. `src/lib/backup/tables.ts`
 * walks the schema the app declares, and that walk is the one that catches a
 * table a slice added and nobody remembered. This walk catches the other
 * direction: a table the DATABASE holds that the application does not model.
 * There is one today, `drizzle.__drizzle_migrations`, and leaving it out is the
 * difference between an archive that restores into a bootable installation and
 * one that restores into a database the migrator immediately tries to migrate
 * again.
 */
export async function planDump(client: DumpClient, modelled: TableShape[]): Promise<DumpPlan> {
  const { rows } = await client.query(`
    select
      n.nspname as schema_name,
      c.relname as table_name,
      a.attname as column_name,
      a.attnum as position,
      a.attgenerated as generated,
      pg_get_serial_sequence(quote_ident(n.nspname) || '.' || quote_ident(c.relname), a.attname) as sequence
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where c.relkind = 'r'
      and a.attnum > 0
      and not a.attisdropped
      and n.nspname not in ('pg_catalog', 'information_schema')
      and c.relpersistence = 'p'
    order by n.nspname, c.relname, a.attnum
  `);

  const declared = new Set(modelled.map((table) => table.name));
  const found = new Map<string, LiveTable>();
  const sequences: SequenceReset[] = [];

  for (const row of rows) {
    const schema = String(row.schema_name);
    const name = String(row.table_name);
    const key = `${schema}.${name}`;
    let table = found.get(key);
    if (!table) {
      table = { schema, name, modelled: schema === 'public' && declared.has(name), columns: [] };
      found.set(key, table);
    }
    // `attgenerated` is 's' for a stored generated column and '' for anything a
    // loader may write. `measurement.seed` is the one that matters: naming it in
    // an INSERT is refused by Postgres on the first row.
    if (String(row.generated ?? '') === '') table.columns.push(String(row.column_name));
    if (row.sequence) {
      sequences.push({ schema, table: name, column: String(row.column_name) });
    }
  }

  if (found.size === 0) throw new DumpError('dump_no_tables');

  for (const table of modelled) {
    if (!found.has(`public.${table.name}`)) {
      throw new DumpError('dump_table_missing', table.name);
    }
  }

  return { tables: [...found.values()], sequences };
}

/**
 * The order the dump writes and a load replays: unmodelled tables first, then
 * the application's own in foreign-key order.
 *
 * The migrator's ledger has no foreign key and no dependant, so it can go
 * anywhere; it goes first because a reader opening the file wants to see which
 * schema version this archive is of before three hundred thousand rows of data.
 */
export function dumpOrder(plan: DumpPlan, loadOrder: string[]): LiveTable[] {
  const position = new Map(loadOrder.map((name, index) => [name, index]));
  return [...plan.tables].sort((left, right) => {
    if (left.modelled !== right.modelled) return left.modelled ? 1 : -1;
    if (!left.modelled) return qualify(left).localeCompare(qualify(right));
    return (position.get(left.name) ?? 0) - (position.get(right.name) ?? 0);
  });
}

/** A dollar-quote tag no row can contain by accident, checked rather than hoped. */
export function dollarTag(): string {
  return `$v${randomBytes(4).toString('hex')}$`;
}

export type TableTally = { table: string; rows: number };

/**
 * The data section, one table at a time, through a server-side cursor.
 *
 * THE CURSOR IS NOT AN OPTIMISATION. `health_sample` takes twenty thousand rows
 * in a single accepted batch, and node-postgres buffers a whole result set in
 * the client before the first row is readable. A dump that materialised the
 * biggest table twice, once in Postgres and once in Node, would fall over on
 * the day the owner most needs it to work. FETCH 250 holds two hundred and
 * fifty rows.
 */
export async function* dumpTable(
  client: DumpClient,
  table: LiveTable,
  tally: TableTally[],
): AsyncGenerator<string> {
  const name = qualify(table);
  const columns = table.columns.map(quoteIdentifier).join(', ');
  const cursor = `vernier_dump_cursor`;

  yield `\n-- table ${table.schema}.${table.name}\n`;
  if (table.columns.length === 0) {
    // A table with no writable column at all is not a thing this schema has,
    // and a silent skip would be a table missing from a restore. It is named.
    tally.push({ table: `${table.schema}.${table.name}`, rows: 0 });
    yield `-- no writable column, nothing to load\n`;
    return;
  }

  await client.query(`declare ${cursor} no scroll cursor for select row_to_json(t) as row from ${name} t`);
  let rows = 0;
  try {
    for (;;) {
      const batch = await client.query(`fetch ${ROWS_PER_STATEMENT} from ${cursor}`);
      if (batch.rows.length === 0) break;
      const payload = batch.rows.map((row) => {
        const value = row.row;
        if (value === null || value === undefined) {
          throw new DumpError('dump_row_not_json', table.name);
        }
        return typeof value === 'string' ? value : JSON.stringify(value);
      });
      const document = `[${payload.join(',')}]`;
      const tag = dollarTag();
      if (document.includes(tag)) throw new DumpError('dump_quote_collision', table.name);
      rows += batch.rows.length;
      yield (
        `insert into ${name} (${columns})\n` +
        `select ${columns} from json_populate_recordset(null::${name}, ${tag}${document}${tag}::json);\n`
      );
    }
  } finally {
    await client.query(`close ${cursor}`);
  }
  tally.push({ table: `${table.schema}.${table.name}`, rows });
  yield `-- ${rows} rows\n`;
}

/**
 * The whole data section, with its header, its tables and its sequence resets.
 *
 * THE SEQUENCES ARE NOT A DETAIL. `drizzle.__drizzle_migrations.id` is a serial,
 * and loading rows with explicit ids does not move the sequence behind it. A
 * restore that skipped this would come back up, run one migration, and collide
 * with a row it had just restored. One `setval` per serial column, generated
 * from the catalogue rather than from a memory of which columns are serial.
 */
export async function* dumpData(
  client: DumpClient,
  tables: LiveTable[],
  sequences: SequenceReset[],
  tally: TableTally[],
): AsyncGenerator<string> {
  // Lower case with no full stop, deliberately: these are the comments a person
  // reads with the archive open in an emergency, and C6's source checker reads
  // every literal under src/ whatever it is for. Machine text stays machine
  // shaped, and the words that belong to a screen live in the catalogue.
  yield '-- vernier data section, load with psql into a database that already carries the schema\n';
  yield '-- every row goes back through json_populate_recordset, so the server that formatted\n';
  yield '-- each value is the server that parses it\n';
  yield 'begin;\n';
  yield* emptyTables(tables);
  for (const table of tables) {
    yield* dumpTable(client, table, tally);
  }
  if (sequences.length > 0) {
    yield '\n-- sequences, moved past the rows just loaded\n';
    for (const sequence of sequences) {
      const table = qualify({ schema: sequence.schema, name: sequence.table });
      const column = quoteIdentifier(sequence.column);
      yield (
        `select setval(pg_get_serial_sequence('${sequence.schema}.${sequence.table}', '${sequence.column}'),\n` +
        `  coalesce((select max(${column}) from ${table}), 1), true);\n`
      );
    }
  }
  yield 'commit;\n';
}

/**
 * Every table emptied before the first row is loaded, in ONE statement.
 *
 * WHY A LOAD CANNOT ASSUME AN EMPTY DATABASE. The schema section is the
 * generated migrations concatenated, and six of those files end in an INSERT:
 * the Withings connection row, the Google connection row, the consent row, the
 * four reminder categories, the quiet window and thirteen built-in analytes.
 * They carry ON CONFLICT DO NOTHING so a redeploy leaves the owner's own
 * settings alone, which is right, and it means a freshly built restore target
 * already holds those rows before the data section starts. Loading the
 * archive's copy of the same primary keys on top raises a duplicate key, psql
 * stops on it, and the restore dies with nothing in it. That is what F126
 * found, on the first run this claim ever had.
 *
 * ONE STATEMENT AND NOT ONE PER TABLE. Postgres refuses TRUNCATE on a table
 * another table references unless every referencing table is named in the same
 * command, whether or not it holds a row. The dump plan is every base table the
 * database has, so naming all of them satisfies that with no CASCADE, and
 * CASCADE is exactly what must not be written here: it would reach a table the
 * plan does not know about and empty it unseen.
 *
 * IT FIRES NO ROW TRIGGER. `measurement`, `health_sample`, `meal_entry`,
 * `meal_entry_item` and `calendar_write` refuse DELETE by BEFORE DELETE
 * trigger, and TRUNCATE is not DELETE. drizzle/0011_backup.sql names this as
 * the second of the three doors through the append-only guarantee: a restore
 * replaces a whole database rather than editing rows, and scripts/restore.mjs
 * refuses the live one unless the operator types the phrase.
 *
 * The side effect worth having: the data section can be loaded twice and the
 * database is the same afterwards.
 */
export function* emptyTables(tables: LiveTable[]): Generator<string> {
  if (tables.length === 0) return;
  yield '\n-- every table this file loads, emptied first, so the seed rows the schema\n';
  yield '-- section inserts are replaced by the archive rather than collided with\n';
  yield `truncate table ${tables.map((table) => qualify(table)).join(', ')};\n`;
}

/**
 * The row counts, read inside the same snapshot as the dump.
 *
 * `count(*)` per table rather than the planner's estimate in `pg_class`, which
 * is a guess that is wrong immediately after a load and is exactly the number a
 * restore comparison must not be built on.
 */
export async function countRows(client: DumpClient, tables: LiveTable[]): Promise<TableTally[]> {
  const counts: TableTally[] = [];
  for (const table of tables) {
    const { rows } = await client.query(`select count(*)::bigint as n from ${qualify(table)}`);
    counts.push({ table: `${table.schema}.${table.name}`, rows: Number(rows[0]?.n ?? 0) });
  }
  return counts;
}
