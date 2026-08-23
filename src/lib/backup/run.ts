import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  ArchiveError,
  type TarEntry,
  collect,
  decryptArchive,
  encryptArchive,
  scanTar,
  tarEntries,
  tarSize,
} from './archive';
import { DEFAULT_BACKUP_MOUNT, FALLBACK_DIRECTORY, freeBytes, resolveDestination } from './destination';
import {
  type LiveTable,
  type TableTally,
  countRows,
  dumpData,
  dumpOrder,
  planDump,
} from './dump';
import {
  DATA_MEMBER,
  MANIFEST_MEMBER,
  MANIFEST_VERSION,
  type Manifest,
  type MemberDigest,
  SCHEMA_MEMBER,
  STORAGE_MEMBER,
  manifestBytes,
  parseManifest,
  reconcileMembers,
} from './manifest';
import { PART_SUFFIX, applyRetention, archiveName, retentionSetting } from './retention';
import { archiveSecret } from './secret';
import { enumerateSchemaTables, loadOrder } from './tables';
import * as schema from '@/db/schema';
import {
  type BackupRunView,
  finishBackupRun,
  startBackupRun,
} from '@/db/backup';
import { getPool } from '@/db/client';
import { storageRoot } from '@/lib/lab-storage';

/**
 * One archive, end to end.
 *
 * ORDER MATTERS AND THIS IS THE ORDER.
 *
 *   1. A row, before anything else, so a run that dies leaves `running` rather
 *      than leaving nothing.
 *   2. The destination, PROVEN BY WRITING a probe rather than by asking whether
 *      a directory exists.
 *   3. The three members, into a temporary directory ON THE CONTAINER'S OWN
 *      DISK. Never into the destination: the destination is a folder inside
 *      iCloud Drive, and a plaintext dump written there would be synced to
 *      Apple before the encryption ran. What lands in that folder is one
 *      encrypted file and nothing else, ever.
 *   4. The archive, streamed through the cipher into `.name.part`, then renamed.
 *      A reader that finds `vernier-...archive` finds a whole one.
 *   5. VERIFIED BY READING IT BACK. Every tag, every member digest, against the
 *      manifest. An archive that has only ever been written has not been tested,
 *      and the cheapest moment to find out is now rather than in an emergency.
 *   6. Retention, counted.
 *   7. The row, finished, with the numbers.
 *
 * Nothing here throws at the caller. A failure is a `failed` row with a cause
 * token, because the caller is a cron tick at 03:00 and a rejected promise
 * inside one is a container log nobody reads.
 */

/** Where compose mounts the configured destination. Overridable for the suite. */
export function backupMount(env: Record<string, string | undefined> = process.env): string {
  return (env.BACKUP_MOUNT ?? '').trim() || DEFAULT_BACKUP_MOUNT;
}

/** The host path the owner configured, which is what an alert has to name. */
export function configuredDirectory(env: Record<string, string | undefined> = process.env): string {
  return (env.BACKUP_DIR ?? '').trim();
}

/** Where the migrator's SQL lives inside the image, and so where the schema comes from. */
function migrationsFolder(env: Record<string, string | undefined> = process.env): string {
  return (env.MIGRATIONS_FOLDER ?? '').trim() || './drizzle';
}

export type StorageEntry = { name: string; path: string; size: number };

/**
 * Every file on the storage volume, except the archives themselves.
 *
 * THE EXCLUSION IS NOT AN OPTIMISATION. The fallback destination is a directory
 * INSIDE this volume, so an archive that included it would hold last night's
 * archive, which held the night before's, and the file would double in size
 * every day until the disk went. It is excluded by name and the manifest says
 * so, which is the difference between a decision and an omission.
 */
