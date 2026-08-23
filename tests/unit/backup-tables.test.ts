import { sql } from 'drizzle-orm';
import { boolean, pgTable, text } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import {
  DATA_CATEGORIES,
  DELETABLE_CATEGORIES,
  claimedTables,
  deletePhrase,
  retentionToken,
} from '@/lib/backup/categories';
import {
  EXPORT_EXCLUSIONS,
  TableGraphError,
  deleteOrder,
  enumerateSchemaTables,
  exportedTables,
  loadOrder,
} from '@/lib/backup/tables';

/**
 * The difference between a backup and MOST of a backup.
 *
 * Every claim in this file is made over the real schema and prints the
 * population it walked, because "no table was left out" asserted over a walk
 * that found four tables reads exactly like the same sentence over a walk that
 * found seventy. A4's first rule, applied to a list rather than to a count.
 *
 * The property that matters most is the LAST one: a table added by a later
 * slice is in the export the day it is declared, and has to be named here to
 * stay out. A hand-written include list gets that backwards, and the failure is
 * silent for as long as nobody looks.
 */

const tables = enumerateSchemaTables(schema as unknown as Record<string, unknown>);

describe('the schema walk', () => {
  it('finds every table the application declares, and says how many', () => {
    const names = tables.map((table) => table.name);
    console.log(`${names.length} tables in src/db/schema.ts:\n${names.join(', ')}`);
    expect(names.length).toBeGreaterThan(60);
    // Four spot checks across four slices, so a walk that silently found only
    // the tables of one file cannot pass.
    expect(names).toContain('measurement');
    expect(names).toContain('health_sample');
    expect(names).toContain('set_log');
    expect(names).toContain('calendar_write');
    expect(new Set(names).size).toBe(names.length);
  });

  it('leaves a generated column out of the columns a loader may write', () => {
    const measurement = tables.find((table) => table.name === 'measurement');
    expect(measurement).toBeDefined();
    expect(measurement!.columns.some((column) => column.name === 'seed' && column.generated)).toBe(true);
    expect(measurement!.storedColumns).not.toContain('seed');
    // And it is not a blanket exclusion of the word: every other column stays.
    expect(measurement!.storedColumns).toContain('raw_value');
    expect(measurement!.storedColumns.length).toBe(measurement!.columns.length - 1);
  });
});

describe('the load order', () => {
  const order = loadOrder(tables);

  it('puts every parent before every child, over the whole schema', () => {
    const position = new Map(order.map((name, index) => [name, index]));
    let checked = 0;
    for (const table of tables) {
      for (const parent of table.parents) {
        checked += 1;
        expect(position.get(parent)!).toBeLessThan(position.get(table.name)!);
      }
    }
    console.log(`${checked} foreign keys checked across ${order.length} tables`);
    expect(checked).toBeGreaterThan(20);
    expect(order.length).toBe(tables.length);
  });

  it('has source_record before measurement, and measurement before import_question', () => {
    expect(order.indexOf('source_record')).toBeLessThan(order.indexOf('measurement'));
    expect(order.indexOf('measurement')).toBeLessThan(order.indexOf('import_question'));
  });

  it('deletes children first, which is the reverse', () => {
    const deleting = deleteOrder(tables);
    expect(deleting.indexOf('import_question')).toBeLessThan(deleting.indexOf('measurement'));
    expect(deleting.indexOf('measurement')).toBeLessThan(deleting.indexOf('source_record'));
  });

  it('refuses a cycle by name rather than looping or dropping a table', () => {
    const cyclic = [
      { name: 'left', columns: [], storedColumns: [], parents: ['right'] },
      { name: 'right', columns: [], storedColumns: [], parents: ['left'] },
    ];
    expect(() => loadOrder(cyclic)).toThrow(TableGraphError);
    try {
      loadOrder(cyclic);
    } catch (error) {
      expect((error as TableGraphError).code).toBe('table_cycle');
      expect((error as TableGraphError).tables).toEqual(['left', 'right']);
    }
  });
});

