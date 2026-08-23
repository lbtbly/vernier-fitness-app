#!/usr/bin/env node
// The restore, from this Mac mini's own terminal.
//
//   node scripts/restore.mjs list
//   node scripts/restore.mjs verify <archive>
//   node scripts/restore.mjs restore <archive> --into <database> [--record]
//   node scripts/restore.mjs corrupt <archive> --mode truncate|reorder|flip --out <path>
//
// WHY THIS IS A SHELL COMMAND AND NOT A BUTTON. The day a restore is needed is
// the day the app may not start, so nothing here imports the application, opens
// a session or asks a route for anything. It needs node and docker, both of
// which are already on this machine, and NOTHING ELSE: no age, no gpg, no
// openssl, no pg_restore. The cipher is node's own and the archive's container
// is a plain tar.
//
// AND IT IS THE SECOND OF THE THREE WAYS PAST THE APPEND-ONLY GUARANTEE. It
// does not delete a row: it replaces a whole database. Pointed at the live one
// it refuses outright unless the operator types a phrase at this terminal,
// which is a thing no screen, no route and no scheduled job can do.
//
// Nothing here prints a credential. The archive secret is read out of the
// running container into a variable and never echoed, and the connection
// string is assembled inside the database container the way scripts/recovery.sh
// already does it.

import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');

const {
  ArchiveError,
  decryptArchive,
  readTar,
  scanTar,
  collect,
} = await import(join(projectRoot, 'src', 'lib', 'backup', 'archive.ts'));
const { archiveSecret } = await import(join(projectRoot, 'src', 'lib', 'backup', 'secret.ts'));
const { MANIFEST_MEMBER, SCHEMA_MEMBER, DATA_MEMBER, STORAGE_MEMBER, parseManifest, reconcileMembers } =
  await import(join(projectRoot, 'src', 'lib', 'backup', 'manifest.ts'));
const { isArchiveName } = await import(join(projectRoot, 'src', 'lib', 'backup', 'retention.ts'));

/**
 * One sentence per failure code, for a terminal.
 *
 * The catalogue in src/lib/strings.ts holds the ones a SCREEN says; these are
 * the ones a shell says, and scripts/ is outside the C6 walk for exactly that
 * reason. The codes are the same on both sides, which is the point of the code
 * being a code.
 */
const SENTENCES = {
  archive_header_short: 'the file is too short to be an archive, or it is not one at all',
  archive_bad_magic: 'this file is not a Vernier archive',
  archive_version_unsupported: 'this archive was written by a newer version of Vernier than this one',
  archive_cipher_unsupported: 'this archive names a cipher this build does not have',
  archive_kdf_unsupported: 'this archive names a key derivation this build does not have',
  archive_chunk_size_invalid: 'a chunk header claims a size no writer produces, so the file is damaged',
  archive_frame_short: 'the archive ends in the middle of a chunk header',
  archive_truncated: 'the archive is TRUNCATED: it ends without the chunk that marks the end',
  archive_chunk_unauthenticated:
    'a chunk did not verify: it has been altered, moved, or written under a different secret',
  archive_trailing_bytes: 'there are bytes after the final chunk, so this file has been appended to',
  archive_secret_missing: 'no BACKUP_PASSPHRASE and no MASTER_KEY, so there is no key to open this with',
  tar_checksum_mismatch: 'the archive decrypted but its table of contents is damaged',
  tar_size_mismatch: 'a member of the archive is not the length its header claims',
  tar_header_short: 'the archive ends inside one of its members',
  member_missing: 'the archive is missing a member the manifest says it holds',
  member_digest_mismatch: 'a member of the archive does not match the digest in the manifest',
  member_size_mismatch: 'a member of the archive is not the size the manifest claims',
  manifest_unreadable: 'the manifest inside this archive cannot be read',
  manifest_version_unsupported: 'the manifest inside this archive is a version this build does not know',
};