export async function walkStorage(root: string, exclude: string[] = []): Promise<StorageEntry[]> {
  const found: StorageEntry[] = [];
  const skip = new Set(exclude);

  async function descend(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const name = relative(root, path);
      if (skip.has(name.split('/')[0])) continue;
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        await descend(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const info = await stat(path).catch(() => null);
      if (!info) continue;
      found.push({ name: `storage/${name}`, path, size: info.size });
    }
  }

  await descend(root);
  return found.sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * The volume's files as tar members, each opened only when it is reached.
 *
 * `createReadStream` opens its descriptor as soon as it is constructed, so
 * mapping every file to one up front would hold a descriptor per file for the
 * whole run. A volume with ten thousand meal photographs on it would exhaust
 * the process's limit before the first byte was written. An async generator's
 * body does not run until it is iterated, which is what makes this lazy.
 */
function storageTarEntries(entries: StorageEntry[]): TarEntry[] {
  return entries.map((entry) => ({
    name: entry.name,
    size: entry.size,
    body: (async function* () {
      yield* createReadStream(entry.path);
    })(),
  }));
}

/**
 * The migrator's own schema and ledger, which no migration file creates.
 *
 * READ THIS BEFORE DELETING IT. `drizzle.__drizzle_migrations` is created by
 * drizzle-orm in code, in `PgDialect.migrate`, before it applies the first
 * generated file. Nothing under `drizzle/` mentions it. The dump keeps that
 * table, deliberately and with a test on it, because an archive that restored
 * without the ledger would come back up and try to migrate the whole schema a
 * second time. So the schema section has to be able to build it, and the
 * concatenated migrations cannot.
 *
 * F126 is the line that found this: a restore loaded the data section into a
 * database with no `drizzle` schema at all, the first insert raised, psql
 * stopped on it and the script exited 5 with `psql refused the load`. Every
 * archive this product had ever written was unrestorable and every check up to
 * that point had passed.
 *
 * The statements are the ones drizzle-orm issues, with the same names, the same
 * types and the same `if not exists` guards, so applying this into a database
 * the migrator has already touched changes nothing.
 *
 * LOWER CASE AND NO FULL STOP, like every other statement dump.ts writes. C6's
 * source checker reads every literal under src/ whatever it is for, and machine
 * text stays machine shaped so the words that belong to a screen stay the only
 * things that look like sentences.
 */
export const MIGRATOR_LEDGER_SQL =
  '\n-- the migrator ledger, which drizzle-orm creates in code and not in a file\n' +
  'create schema if not exists "drizzle";\n' +
  'create table if not exists "drizzle"."__drizzle_migrations" (\n' +
  '  id serial primary key,\n' +
  '  hash text not null,\n' +
  '  created_at bigint\n' +
  ');\n';

/** Every generated migration, concatenated, which is the schema this data fits. */
export async function schemaSql(folder: string): Promise<string> {
  const names = (await readdir(folder).catch(() => [] as string[]))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const parts: string[] = [
    '-- vernier schema section, every generated migration in order\n',
    '-- apply with psql into an empty database, then load the data section\n',
    MIGRATOR_LEDGER_SQL,
  ];
  for (const name of names) {
    parts.push(`\n-- ${name}\n`);
    parts.push(await readFile(join(folder, name), 'utf8'));
    parts.push('\n');
  }
  return parts.join('');
}

async function writeMember(path: string, source: AsyncIterable<string | Uint8Array>): Promise<MemberDigest> {
  const hash = createHash('sha256');
  let bytes = 0;
  const handle = createWriteStream(path);
  await pipeline(
    (async function* () {
      for await (const piece of source) {
        const buffer = typeof piece === 'string' ? Buffer.from(piece, 'utf8') : Buffer.from(piece);
        hash.update(buffer);
        bytes += buffer.length;
        yield buffer;
      }
    })(),
    handle,
  );
  return { name: basename(path), bytes, sha256: hash.digest('hex') };
}

async function digestOf(source: AsyncIterable<Uint8Array>): Promise<{ bytes: number; sha256: string }> {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const piece of source) {
    hash.update(piece);
    bytes += piece.length;
  }
  return { bytes, sha256: hash.digest('hex') };
}

export type ArchiveFailure = { cause: string; detail: Record<string, unknown> };

function failureOf(error: unknown): ArchiveFailure {
  if (error instanceof ArchiveError) {
    return {
      cause: error.code,
      detail: {
        sequence: error.sequence,
        claimed: error.claimed,
        actual: error.actual,
        member: error.member,
      },
    };
  }
  const errno = (error as NodeJS.ErrnoException).code;
  if (errno === 'ENOSPC') return { cause: 'no_space', detail: { errno } };
  return {
    cause: errno ?? 'archive_failed',
    // The message, never the stack: a stack from inside a container names paths
    // and module versions and none of it helps the person reading the banner.
    detail: { message: (error as Error).message?.slice(0, 300) ?? '' },
  };
}

