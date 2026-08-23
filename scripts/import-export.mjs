#!/usr/bin/env node
// Puts an export back, which is the half of F130 that makes it an export.
//
//   node scripts/import-export.mjs <file.json|file.zip> --into <database> [--truncate]
//
// A file that downloads is not an export. An export is a file that can be
// loaded into a database and produce the same rows, and until somebody has
// done that, "your data is yours" is a claim. This does it, against a scratch
// database and never against the live one, and prints the two row counts side
// by side.
//
// IT IS THE SAME DOOR THE ARCHIVE USES: every row goes back in through
// `json_populate_recordset`, so Postgres parses each value with the same input
// function that produced it. Nothing here formats a timestamp or an array by
// hand.
//
// --truncate empties the tables the file carries before loading them, in
// child-before-parent order. That is what a scratch instance needs, because it
// boots with reference data and a demonstration seed already in it, and a load
// on top of those would double every table and then report a mismatch about
// the wrong thing. It refuses to do it to the live database.

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');

const { readZip, parseCsv } = await import(join(projectRoot, 'src', 'lib', 'backup', 'export.ts'));

const EXIT = { ok: 0, usage: 2, refused: 4, environment: 5, mismatch: 6 };

function say(line) {
  process.stdout.write(`${line}\n`);
}

function fail(code, message) {
  process.stderr.write(`import-export: ${message}\n`);
  process.exit(code);
}

function compose(args, options = {}) {
  const result = spawnSync('docker', ['compose', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    input: options.input,
    maxBuffer: 1024 * 1024 * 512,
  });
  if (result.status !== 0 && !options.tolerate) {
    fail(EXIT.environment, `docker compose failed: ${result.stderr?.trim()}`);
  }
  return result;
}

function psql(database, sql, options = {}) {
  const result = compose(
    [
      'exec',
      '-T',
      '-e',
      `SQL=${sql.replace(/\s+/g, ' ').trim()}`,
      'db',
      'sh',
      '-c',
      `psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ${database} -At -c "$SQL"`,
    ],
    options,
  );
  return result.stdout.trim();
}

function psqlFile(database, text) {
  const result = compose(
    ['exec', '-T', 'db', 'sh', '-c', `psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ${database} -q -f -`],
    { input: text, tolerate: true },
  );
  if (result.status !== 0) {
    fail(EXIT.environment, `psql refused the load: ${(result.stderr || result.stdout).trim().slice(-800)}`);
  }
}

function liveDatabase() {
  const result = compose(['exec', '-T', 'db', 'printenv', 'POSTGRES_DB'], { tolerate: true });
  return result.status === 0 ? result.stdout.trim() : '';
}

/** The columns of a table in the target, and which of them hold JSON. */
function columnsOf(database, table) {
  const rows = psql(
    database,
    `select column_name, data_type, is_generated
       from information_schema.columns
      where table_schema = 'public' and table_name = '${table.replace(/'/g, "''")}'
      order by ordinal_position`,
  );
  return rows
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, type, generated] = line.split('|');
      return { name, type, generated: generated === 'ALWAYS' };
    });
}

/**
 * A CSV row, as the JSON object `json_populate_recordset` wants.
 *
 * Every cell is handed over as a STRING and Postgres calls the column's own
 * input function on it, which is what makes a timestamp, a numeric and an array
 * all arrive correctly. The one exception is a json or jsonb column: handed a
 * string, Postgres would store the string, so those cells are parsed here first.
 */
function rowFromCsv(header, cells, columns) {
  const byName = new Map(columns.map((column) => [column.name, column]));
  const row = {};
  for (const [index, name] of header.entries()) {
    const column = byName.get(name);
    if (!column || column.generated) continue;
    const cell = cells[index];
    if (cell === null || cell === undefined) {
      row[name] = null;
      continue;
    }
    if (column.type === 'json' || column.type === 'jsonb') {
      try {
        row[name] = JSON.parse(cell);
      } catch {
        row[name] = cell;
      }
      continue;
    }
    row[name] = cell;
  }
  return row;
}