/** Exit codes, so a script calling this one can tell the classes apart. */
const EXIT = {
  ok: 0,
  usage: 2,
  integrity: 3,
  refused: 4,
  environment: 5,
  mismatch: 6,
};

function say(line) {
  process.stdout.write(`${line}\n`);
}

function fail(code, message) {
  process.stderr.write(`restore: ${message}\n`);
  process.exit(code);
}

function describe(error) {
  const code = error?.code ?? error?.message ?? 'unknown';
  const sentence = SENTENCES[code] ?? 'the archive could not be read';
  const at = typeof error?.sequence === 'number' ? ` at chunk ${error.sequence}` : '';
  return `${code}: ${sentence}${at}`;
}

// ---------------------------------------------------------------------------
// Docker, and nothing else.
// ---------------------------------------------------------------------------

function compose(args, options = {}) {
  const result = spawnSync('docker', ['compose', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    input: options.input,
    maxBuffer: 1024 * 1024 * 512,
  });
  if (result.status !== 0 && !options.tolerate) {
    fail(EXIT.environment, `docker compose ${args.slice(0, 3).join(' ')} failed: ${result.stderr?.trim()}`);
  }
  return result;
}

/** A statement against a database inside the db container, as its owner. */
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

/** A whole file, piped into psql. Used for the schema and the data sections. */
function psqlFile(database, text) {
  const result = compose(
    [
      'exec',
      '-T',
      'db',
      'sh',
      '-c',
      `psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ${database} -q -f -`,
    ],
    { input: text, tolerate: true },
  );
  if (result.status !== 0) {
    fail(EXIT.environment, `psql refused the load: ${(result.stderr || result.stdout).trim().slice(-800)}`);
  }
  return result.stdout;
}

/** One environment value out of the app container. Never printed. */
function appEnv(name) {
  const result = compose(['exec', '-T', 'app', 'printenv', name], { tolerate: true });
  return result.status === 0 ? result.stdout.trim() : '';
}

function liveDatabase() {
  const result = compose(['exec', '-T', 'db', 'printenv', 'POSTGRES_DB'], { tolerate: true });
  return result.status === 0 ? result.stdout.trim() : '';
}

function secret() {
  try {
    return archiveSecret({
      BACKUP_PASSPHRASE: appEnv('BACKUP_PASSPHRASE'),
      MASTER_KEY: appEnv('MASTER_KEY'),
    }).secret;
  } catch (error) {
    fail(EXIT.environment, describe(error));
    return '';
  }
}

// ---------------------------------------------------------------------------
// Finding an archive.
// ---------------------------------------------------------------------------

/** Where archives live on the host, and inside the container's fallback. */
async function hostDirectories() {
  const configured = (process.env.BACKUP_DIR ?? appEnv('BACKUP_DIR')).trim();
  const directories = [];
  if (configured !== '') directories.push(configured);
  directories.push(join(projectRoot, 'backups'));
  return directories;
}

async function listDirectory(directory) {
  const names = await readdir(directory).catch(() => []);
  const found = [];
  for (const name of names.filter(isArchiveName)) {
    const info = await stat(join(directory, name)).catch(() => null);
    if (info) found.push({ directory, name, bytes: info.size });
  }
  return found.sort((left, right) => right.name.localeCompare(left.name));
}

/** The fallback inside the container, which the host cannot read directly. */
function listFallback() {
  const result = compose(
    ['exec', '-T', 'app', 'sh', '-c', 'ls -1 /app/storage/backups 2>/dev/null || true'],
    { tolerate: true },
  );
  return (result.stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => isArchiveName(line))
    .sort()
    .reverse();
}

/**
 * Resolves what the operator named into a path on this host.
 *
 * A bare name is looked for in the configured directory, then in the project's
 * own fallback, then INSIDE the container, which is where it lands when the
 * configured destination was not usable. The last case is the interesting one:
 * it is exactly the archive somebody needs when something is already wrong.
 */
