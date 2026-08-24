import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ArchiveError,
  decryptArchive,
  encryptArchive,
  scanTar,
  tarEntries,
  tarSize,
} from '@/lib/backup/archive';
import { FALLBACK_DIRECTORY, probeDirectory, resolveDestination } from '@/lib/backup/destination';
import {
  DATA_MEMBER,
  MANIFEST_MEMBER,
  MANIFEST_VERSION,
  type Manifest,
  SCHEMA_MEMBER,
  STORAGE_MEMBER,
  manifestBytes,
  reconcileMembers,
} from '@/lib/backup/manifest';
import { applyRetention, archiveName, isArchiveName, selectForRemoval } from '@/lib/backup/retention';
import { archiveSecret } from '@/lib/backup/secret';
import { MIGRATOR_LEDGER_SQL, schemaSql, walkStorage } from '@/lib/backup/run';

/**
 * The archive path over real files, real streams and a real directory.
 *
 * `runArchive` itself needs Postgres and belongs to the Playwright suite. What
 * is here is everything around it that decides whether an archive is written,
 * where it lands, what it contains and which of them are kept, and all of that
 * is filesystem behaviour that a fake would only ever agree with.
 *
 * THE THREE CORRUPTIONS ARE APPLIED TO A FILE ON DISK, not to a buffer, and
 * read back through the same streaming verifier the nightly run uses. An
 * archive that has only ever been written has not been tested.
 */

let root = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'vernier-backup-test-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('the storage walk', () => {
  it('takes every file on the volume and never the archives inside it', async () => {
    const storage = join(root, 'storage');
    await mkdir(join(storage, 'labs'), { recursive: true });
    await mkdir(join(storage, 'meals'), { recursive: true });
    await mkdir(join(storage, FALLBACK_DIRECTORY), { recursive: true });
    await writeFile(join(storage, 'labs', 'lab_one.pdf'), 'a laboratory document');
    await writeFile(join(storage, 'meals', 'meal_one.jpg'), 'a photograph');
    await writeFile(join(storage, FALLBACK_DIRECTORY, archiveName(new Date())), 'last night');
    await writeFile(join(storage, '.DS_Store'), 'finder');

    const found = await walkStorage(storage, [FALLBACK_DIRECTORY]);
    console.log(`walked ${found.length} files: ${found.map((entry) => entry.name).join(', ')}`);
    expect(found.map((entry) => entry.name)).toEqual([
      'storage/labs/lab_one.pdf',
      'storage/meals/meal_one.jpg',
    ]);
    expect(found.every((entry) => entry.size > 0)).toBe(true);
  });

  it('answers with nothing on a volume that is empty, rather than throwing', async () => {
    const storage = join(root, 'empty');
    await mkdir(storage, { recursive: true });
    expect(await walkStorage(storage, [FALLBACK_DIRECTORY])).toEqual([]);
  });
});

describe('the destination', () => {
  it('takes the configured mount when it can really be written to', async () => {
    const mount = join(root, 'icloud');
    await mkdir(mount, { recursive: true });
    const destination = await resolveDestination({
      mount,
      hostPath: '/Users/owner/Library/Mobile Documents/com~apple~CloudDocs/Vernier',
      fallback: join(root, 'fallback'),
    });
    expect(destination.kind).toBe('configured');
    expect(destination.cause).toBe('');
    // The path it writes to and the path it NAMES are different things, and the
    // one the alert shows is the one the owner can act on.
    expect(destination.path).toBe(mount);
    expect(destination.displayPath).toContain('CloudDocs');
  });

  it('falls back and names the cause when the mount is not there', async () => {
    const destination = await resolveDestination({
      mount: join(root, 'gone'),
      hostPath: '/Users/owner/Library/Mobile Documents/com~apple~CloudDocs/Vernier',
      fallback: join(root, 'fallback'),
    });
    expect(destination.kind).toBe('fallback');
    expect(destination.cause).toBe('missing');
    expect(destination.detail.configured).toContain('CloudDocs');
    // And the fallback was created, because a first run is not a failure.
    expect((await stat(destination.path)).isDirectory()).toBe(true);
  });

  it('tells a working fallback from a run with nowhere to write', async () => {
    // The two states carry the SAME cause and the SAME errno, and the only
    // difference is whether the second directory took the probe. A caller that
    // read the cause to tell them apart would report an archive written to a
    // fallback that refused it, which is the one lie this module must not tell.
    const working = await resolveDestination({
      mount: join(root, 'gone'),
      hostPath: '/Users/owner/CloudDocs/Vernier',
      fallback: join(root, 'fallback'),
    });
    expect(working.kind).toBe('fallback');
    expect(working.usable).toBe(true);

    // A file where the fallback directory would be, so it can be neither used
    // nor created.
    const blocked = join(root, 'fallback-is-a-file');
    await writeFile(blocked, 'in the way');
    const nowhere = await resolveDestination({
      mount: join(root, 'gone'),
      hostPath: '/Users/owner/CloudDocs/Vernier',
      fallback: blocked,
    });
    console.log(`nowhere to write: cause ${nowhere.cause}, usable ${nowhere.usable}`);
    expect(nowhere.kind).toBe('fallback');
    expect(nowhere.usable).toBe(false);
    expect(working.cause).toBe('missing');
  });

  it('says so when no destination is configured at all', async () => {
    const destination = await resolveDestination({
      mount: join(root, 'unused'),
      hostPath: '   ',
      fallback: join(root, 'fallback'),
    });
    expect(destination.kind).toBe('fallback');
    expect(destination.cause).toBe('not_configured');
  });

  it('proves a directory by writing to it, not by asking whether it exists', async () => {
    const file = join(root, 'a-file-not-a-directory');
    await writeFile(file, 'x');
    const probe = await probeDirectory(file, false);
    expect(probe.ok).toBe(false);
    expect(probe.cause).toBe('not_a_directory');
  });

  it('leaves nothing behind after a probe', async () => {
    const directory = join(root, 'probe-me');
    await mkdir(directory);
    expect((await probeDirectory(directory, false)).ok).toBe(true);
    expect(await readdir(directory)).toEqual([]);
  });
});