function insertStatement(table, columns, rows) {
  if (rows.length === 0) return '';
  const names = columns.filter((column) => !column.generated).map((column) => `"${column.name}"`);
  const tag = `$vi${Math.random().toString(16).slice(2, 10)}$`;
  const document = JSON.stringify(rows);
  if (document.includes(tag)) return insertStatement(table, columns, rows);
  return (
    `insert into "public"."${table}" (${names.join(', ')})\n` +
    `select ${names.join(', ')} from json_populate_recordset(null::"public"."${table}", ${tag}${document}${tag}::json);\n`
  );
}

const [file, ...rest] = process.argv.slice(2);
const flags = {};
for (let index = 0; index < rest.length; index += 1) {
  if (rest[index] === '--into') flags.into = rest[++index];
  else if (rest[index] === '--truncate') flags.truncate = true;
}

if (!file || !flags.into) {
  process.stderr.write(
    [
      'import-export: put an export back into a scratch database and compare the counts.',
      '',
      '  node scripts/import-export.mjs <file.json|file.zip> --into <database> [--truncate]',
      '',
    ].join('\n'),
  );
  process.exit(EXIT.usage);
}

const live = liveDatabase();
if (flags.into === live) {
  fail(EXIT.refused, `${flags.into} is the live database, and this command never writes to it`);
}

const bytes = await readFile(resolve(process.cwd(), file));

/** The tables the file carries, in the order it carries them, with their rows. */
const carried = [];
if (file.endsWith('.zip')) {
  for (const entry of readZip(bytes)) {
    if (!entry.name.endsWith('.csv')) continue;
    const table = entry.name.replace(/\.csv$/, '');
    const parsed = parseCsv(Buffer.from(entry.body).toString('utf8'));
    carried.push({ table, header: parsed.header, rows: parsed.rows, kind: 'csv' });
  }
} else {
  const parsed = JSON.parse(bytes.toString('utf8'));
  for (const [table, rows] of Object.entries(parsed.tables ?? {})) {
    carried.push({ table, rows, kind: 'json' });
  }
  say(`file      exported ${parsed.meta?.exportedAt ?? 'at an unknown time'} by ${parsed.meta?.app ?? 'unknown'}`);
  say(`excluded  ${(parsed.meta?.excluded ?? []).map((entry) => `${entry.table} (${entry.reason})`).join(', ')}`);
}

say(`carrying  ${carried.length} tables from ${file}`);

if (flags.truncate) {
  // Child before parent, which is the reverse of the order the file is written
  // in, so no foreign key is ever left pointing at nothing mid-way.
  const names = carried
    .map((entry) => `"public"."${entry.table}"`)
    .reverse()
    .join(', ');
  psql(flags.into, `truncate ${names}`);
  say(`emptied   ${carried.length} tables in ${flags.into}`);
}

let loaded = 0;
for (const entry of carried) {
  const columns = columnsOf(flags.into, entry.table);
  if (columns.length === 0) {
    fail(EXIT.environment, `${flags.into} has no table called ${entry.table}`);
  }
  const rows =
    entry.kind === 'csv'
      ? entry.rows.map((cells) => rowFromCsv(entry.header, cells, columns))
      : entry.rows;
  if (rows.length === 0) continue;
  // In batches, for the same reason the dump writes in batches: one statement
  // holding a hundred thousand rows is one statement Postgres has to parse.
  for (let index = 0; index < rows.length; index += 250) {
    psqlFile(flags.into, insertStatement(entry.table, columns, rows.slice(index, index + 250)));
  }
  loaded += rows.length;
}

say('');
say('table                              in file   in database');
let differences = 0;
for (const entry of carried) {
  const inFile = entry.rows.length;
  const inDatabase = Number(psql(flags.into, `select count(*) from "public"."${entry.table}"`));
  const flag = inFile === inDatabase ? '' : '   <-- DIFFERENT';
  say(`  ${entry.table.padEnd(32)} ${String(inFile).padStart(7)} ${String(inDatabase).padStart(13)}${flag}`);
  if (inFile !== inDatabase) differences += 1;
}
say('');
say(`${loaded} rows loaded into ${flags.into} across ${carried.length} tables`);

if (differences > 0) {
  fail(EXIT.mismatch, `${differences} table(s) hold a different number of rows than the file`);
}
say('every table holds exactly what the file carried');