async function resolveArchive(name) {
  if (name.includes('/')) {
    const path = resolve(process.cwd(), name);
    if (await stat(path).catch(() => null)) return { path, source: 'host', temporary: false };
    fail(EXIT.usage, `there is no file at ${path}`);
  }
  for (const directory of await hostDirectories()) {
    const path = join(directory, name);
    if (await stat(path).catch(() => null)) return { path, source: directory, temporary: false };
  }
  if (listFallback().includes(name)) {
    const temporary = await mkdtemp(join(tmpdir(), 'vernier-restore-'));
    const path = join(temporary, name);
    compose(['cp', `app:/app/storage/backups/${name}`, path]);
    return { path, source: 'container fallback', temporary: true, cleanup: temporary };
  }
  fail(EXIT.usage, `no archive called ${name} on this host or in the container`);
  return null;
}

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------

async function readManifest(path, key) {
  const whole = await collect(decryptArchive(key, createReadStream(path)));
  const members = readTar(whole);
  const manifest = members.find((member) => member.name === MANIFEST_MEMBER);
  if (!manifest) throw new ArchiveError('member_missing', { member: MANIFEST_MEMBER });
  return { manifest: parseManifest(manifest.body), members };
}

async function verify(name) {
  const found = await resolveArchive(name);
  const key = secret();
  const listing = [];
  let manifest = null;
  try {
    // Pass one: every chunk's tag and every member's digest, streamed, holding
    // nothing. This is the pass that has to work on an archive holding six
    // months of photographs.
    for await (const entry of scanTar(decryptArchive(key, createReadStream(found.path)))) {
      listing.push(entry);
    }
    // Pass two: the manifest itself, which is the one member small enough to
    // hold and the only one whose CONTENT this command reads.
    manifest = (await readManifest(found.path, key)).manifest;
  } catch (error) {
    say(`archive   ${found.path}`);
    fail(EXIT.integrity, describe(error));
  } finally {
    if (found.cleanup) await rm(found.cleanup, { recursive: true, force: true });
  }

  const problems = reconcileMembers(manifest, listing);
  say(`archive   ${found.path}`);
  say(`found in  ${found.source}`);
  say(`written   ${manifest.createdAt} by vernier ${manifest.app.version}, schema at ${manifest.app.migrations} migrations`);
  say(`runtime   node ${manifest.runtime.node} on ${manifest.runtime.platform}, postgres ${manifest.runtime.postgres}`);
  say(`database  ${manifest.database.name}, ${manifest.database.tables} tables, ${manifest.database.rows} rows`);
  say(`storage   ${manifest.storage.files} files, ${manifest.storage.bytes} bytes`);
  say('members');
  for (const entry of listing) {
    say(`  ${entry.name.padEnd(14)} ${String(entry.size).padStart(12)} bytes  ${entry.sha256}`);
  }
  say('tables');
  for (const table of manifest.tables) {
    say(`  ${table.table.padEnd(34)} ${String(table.rows).padStart(8)}${table.modelled ? '' : '  (not modelled by the app)'}`);
  }

  if (problems.length > 0) {
    for (const problem of problems) say(`  ${problem.code} ${problem.member}`);
    fail(EXIT.integrity, `${problems.length} member(s) do not match the manifest`);
  }
  say('');
  say(`every chunk authenticated and every member matched its digest`);
  return { found, manifest, listing };
}

// ---------------------------------------------------------------------------
// restore
// ---------------------------------------------------------------------------

/**
 * Rebuilds a database from an archive and compares the row counts.
 *
 * THE TARGET IS ALWAYS DROPPED AND RECREATED. A load into a database that
 * already holds rows would double every table it touched, and comparing the
 * counts afterwards would report a mismatch rather than the real problem. The
 * live database is refused outright unless the operator types the phrase.
 */