describe('the categories cover the schema', () => {
  it('claims every table exactly once, and claims no table that does not exist', () => {
    const claimed = claimedTables();
    const declared = new Set(tables.map((table) => table.name));
    const duplicated = claimed.filter((name, index) => claimed.indexOf(name) !== index);
    const unclaimed = [...declared].filter((name) => !claimed.includes(name)).sort();
    const invented = claimed.filter((name) => !declared.has(name)).sort();
    console.log(
      `${DATA_CATEGORIES.length} categories claiming ${claimed.length} of ${declared.size} tables`,
    );
    expect(duplicated).toEqual([]);
    expect(unclaimed).toEqual([]);
    expect(invented).toEqual([]);
  });

  it('gives every category one retention rule, and prints the table', () => {
    const rows = DATA_CATEGORIES.map(
      (category) =>
        `${category.id.padEnd(20)} ${retentionToken(category.retention).padEnd(16)} ${
          category.deletable ? 'deletable' : 'kept'
        } ${category.tables.length} tables`,
    );
    console.log(rows.join('\n'));
    expect(DATA_CATEGORIES.every((category) => retentionToken(category.retention).length > 0)).toBe(true);
  });

  it('offers seven categories to the delete control and never the account or the audit trail', () => {
    const offered = DELETABLE_CATEGORIES.map((category) => category.id);
    expect(offered).toEqual([
      'body',
      'phone_health',
      'laboratory',
      'training',
      'nutrition',
      'assistant',
      'planning',
    ]);
    expect(offered).not.toContain('account');
    expect(offered).not.toContain('audit');
    expect(offered).not.toContain('operations');
  });

  it('builds a typed phrase per category that cannot be pasted between them', () => {
    expect(deletePhrase('body')).toBe('delete body');
    expect(deletePhrase('phone_health')).toBe('delete phone health');
    expect(deletePhrase('everything')).toBe('delete everything');
    const phrases = DELETABLE_CATEGORIES.map((category) => deletePhrase(category.id));
    expect(new Set(phrases).size).toBe(phrases.length);
  });
});

describe('the export', () => {
  it('accounts for every table, either carried or excluded with a reason', () => {
    const carried = exportedTables(tables).map((table) => table.name);
    const excluded = tables.map((table) => table.name).filter((name) => name in EXPORT_EXCLUSIONS);
    console.log(
      `export carries ${carried.length} tables and names ${excluded.length} exclusions:\n` +
        excluded.map((name) => `${name} (${EXPORT_EXCLUSIONS[name]})`).join(', '),
    );
    expect(carried.length + excluded.length).toBe(tables.length);
    expect(carried.length).toBeGreaterThan(30);
    expect(excluded.length).toBeGreaterThan(0);
  });

  it('never carries a table that holds a credential', () => {
    const carried = new Set(exportedTables(tables).map((table) => table.name));
    for (const name of [
      'owner',
      'session',
      'webauthn_credential',
      'integration_credential',
      'ingest_credential',
      'withings_connection',
      'google_connection',
      'recovery_grant',
    ]) {
      expect(carried.has(name)).toBe(false);
      expect(EXPORT_EXCLUSIONS[name]).toBe('credential');
    }
  });

  it('carries the owner’s own record, which is the point of it', () => {
    const carried = new Set(exportedTables(tables).map((table) => table.name));
    for (const name of ['measurement', 'source_record', 'health_sample', 'set_log', 'meal_entry']) {
      expect(carried.has(name)).toBe(true);
    }
  });

  /**
   * The property the whole file is built around, tested with a table that does
   * not exist yet.
   *
   * A slice in six months declares `sleep_stage` and forgets this file exists.
   * It has to be in the walk, in the export and in the load order anyway. If
   * this ever goes red, the enumeration has become a list again.
   */
  it('carries a table declared later without anybody coming back here', () => {
    const later = {
      sleepStage: pgTable('sleep_stage', {
        id: text('id').primaryKey(),
        stage: text('stage').notNull(),
        seeded: boolean('seeded').generatedAlwaysAs(sql`false`),
      }),
    };
    const walked = enumerateSchemaTables(later as unknown as Record<string, unknown>);
    expect(walked.map((table) => table.name)).toEqual(['sleep_stage']);
    expect(exportedTables(walked).map((table) => table.name)).toEqual(['sleep_stage']);
    expect(walked[0].storedColumns).toEqual(['id', 'stage']);
    expect(loadOrder(walked)).toEqual(['sleep_stage']);
  });
});