export async function runArchive(input: {
  kind: 'scheduled' | 'manual';
  periodStart?: string | null;
  now?: Date;
}): Promise<BackupRunView> {
  const now = input.now ?? new Date();
  const run = await startBackupRun({ kind: input.kind, periodStart: input.periodStart ?? null });
  const storage = storageRoot();
  const fallback = join(storage, FALLBACK_DIRECTORY);

  const destination = await resolveDestination({
    mount: backupMount(),
    hostPath: configuredDirectory(),
    fallback,
  });

  // Both destinations refused. There is nowhere to put an archive, and that is
  // a failed run rather than a fallback: saying "written to the fallback" about
  // a file that does not exist is the shape of lie this whole slice is against.
  //
  // It is `usable` and not a reading of the cause, because the cause of a
  // WORKING fallback is the configured destination's failure: the two states
  // carry the same token and the same errno and differ only in whether the
  // second directory took the probe.
  if (!destination.usable) {
    return (
      (await finishBackupRun(run.id, {
        outcome: 'failed',
        destination: 'fallback',
        directory: destination.displayPath,
        writtenTo: destination.path,
        cause: destination.cause,
        detail: destination.detail,
        integrity: 'unchecked',
      })) ?? run
    );
  }

  const temporary = await mkdtemp(join(tmpdir(), 'vernier-archive-'));
  const name = archiveName(now);
  const partPath = join(destination.path, `.${name}${PART_SUFFIX}`);
  const finalPath = join(destination.path, name);

  try {
    const secret = archiveSecret();
    const modelled = enumerateSchemaTables(schema as unknown as Record<string, unknown>);

    // ---- the schema section
    const schemaPath = join(temporary, SCHEMA_MEMBER);
    const schemaText = await schemaSql(migrationsFolder());
    const schemaDigest = await writeMember(
      schemaPath,
      (async function* () {
        yield schemaText;
      })(),
    );

    // ---- the data section, in one snapshot
    const pool = getPool();
    const client = await pool.connect();
    const tally: TableTally[] = [];
    let ordered: LiveTable[] = [];
    let counts: TableTally[] = [];
    let migrations = 0;
    let postgres = '';
    let databaseName = '';
    let dataDigest: MemberDigest;
    try {
      // READ ONLY as well as REPEATABLE READ. The dump cannot write, whatever a
      // later edit does to the statements below it.
      await client.query('begin isolation level repeatable read read only');
      const wrapped = { query: (text: string) => client.query(text) };
      const plan = await planDump(wrapped, modelled);
      ordered = dumpOrder(plan, loadOrder(modelled));
      counts = await countRows(wrapped, ordered);
      const meta = await client.query(
        'select current_database() as db, current_setting(\'server_version\') as version',
      );
      databaseName = String(meta.rows[0]?.db ?? '');
      postgres = String(meta.rows[0]?.version ?? '');
      /*
       * TWO STATEMENTS, AND THE FIRST ONE IS WHY. A count against a table that
       * does not exist raises, and a raise inside a transaction poisons it: the
       * dump that followed would fail with "current transaction is aborted"
       * and the cause would be a swallowed catch three lines up. So the
       * existence is asked first, with a function that answers null rather than
       * raising.
       */
      const ledger = await client.query(
        "select to_regclass('drizzle.__drizzle_migrations') is not null as present",
      );
      if (ledger.rows[0]?.present === true) {
        const applied = await client.query('select count(*)::int as n from drizzle.__drizzle_migrations');
        migrations = Number(applied.rows[0]?.n ?? 0);
      }

      dataDigest = await writeMember(
        join(temporary, DATA_MEMBER),
        dumpData(wrapped, ordered, plan.sequences, tally),
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    // ---- the media and document volume, measured before it is written
    const files = await walkStorage(storage, [FALLBACK_DIRECTORY]);
    const storageBytes = tarSize(files.map((file) => ({ size: file.size })));
    const storageDigest =
      files.length === 0
        ? await digestOf(tarEntries([]))
        : await digestOf(tarEntries(storageTarEntries(files)));

    const manifest: Manifest = {
      manifestVersion: MANIFEST_VERSION,
      archiveFormat: 1,
      createdAt: now.toISOString(),
      timeZone: process.env.TZ?.trim() || 'Europe/Paris',
      app: {
        name: 'vernier',
        version: process.env.npm_package_version ?? '0.1.0',
        migrations,
      },
      runtime: { node: process.version, platform: process.platform, postgres },
      database: {
        name: databaseName,
        tables: ordered.length,
        rows: counts.reduce((total, row) => total + row.rows, 0),
      },
      members: [
        { name: SCHEMA_MEMBER, bytes: schemaDigest.bytes, sha256: schemaDigest.sha256 },
        { name: DATA_MEMBER, bytes: dataDigest.bytes, sha256: dataDigest.sha256 },
        { name: STORAGE_MEMBER, bytes: storageDigest.bytes, sha256: storageDigest.sha256 },
      ],
      tables: counts.map((row) => ({
        table: row.table,
        rows: row.rows,
        modelled: ordered.find((table) => `${table.schema}.${table.name}` === row.table)?.modelled ?? false,
      })),
      storage: {
        root: storage,
        files: files.length,
        bytes: files.reduce((total, file) => total + file.size, 0),
        directories: [FALLBACK_DIRECTORY],
      },
      destination: { kind: destination.kind, directory: destination.displayPath },
    };
    const manifestMember = manifestBytes(manifest);

    // ---- the archive itself
    const members: TarEntry[] = [
      { name: MANIFEST_MEMBER, size: manifestMember.length, body: manifestMember },
      {
        name: SCHEMA_MEMBER,
        size: schemaDigest.bytes,
        body: createReadStream(join(temporary, SCHEMA_MEMBER)),
      },
      {
        name: DATA_MEMBER,
        size: dataDigest.bytes,
        body: createReadStream(join(temporary, DATA_MEMBER)),
      },
      {
        name: STORAGE_MEMBER,
        size: storageBytes,
        body: tarEntries(storageTarEntries(files)),
      },
    ];

    let chunks = 0;
    await pipeline(
      Readable.from(
        (async function* () {
          for await (const piece of encryptArchive(secret.secret, tarEntries(members))) {
            chunks += 1;
            yield piece;
          }
        })(),
      ),
      createWriteStream(partPath),
    );
    await rename(partPath, finalPath);
    const written = await stat(finalPath);

    // ---- verified by reading it back
    const found: Array<{ name: string; size: number; sha256: string }> = [];
    await (async () => {
      const source = createReadStream(finalPath);
      for await (const entry of scanTar(decryptArchive(secret.secret, source))) {
        found.push({ name: entry.name, size: entry.size, sha256: entry.sha256 });
      }
    })();
    const problems = reconcileMembers(manifest, found);
    if (problems.length > 0) {
      return (
        (await finishBackupRun(run.id, {
          outcome: 'failed',
          destination: destination.kind,
          directory: destination.displayPath,
          writtenTo: destination.path,
          fileName: name,
          bytes: written.size,
          chunks,
          integrity: 'failed',
          cause: problems[0].code,
          detail: { problems: problems.map((problem) => `${problem.code}:${problem.member}`) },
        })) ?? run
      );
    }

    // ---- retention, counted rather than documented
    const keep = retentionSetting();
    const retention = await applyRetention(destination.path, keep);

    return (
      (await finishBackupRun(run.id, {
        outcome: 'ok',
        destination: destination.kind,
        directory: destination.displayPath,
        writtenTo: destination.path,
        fileName: name,
        bytes: written.size,
        chunks,
        integrity: 'verified',
        cause: destination.cause,
        detail: { ...destination.detail, keep },
        tableCount: ordered.length,
        rowCount: manifest.database.rows,
        manifestDigest: createHash('sha256').update(manifestMember).digest('hex'),
        freeBytes: await freeBytes(destination.path),
        kept: retention.kept.length,
        removed: retention.removed.length,
      })) ?? run
    );
  } catch (error) {
    const failure = failureOf(error);
    await rm(partPath, { force: true }).catch(() => undefined);
    return (
      (await finishBackupRun(run.id, {
        outcome: 'failed',
        destination: destination.kind,
        directory: destination.displayPath,
        writtenTo: destination.path,
        cause: failure.cause,
        detail: { ...destination.detail, ...failure.detail },
        integrity: 'unchecked',
      })) ?? run
    );
  } finally {
    await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Reads an archive back into memory. For the suite and for the manifest reader.
 *
 * Deliberately NOT what the verification path uses: that one streams, because
 * an archive holding six months of photographs must not be read into a Buffer
 * to be checked. This exists for a manifest and for tests.
 */
export async function readArchiveManifest(path: string, secret: string): Promise<Manifest> {
  const whole = await collect(decryptArchive(secret, createReadStream(path)));
  const { readTar } = await import('./archive');
  const member = readTar(whole).find((entry) => entry.name === MANIFEST_MEMBER);
  if (!member) throw new ArchiveError('member_missing', { member: MANIFEST_MEMBER });
  return parseManifest(member.body);
}