async function restore(name, options) {
  const target = options.into;
  if (!target || !/^[a-z_][a-z0-9_]*$/.test(target)) {
    fail(EXIT.usage, 'name the database to rebuild into with --into <name>');
  }
  const live = liveDatabase();
  if (target === live) {
    if (!options.overTheLive) {
      fail(
        EXIT.refused,
        `${target} is the live database. Restoring over it needs --over-the-live-database and a typed phrase.`,
      );
    }
    const phrase = await readPhrase(`restore over ${target}`);
    if (phrase !== `restore over ${target}`) {
      fail(EXIT.refused, 'that phrase does not match, so nothing was changed');
    }
  }

  const { found, manifest } = await verify(name);
  const key = secret();
  const { members } = await readManifest(found.path, key);
  const schema = members.find((member) => member.name === SCHEMA_MEMBER);
  const data = members.find((member) => member.name === DATA_MEMBER);
  const storage = members.find((member) => member.name === STORAGE_MEMBER);
  if (!schema || !data) fail(EXIT.integrity, 'this archive holds no schema or no data section');

  say('');
  say(`rebuilding ${target} from ${found.path}`);
  psql(live || 'postgres', `drop database if exists ${target} with (force)`, { tolerate: true });
  psql(live || 'postgres', `create database ${target}`);
  psqlFile(target, schema.body.toString('utf8'));
  psqlFile(target, data.body.toString('utf8'));

  // The comparison, table by table, in one statement.
  const union = manifest.tables
    .map(
      (table) =>
        `select '${table.table}' as t, count(*)::bigint as n from ${table.table
          .split('.')
          .map((part) => `"${part}"`)
          .join('.')}`,
    )
    .join(' union all ');
  const counted = psql(target, `${union} order by t`);
  const restored = new Map(
    counted
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [table, count] = line.split('|');
        return [table, Number(count)];
      }),
  );

  const differences = [];
  let sourceRows = 0;
  let restoredRows = 0;
  say('');
  say('table                              source   restored');
  for (const table of manifest.tables) {
    const after = restored.get(table.table) ?? 0;
    sourceRows += table.rows;
    restoredRows += after;
    const flag = after === table.rows ? '' : '   <-- DIFFERENT';
    say(`  ${table.table.padEnd(32)} ${String(table.rows).padStart(6)} ${String(after).padStart(10)}${flag}`);
    if (after !== table.rows) differences.push({ table: table.table, source: table.rows, restored: after });
  }
  say('');
  say(`${manifest.tables.length} tables, ${sourceRows} rows in the archive, ${restoredRows} rows restored`);

  if (options.storageInto && storage) {
    await writeFile(options.storageInto, storage.body);
    say(`storage    written to ${options.storageInto}, unpack it with tar -xf`);
  }

  if (found.cleanup) await rm(found.cleanup, { recursive: true, force: true });

  const outcome = differences.length === 0 ? 'matched' : 'mismatched';
  if (options.record) {
    // The record goes in the LIVE database, because that is where the operator
    // console reads "last restore check" from. It is an insert and nothing else.
    const escape = (value) => String(value).replace(/'/g, "''");
    psql(
      live,
      `insert into restore_check (id, archive_name, target_database, outcome, tables_compared, source_rows, restored_rows, differences, cause)
       values (gen_random_uuid()::text, '${escape(name)}', '${escape(target)}', '${outcome}',
               ${manifest.tables.length}, ${sourceRows}, ${restoredRows}, '${escape(JSON.stringify(differences))}'::jsonb, '')`,
    );
    say(`recorded   restore_check on ${live}`);
  }

  if (differences.length > 0) {
    fail(EXIT.mismatch, `${differences.length} table(s) came back with a different count`);
  }
  say('every table came back with the count the archive recorded');
}

async function readPhrase(expected) {
  process.stdout.write(`Type "${expected}" to continue: `);
  const chunks = [];
  for await (const piece of process.stdin) chunks.push(piece);
  return Buffer.concat(chunks).toString('utf8').trim();
}

// ---------------------------------------------------------------------------
// corrupt, which exists so integrity can be proven by FAILURE.
// ---------------------------------------------------------------------------