describe('retention', () => {
  it('keeps exactly three archives after a fourth run, and prints each listing', async () => {
    const directory = join(root, 'archives');
    await mkdir(directory);
    const listings: string[] = [];
    for (let day = 1; day <= 4; day += 1) {
      const name = archiveName(new Date(Date.UTC(2026, 7, 20 + day, 3, 0, day)));
      await writeFile(join(directory, name), `archive ${day}`);
      const outcome = await applyRetention(directory, 3);
      const listing = (await readdir(directory)).sort();
      listings.push(`run ${day}: ${listing.join(' ')} (removed ${outcome.removed.length})`);
    }
    console.log(listings.join('\n'));
    const left = (await readdir(directory)).sort();
    expect(left).toHaveLength(3);
    // The three NEWEST, and the first one is the one that went.
    expect(left[0]).toContain('20260822');
    expect(left[2]).toContain('20260824');
  });

  it('never removes a file that is not one of ours', async () => {
    const directory = join(root, 'shared-icloud-folder');
    await mkdir(directory);
    await writeFile(join(directory, 'IMG_4021.HEIC'), 'a photograph of a dog');
    await writeFile(join(directory, 'notes.md'), 'a note');
    await writeFile(join(directory, 'vernier-backup-old.zip'), 'something with our name on it');
    for (let day = 1; day <= 4; day += 1) {
      await writeFile(
        join(directory, archiveName(new Date(Date.UTC(2026, 7, 20 + day, 3, 0, 0)))),
        `archive ${day}`,
      );
      await applyRetention(directory, 1);
    }
    const left = (await readdir(directory)).sort();
    console.log(`the folder holds: ${left.join(', ')}`);
    expect(left).toContain('IMG_4021.HEIC');
    expect(left).toContain('notes.md');
    expect(left).toContain('vernier-backup-old.zip');
    expect(left.filter(isArchiveName)).toHaveLength(1);
  });

  it('sweeps a half-written part file away and never counts it as an archive', async () => {
    const directory = join(root, 'interrupted');
    await mkdir(directory);
    const name = archiveName(new Date());
    await writeFile(join(directory, `.${name}.part`), 'half an archive');
    await writeFile(join(directory, name), 'a whole one');
    const outcome = await applyRetention(directory, 30);
    expect(outcome.kept).toEqual([name]);
    expect(await readdir(directory)).toEqual([name]);
  });

  it('counts archives rather than days, which is what a fourth run in one afternoon needs', () => {
    const names = [1, 2, 3, 4].map((n) => archiveName(new Date(Date.UTC(2026, 7, 23, 14, n, 0))));
    const plan = selectForRemoval(names, 3);
    expect(plan.removed).toEqual([names[0]]);
    expect(plan.kept).toHaveLength(3);
    expect(plan.considered).toBe(4);
  });
});

