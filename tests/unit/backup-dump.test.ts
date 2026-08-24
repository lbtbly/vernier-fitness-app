import { describe, expect, it } from 'vitest';
import {
  DumpError,
  type DumpClient,
  type LiveTable,
  ROWS_PER_STATEMENT,
  dumpData,
  dumpOrder,
  dumpTable,
  emptyTables,
  planDump,
  qualify,
} from '@/lib/backup/dump';
import type { TableShape } from '@/lib/backup/tables';

/**
 * The dump, graded over a fake connection.
 *
 * What is being tested here is the SQL this file writes and the reconciliation
 * it does between what the application declares and what the database holds.
 * Neither needs Postgres to be a real test, and both need to be real tests: the
 * reconciliation is the thing that stops an archive quietly missing a table,
 * and the SQL is what a person pipes into psql at seven in the morning.
 *
 * WHAT WOULD MAKE THIS GO RED. Drop the generated-column filter and the INSERT
 * names `seed`, which Postgres refuses on the first row. Drop the missing-table
 * check and a schema the database has not migrated to yet dumps quietly and
 * restores short.
 */

/** A catalogue answer shaped like the one `planDump` asks pg_class for. */
function column(
  schema: string,
  table: string,
  name: string,
  extra: { generated?: string; sequence?: string | null } = {},
) {
  return {
    schema_name: schema,
    table_name: table,
    column_name: name,
    position: 1,
    generated: extra.generated ?? '',
    sequence: extra.sequence ?? null,
  };
}

const CATALOGUE = [
  column('drizzle', '__drizzle_migrations', 'id', { sequence: 'drizzle.__drizzle_migrations_id_seq' }),
  column('drizzle', '__drizzle_migrations', 'hash'),
  column('public', 'source_record', 'id'),
  column('public', 'source_record', 'source'),
  column('public', 'measurement', 'id'),
  column('public', 'measurement', 'metric'),
  column('public', 'measurement', 'seed', { generated: 's' }),
];

const MODELLED: TableShape[] = [
  {
    name: 'measurement',
    columns: [
      { name: 'id', generated: false },
      { name: 'metric', generated: false },
      { name: 'seed', generated: true },
    ],
    storedColumns: ['id', 'metric'],
    parents: ['source_record'],
  },
  {
    name: 'source_record',
    columns: [{ name: 'id', generated: false }, { name: 'source', generated: false }],
    storedColumns: ['id', 'source'],
    parents: [],
  },
];

/**
 * A connection that answers the catalogue query once and then plays back fixed
 * rows for every cursor, recording every statement it was asked to run.
 */
function fakeClient(rowsPerTable: Record<string, Array<Record<string, unknown>>>): DumpClient & {
  statements: string[];
} {
  const statements: string[] = [];
  let open: { name: string; served: boolean } | null = null;
  return {
    statements,
    async query(text: string) {
      statements.push(text.trim());
      if (text.includes('from pg_class')) return { rows: CATALOGUE };
      const declare = /declare \S+ no scroll cursor for select row_to_json\(t\) as row from (.+) t$/.exec(
        text.trim(),
      );
      if (declare) {
        open = { name: declare[1], served: false };
        return { rows: [] };
      }
      if (text.startsWith('fetch')) {
        if (!open || open.served) return { rows: [] };
        open.served = true;
        return { rows: (rowsPerTable[open.name] ?? []).map((row) => ({ row: JSON.stringify(row) })) };
      }
      if (text.startsWith('close')) {
        open = null;
        return { rows: [] };
      }
      if (text.startsWith('select count(*)')) return { rows: [{ n: '2' }] };
      return { rows: [] };
    },
  };
}

describe('planning a dump', () => {
  it('finds every table the database holds, in every schema but the system ones', async () => {
    const plan = await planDump(fakeClient({}), MODELLED);
    const names = plan.tables.map((table) => `${table.schema}.${table.name}`).sort();
    console.log(`planned over ${names.length} tables: ${names.join(', ')}`);
    expect(names).toEqual(['drizzle.__drizzle_migrations', 'public.measurement', 'public.source_record']);
  });

  it('marks the migrator ledger as a table the application does not model, and keeps it', async () => {
    const plan = await planDump(fakeClient({}), MODELLED);
    const ledger = plan.tables.find((table) => table.name === '__drizzle_migrations');
    expect(ledger?.modelled).toBe(false);
    expect(plan.tables.filter((table) => table.modelled).map((table) => table.name).sort()).toEqual([
      'measurement',
      'source_record',
    ]);
  });

  it('leaves a generated column out of the writable columns', async () => {
    const plan = await planDump(fakeClient({}), MODELLED);
    const measurement = plan.tables.find((table) => table.name === 'measurement');
    expect(measurement?.columns).toEqual(['id', 'metric']);
  });

  it('collects the serial sequences, because a load leaves them behind', async () => {
    const plan = await planDump(fakeClient({}), MODELLED);
    expect(plan.sequences).toEqual([
      { schema: 'drizzle', table: '__drizzle_migrations', column: 'id' },
    ]);
  });

  it('refuses when the database is missing a table the application declares', async () => {
    const missing: TableShape[] = [
      ...MODELLED,
      { name: 'sleep_stage', columns: [], storedColumns: [], parents: [] },
    ];
    await expect(planDump(fakeClient({}), missing)).rejects.toThrow(DumpError);
    try {
      await planDump(fakeClient({}), missing);
    } catch (error) {
      expect((error as DumpError).code).toBe('dump_table_missing');
      expect((error as DumpError).table).toBe('sleep_stage');
    }
  });
});