/**
 * Produces a deliberately damaged copy of an archive.
 *
 * F125 asks for three of them, each exiting non-zero with a named error, and an
 * archive that has only ever been read whole has not been tested. The damage is
 * done here rather than by hand so the evidence is one command per case and the
 * same three cases are reproducible a year from now.
 */
async function corrupt(name, options) {
  const found = await resolveArchive(name);
  const whole = await readFile(found.path);
  const out = options.out ?? `${found.path}.${options.mode}`;

  const frames = [];
  let offset = 48;
  while (offset + 5 <= whole.length) {
    const length = whole.readUInt32BE(offset);
    const final = whole.readUInt8(offset + 4) === 1;
    frames.push({ start: offset, end: offset + 5 + length + 16 });
    if (final) break;
    offset = offset + 5 + length + 16;
  }
  if (frames.length < 4 && options.mode === 'reorder') {
    fail(EXIT.usage, 'this archive has too few chunks to reorder two of them');
  }

  let damaged;
  if (options.mode === 'truncate') {
    damaged = whole.subarray(0, frames[Math.max(1, frames.length - 2)].start);
  } else if (options.mode === 'reorder') {
    damaged = Buffer.from(whole);
    const a = whole.subarray(frames[0].start, frames[0].end);
    const b = whole.subarray(frames[1].start, frames[1].end);
    b.copy(damaged, frames[0].start);
    a.copy(damaged, frames[0].start + b.length);
  } else if (options.mode === 'flip') {
    damaged = Buffer.from(whole);
    const at = frames[Math.min(1, frames.length - 1)].start + 9;
    damaged[at] ^= 0x40;
  } else {
    fail(EXIT.usage, 'the mode is truncate, reorder or flip');
  }

  await writeFile(out, damaged);
  if (found.cleanup) await rm(found.cleanup, { recursive: true, force: true });
  say(`${options.mode.padEnd(9)} ${whole.length} bytes in, ${damaged.length} bytes out, written to ${out}`);
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

async function list() {
  let total = 0;
  for (const directory of await hostDirectories()) {
    const found = await listDirectory(directory);
    say(`${directory}  (${found.length})`);
    for (const entry of found) say(`  ${entry.name}  ${entry.bytes} bytes`);
    total += found.length;
  }
  const inside = listFallback();
  say(`container /app/storage/backups  (${inside.length})`);
  for (const entry of inside) say(`  ${entry}`);
  total += inside.length;
  say('');
  say(`${total} archive(s) reachable from this machine`);
}

// ---------------------------------------------------------------------------

const [command, ...rest] = process.argv.slice(2);
const flags = {};
for (let index = 0; index < rest.length; index += 1) {
  const argument = rest[index];
  if (argument === '--into') flags.into = rest[++index];
  else if (argument === '--mode') flags.mode = rest[++index];
  else if (argument === '--out') flags.out = rest[++index];
  else if (argument === '--storage-into') flags.storageInto = rest[++index];
  else if (argument === '--record') flags.record = true;
  else if (argument === '--over-the-live-database') flags.overTheLive = true;
  else if (!flags.name) flags.name = argument;
}

try {
  if (command === 'list') await list();
  else if (command === 'verify') await verify(flags.name ?? '');
  else if (command === 'restore') await restore(flags.name ?? '', flags);
  else if (command === 'corrupt') await corrupt(flags.name ?? '', flags);
  else {
    process.stderr.write(
      [
        'restore: the commands are list, verify, restore and corrupt.',
        '',
        '  node scripts/restore.mjs list',
        '  node scripts/restore.mjs verify <archive>',
        '  node scripts/restore.mjs restore <archive> --into <database> [--record] [--storage-into <path>]',
        '  node scripts/restore.mjs corrupt <archive> --mode truncate|reorder|flip --out <path>',
        '',
        'An <archive> is a file name or a path. A bare name is looked for in the',
        'configured backup directory, then in ./backups, then inside the container.',
        '',
      ].join('\n'),
    );
    process.exit(EXIT.usage);
  }
} catch (error) {
  fail(EXIT.integrity, describe(error));
}