describe('an archive on disk', () => {
  const secret = 'a-test-secret-that-is-not-the-master-key';

  async function buildArchive(): Promise<{ path: string; manifest: Manifest }> {
    const storage = join(root, 'storage');
    await mkdir(join(storage, 'labs'), { recursive: true });
    await writeFile(join(storage, 'labs', 'lab_one.pdf'), 'x'.repeat(9000));
    await writeFile(join(storage, 'labs', 'lab_two.pdf'), 'y'.repeat(4000));
    const files = await walkStorage(storage, [FALLBACK_DIRECTORY]);

    const schemaText = 'create table measurement (id text primary key);\n';
    const dataText = 'insert into "public"."measurement" ("id") values (\'a7bf989c\');\n';
    const storageBytes = tarSize(files.map((file) => ({ size: file.size })));

    const digest = async (source: AsyncIterable<Uint8Array>) => {
      const { createHash } = await import('node:crypto');
      const hash = createHash('sha256');
      let bytes = 0;
      for await (const piece of source) {
        hash.update(piece);
        bytes += piece.length;
      }
      return { bytes, sha256: hash.digest('hex') };
    };
    const storageDigest = await digest(
      tarEntries(files.map((file) => ({ name: file.name, size: file.size, body: createReadStream(file.path) }))),
    );
    const { createHash } = await import('node:crypto');

    const manifest: Manifest = {
      manifestVersion: MANIFEST_VERSION,
      archiveFormat: 1,
      createdAt: new Date().toISOString(),
      timeZone: 'Europe/Paris',
      app: { name: 'vernier', version: '0.1.0', migrations: 11 },
      runtime: { node: process.version, platform: process.platform, postgres: '18.1' },
      database: { name: 'health', tables: 1, rows: 1 },
      members: [
        {
          name: SCHEMA_MEMBER,
          bytes: Buffer.byteLength(schemaText),
          sha256: createHash('sha256').update(schemaText).digest('hex'),
        },
        {
          name: DATA_MEMBER,
          bytes: Buffer.byteLength(dataText),
          sha256: createHash('sha256').update(dataText).digest('hex'),
        },
        { name: STORAGE_MEMBER, bytes: storageDigest.bytes, sha256: storageDigest.sha256 },
      ],
      tables: [{ table: 'public.measurement', rows: 1, modelled: true }],
      storage: {
        root: storage,
        files: files.length,
        bytes: files.reduce((total, file) => total + file.size, 0),
        directories: [FALLBACK_DIRECTORY],
      },
      destination: { kind: 'fallback', directory: join(root, 'out') },
    };
    const manifestMember = manifestBytes(manifest);

    const out = join(root, 'out');
    await mkdir(out, { recursive: true });
    const path = join(out, archiveName(new Date()));
    await pipeline(
      encryptArchive(
        secret,
        tarEntries([
          { name: MANIFEST_MEMBER, size: manifestMember.length, body: manifestMember },
          { name: SCHEMA_MEMBER, size: Buffer.byteLength(schemaText), body: Buffer.from(schemaText) },
          { name: DATA_MEMBER, size: Buffer.byteLength(dataText), body: Buffer.from(dataText) },
          {
            name: STORAGE_MEMBER,
            size: storageBytes,
            body: tarEntries(
              files.map((file) => ({
                name: file.name,
                size: file.size,
                body: createReadStream(file.path),
              })),
            ),
          },
        ]),
        { chunkBytes: 4096 },
      ),
      createWriteStream(path),
    );
    return { path, manifest };
  }

  it('holds the dump, the volume and the manifest, and every digest matches', async () => {
    const { path, manifest } = await buildArchive();
    const found: Array<{ name: string; size: number; sha256: string }> = [];
    for await (const entry of scanTar(decryptArchive(secret, createReadStream(path)))) {
      found.push(entry);
    }
    console.log(
      `archive listing:\n${found.map((entry) => `${entry.name} ${entry.size} bytes ${entry.sha256.slice(0, 12)}`).join('\n')}`,
    );
    expect(found.map((entry) => entry.name)).toEqual([
      MANIFEST_MEMBER,
      SCHEMA_MEMBER,
      DATA_MEMBER,
      STORAGE_MEMBER,
    ]);
    expect(reconcileMembers(manifest, found)).toEqual([]);
    // And the volume inside the volume: two documents, unpacked from the member.
    const storageMember = found.find((entry) => entry.name === STORAGE_MEMBER);
    expect(storageMember!.size).toBeGreaterThan(13000);
  });

  it('names a member whose digest does not match what the manifest claims', async () => {
    const { manifest } = await buildArchive();
    const problems = reconcileMembers(manifest, [
      { name: MANIFEST_MEMBER, size: 10, sha256: 'deadbeef' },
      ...manifest.members
        .filter((member) => member.name !== STORAGE_MEMBER)
        .map((member) => ({ name: member.name, size: member.bytes, sha256: member.sha256 })),
      { name: STORAGE_MEMBER, size: 1, sha256: 'not-the-digest' },
    ]);
    expect(problems.map((problem) => `${problem.code}:${problem.member}`)).toEqual([
      'member_size_mismatch:storage.tar',
      'member_digest_mismatch:storage.tar',
    ]);
  });

  it('refuses the same archive TRUNCATED, REORDERED and with a FLIPPED BYTE', async () => {
    const { path } = await buildArchive();
    const whole = await readFile(path);
    const outcomes: string[] = [];

    const read = async (bytes: Buffer): Promise<string> => {
      try {
        for await (const entry of scanTar(decryptArchive(secret, [bytes]))) void entry;
        return 'accepted';
      } catch (error) {
        const named = error as ArchiveError;
        return `${named.code}${named.sequence === null ? '' : ` at chunk ${named.sequence}`}`;
      }
    };

    outcomes.push(`whole: ${await read(whole)}`);
    outcomes.push(`truncated: ${await read(whole.subarray(0, Math.floor(whole.length / 2)))}`);

    const frames: number[] = [];
    let offset = 48;
    while (offset + 5 <= whole.length) {
      const length = whole.readUInt32BE(offset);
      const final = whole.readUInt8(offset + 4) === 1;
      frames.push(offset);
      if (final) break;
      offset += 5 + length + 16;
    }
    const swapped = Buffer.from(whole);
    const a = whole.subarray(frames[0], frames[1]);
    const b = whole.subarray(frames[1], frames[2]);
    b.copy(swapped, frames[0]);
    a.copy(swapped, frames[0] + b.length);
    outcomes.push(`reordered: ${await read(swapped)}`);

    const flipped = Buffer.from(whole);
    flipped[frames[1] + 9] ^= 0x40;
    outcomes.push(`flipped byte: ${await read(flipped)}`);

    console.log(outcomes.join('\n'));
    expect(outcomes[0]).toBe('whole: accepted');
    expect(outcomes[1]).toContain('archive_truncated');
    expect(outcomes[2]).toContain('archive_chunk_unauthenticated');
    expect(outcomes[3]).toContain('archive_chunk_unauthenticated');
  });
});