describe('the SQL a dump writes', () => {
  const table: LiveTable = {
    schema: 'public',
    name: 'measurement',
    modelled: true,
    columns: ['id', 'metric'],
  };

  it('names its columns and hands the rows back through json_populate_recordset', async () => {
    const client = fakeClient({
      '"public"."measurement"': [
        { id: 'a7bf989c', metric: 'waist', seed: false },
        { id: 'b1', metric: 'weight', seed: false },
      ],
    });
    const tally: Array<{ table: string; rows: number }> = [];
    let sql = '';
    for await (const piece of dumpTable(client, table, tally)) sql += piece;
    console.log(sql.trim());

    expect(sql).toContain('insert into "public"."measurement" ("id", "metric")');
    expect(sql).toContain('json_populate_recordset(null::"public"."measurement"');
    // The generated column is in the JSON, because row_to_json produced it, and
    // is NOT in either column list, because Postgres refuses an insert into it.
    expect(sql).toContain('"seed":false');
    expect(sql).not.toMatch(/\("id", "metric", "seed"\)/);
    expect(tally).toEqual([{ table: 'public.measurement', rows: 2 }]);
    expect(client.statements.some((statement) => statement.startsWith('close'))).toBe(true);
  });

  it('opens and closes a cursor rather than selecting a whole table', async () => {
    const client = fakeClient({ '"public"."measurement"': [{ id: 'a' }] });
    const tally: Array<{ table: string; rows: number }> = [];
    for await (const _piece of dumpTable(client, table, tally)) void _piece;
    expect(client.statements.some((statement) => statement.includes('no scroll cursor'))).toBe(true);
    expect(client.statements.some((statement) => statement === `fetch ${ROWS_PER_STATEMENT} from vernier_dump_cursor`)).toBe(
      true,
    );
    expect(client.statements.some((statement) => /select \* from "public"\."measurement"$/.test(statement))).toBe(
      false,
    );
  });

  it('closes the cursor even when a row cannot be read', async () => {
    const broken: DumpClient & { statements: string[] } = fakeClient({});
    const original = broken.query.bind(broken);
    broken.query = async (text: string) => {
      if (text.startsWith('fetch')) return { rows: [{ row: null }] };
      return original(text);
    };
    const tally: Array<{ table: string; rows: number }> = [];
    let code = '';
    try {
      for await (const _piece of dumpTable(broken, table, tally)) void _piece;
    } catch (error) {
      code = (error as DumpError).code;
    }
    expect(code).toBe('dump_row_not_json');
    expect(broken.statements.some((statement) => statement.startsWith('close'))).toBe(true);
  });

  it('empties every table it loads, in one statement, before the first insert', async () => {
    const plan = await planDump(fakeClient({}), MODELLED);
    const ordered = dumpOrder(plan, ['source_record', 'measurement']);
    const client = fakeClient({ '"public"."source_record"': [{ id: 'a', source: 'manual' }] });
    const tally: Array<{ table: string; rows: number }> = [];
    let sql = '';
    for await (const piece of dumpData(client, ordered, [], tally)) sql += piece;
    const truncate = /^truncate table .+;$/m.exec(sql)?.[0] ?? '';
    console.log(truncate);

    /*
     * The schema section a restore applies is the migrations concatenated, and
     * six of them end in a seeded INSERT. Without this line the archive's own
     * copy of those rows collides on the primary key and psql stops the load.
     *
     * GOES RED IF: the truncate goes away, or it is split into one statement
     * per table, which Postgres refuses on any table another one references.
     */
    expect(truncate).toContain('"drizzle"."__drizzle_migrations"');
    expect(truncate).toContain('"public"."source_record"');
    expect(truncate).toContain('"public"."measurement"');
    // No CASCADE. It would reach a table this plan does not know about.
    expect(truncate.toLowerCase()).not.toContain('cascade');
    expect(sql.indexOf('truncate table')).toBeGreaterThan(sql.indexOf('begin;'));
    expect(sql.indexOf('truncate table')).toBeLessThan(sql.indexOf('insert into'));
  });

  it('writes nothing at all when there is no table to empty', () => {
    expect([...emptyTables([])]).toEqual([]);
  });

  it('wraps the load in one transaction and moves the sequences after it', async () => {
    const client = fakeClient({});
    const tally: Array<{ table: string; rows: number }> = [];
    let sql = '';
    for await (const piece of dumpData(
      client,
      [table],
      [{ schema: 'drizzle', table: '__drizzle_migrations', column: 'id' }],
      tally,
    )) {
      sql += piece;
    }
    expect(sql.startsWith('-- vernier data section')).toBe(true);
    expect(sql).toContain('begin;');
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
    expect(sql).toContain("setval(pg_get_serial_sequence('drizzle.__drizzle_migrations', 'id')");
    expect(sql.indexOf('setval')).toBeGreaterThan(sql.indexOf('insert into'));
  });
});

describe('the dump order', () => {
  it('writes the unmodelled tables first and the rest in foreign-key order', async () => {
    const plan = await planDump(fakeClient({}), MODELLED);
    const ordered = dumpOrder(plan, ['source_record', 'measurement']).map(
      (table) => `${table.schema}.${table.name}`,
    );
    expect(ordered).toEqual([
      'drizzle.__drizzle_migrations',
      'public.source_record',
      'public.measurement',
    ]);
  });

  it('quotes every identifier it writes', () => {
    expect(qualify({ schema: 'public', name: 'measurement' })).toBe('"public"."measurement"');
    expect(qualify({ schema: 'weird"name', name: 'x' })).toBe('"weird""name"."x"');
  });
});
