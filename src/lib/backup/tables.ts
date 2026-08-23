import { is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';

/**
 * Every table the owner owns, enumerated from `src/db/schema.ts` AT RUNTIME.
 *
 * WHY THIS IS NOT A LIST. A backup with a hand-written list of tables is a
 * backup that is correct on the day it is written and quietly incomplete from
 * the next slice onwards. Slices 5 to 12 added fifty tables between them; the
 * fourteenth will add more, and nobody will remember to come back here. So the
 * schema is walked instead: a table declared in `schema.ts` is in the archive,
 * in the export and in the load order the day it is declared, and the two
 * places that could disagree with the walk are checked rather than trusted.
 *
 * THE ARCHIVE DOES NOT STOP AT THIS WALK. `src/lib/backup/dump.ts` asks the
 * DATABASE what tables exist and reconciles the two answers: a table Postgres
 * holds that this file does not model is dumped anyway and named in the
 * manifest, and a table this file models that Postgres does not hold fails the
 * run. `drizzle.__drizzle_migrations` is exactly the first case, and it is the
 * difference between an archive that restores into a bootable app and one that
 * restores into a database the migrator immediately tries to migrate again.
 *
 * The schema module is an ARGUMENT rather than an import, for the same reason
 * `runPeriod` takes its ledger and `sendToAll` takes its store: it keeps this
 * file free of `@/` paths, so `scripts/restore.mjs` can import it straight from
 * Node with nothing but type stripping. A restore must never need the app.
 */

export type ColumnShape = {
  name: string;
  /**
   * `generated always as`, which cannot be written to.
   *
   * `measurement.seed` is one, computed by Postgres from the source. A loader
   * that named it in an INSERT would be refused by the database on the first
   * row, so the load order and the dump both read this and both leave it out.
   */
  generated: boolean;
};

export type TableShape = {
  name: string;
  columns: ColumnShape[];
  /** The columns a loader may write: every column that is not generated. */
  storedColumns: string[];
  /** The tables a row here can point at, deduplicated, self references dropped. */
  parents: string[];
};

export class TableGraphError extends Error {
  readonly code: 'table_cycle';
  readonly tables: string[];

  constructor(code: 'table_cycle', tables: string[]) {
    super(code);
    this.name = 'TableGraphError';
    this.code = code;
    this.tables = tables;
  }
}

/**
 * Every `pgTable` exported by the module, in alphabetical order.
 *
 * Alphabetical rather than declaration order, because the order of exports in a
 * 2,500 line file is an accident of which slice wrote which block, and a
 * manifest that reorders itself between two archives is a manifest nobody can
 * diff.
 */
export function enumerateSchemaTables(schema: Record<string, unknown>): TableShape[] {
  const shapes: TableShape[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value);
    const columns = config.columns.map((column) => ({
      name: column.name,
      generated: Boolean(column.generated),
    }));
    const parents = new Set<string>();
    for (const key of config.foreignKeys) {
      const reference = key.reference();
      const parent = getTableConfig(reference.foreignTable).name;
      if (parent !== config.name) parents.add(parent);
    }
    shapes.push({
      name: config.name,
      columns,
      storedColumns: columns.filter((column) => !column.generated).map((column) => column.name),
      parents: [...parents].sort(),
    });
  }
  return shapes.sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * The order rows may be inserted in: every parent before every child.
 *
 * A restore loads with the foreign keys ON. Nothing here disables a constraint
 * to make a load work, because a load that only succeeds with the rules off is
 * a load that can silently restore a measurement pointing at a source record
 * that is not there, and this product's whole claim is that a value knows where
 * it came from.
 *
 * A cycle would be unorderable, and it is refused by name rather than worked
 * around: there is none in this schema, `tests/unit/backup-tables.test.ts`
 * proves it, and a slice that introduces one has to decide what it means before
 * the archive pretends to handle it.
 */
export function loadOrder(tables: TableShape[]): string[] {
  const known = new Set(tables.map((table) => table.name));
  const pending = new Map(tables.map((table) => [table.name, table.parents.filter((parent) => known.has(parent))]));
  const ordered: string[] = [];
  const placed = new Set<string>();

  while (placed.size < pending.size) {
    const ready = [...pending.entries()]
      .filter(([name, parents]) => !placed.has(name) && parents.every((parent) => placed.has(parent)))
      .map(([name]) => name)
      .sort();
    if (ready.length === 0) {
      throw new TableGraphError(
        'table_cycle',
        [...pending.keys()].filter((name) => !placed.has(name)).sort(),
      );
    }
    for (const name of ready) {
      ordered.push(name);
      placed.add(name);
    }
  }
  return ordered;
}

/** Children before parents, which is the order a delete has to take. */
export function deleteOrder(tables: TableShape[]): string[] {
  return loadOrder(tables).reverse();
}

/**
 * The reason a table is not in the owner's download, as a token.
 *
 * NOT AN OMISSION LIST, A NAMED LIST. Everything the schema declares is in the
 * export unless it appears here with a reason, and the test that reads both
 * fails when a table is in neither. So a table added in a later slice lands in
 * the export by default: the safe direction, and the opposite of what a
 * hand-written include list does.
 *
 *   credential   holds a secret, a hash of one, or a sealed token. Exporting it
 *                would put in a downloadable file the one class of value F132
 *                says no surface may render. The archive DOES hold these, and
 *                the archive is encrypted; the export is not.
 *   reference    data that ships with the app rather than data the owner made.
 *                ANSES CIQUAL is redistributable under its own licence and this
 *                product's position on it is written in docs/product.md; a
 *                personal-data export is not the place to test that position.
 *                Nothing here is his, so nothing here is missing from his copy.
 *   diagnostic   what this machine did, not what the owner recorded. It is in
 *                the archive, and the operator console reads it live.
 */
export const EXPORT_EXCLUSIONS: Record<string, 'credential' | 'reference' | 'diagnostic'> = {
  owner: 'credential',
  session: 'credential',
  webauthn_credential: 'credential',
  webauthn_challenge: 'credential',
  recovery_grant: 'credential',
  integration_credential: 'credential',
  ingest_credential: 'credential',
  withings_connection: 'credential',
  google_connection: 'credential',
  push_subscription: 'credential',
  auth_attempt: 'diagnostic',
  request_origin: 'diagnostic',
  device_observation: 'diagnostic',
  push_delivery: 'diagnostic',
  job_run: 'diagnostic',
  app_meta: 'diagnostic',
  idempotency_key: 'diagnostic',
  backup_run: 'diagnostic',
  restore_check: 'diagnostic',
  operator_alert: 'diagnostic',
  deletion_run: 'diagnostic',
  food: 'reference',
  movement: 'reference',
  movement_media: 'reference',
  media_allowlist: 'reference',
  lab_analyte: 'reference',
  google_demo_event: 'reference',
};

/** The tables a download carries: everything the schema declares, minus the named. */
export function exportedTables(tables: TableShape[]): TableShape[] {
  return tables.filter((table) => !(table.name in EXPORT_EXCLUSIONS));
}