describe('the archive secret', () => {
  const saved = { passphrase: process.env.BACKUP_PASSPHRASE, master: process.env.MASTER_KEY };

  afterEach(() => {
    if (saved.passphrase === undefined) delete process.env.BACKUP_PASSPHRASE;
    else process.env.BACKUP_PASSPHRASE = saved.passphrase;
    if (saved.master === undefined) delete process.env.MASTER_KEY;
    else process.env.MASTER_KEY = saved.master;
  });

  it('prefers the passphrase and falls back to the master key', () => {
    expect(archiveSecret({ BACKUP_PASSPHRASE: 'a-long-passphrase', MASTER_KEY: 'k' })).toEqual({
      secret: 'a-long-passphrase',
      source: 'passphrase',
    });
    expect(archiveSecret({ MASTER_KEY: 'the-master-key' })).toEqual({
      secret: 'the-master-key',
      source: 'master_key',
    });
  });

  it('refuses to write an archive with no secret at all rather than writing a readable one', () => {
    expect(() => archiveSecret({})).toThrow(/archive_secret_missing/);
    expect(() => archiveSecret({ BACKUP_PASSPHRASE: '   ', MASTER_KEY: '' })).toThrow(
      /archive_secret_missing/,
    );
  });
});

describe('the schema section a restore applies', () => {
  const folder = new URL('../../drizzle', import.meta.url).pathname;

  it('carries the migrator ledger, which no generated migration creates', async () => {
    const names = (await readdir(folder)).filter((name) => name.endsWith('.sql')).sort();
    const migrations = (
      await Promise.all(names.map((name) => readFile(join(folder, name), 'utf8')))
    ).join('\n');

    /*
     * THE POPULATION BESIDE THE ZERO. Twelve generated files, none of which
     * mentions the ledger the dump keeps. That absence is the whole reason the
     * schema section carries the two statements below: drizzle-orm creates them
     * in code before it applies the first file, so an archive restored from the
     * migrations alone has no `drizzle` schema and the data section's first
     * insert raises.
     *
     * GOES RED IF: the preamble is dropped, or a migration starts creating the
     * ledger itself, in which case the preamble is the thing to delete.
     */
    console.log(`${names.length} generated migrations, ${migrations.length} characters`);
    expect(names.length).toBeGreaterThan(10);
    expect(migrations).not.toContain('__drizzle_migrations');

    const section = await schemaSql(folder);
    console.log(MIGRATOR_LEDGER_SQL.trim());
    expect(section).toContain('create schema if not exists "drizzle";');
    expect(section).toContain('create table if not exists "drizzle"."__drizzle_migrations"');
    // Before the first migration, because a load is applied in file order.
    expect(section.indexOf('__drizzle_migrations')).toBeLessThan(section.indexOf(names[0]));
    // And every migration is still in it, in order.
    for (const name of names) expect(section).toContain(`-- ${name}`);
  });
});
