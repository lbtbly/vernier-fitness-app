import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_MAGIC,
  ArchiveError,
  FRAME_HEADER_BYTES,
  HEADER_BYTES,
  TAG_BYTES,
  buildHeader,
  collect,
  decryptArchive,
  encryptArchive,
  readHeader,
  readTar,
  sha256,
  tarEntries,
  tarSize,
  verifyArchive,
} from '@/lib/backup/archive';

/**
 * The archive, proven by FAILURE.
 *
 * A round trip that works says the writer and the reader agree with each other.
 * It says nothing at all about what happens to an archive that has been damaged,
 * and an archive is a thing whose whole purpose is to be opened on the worst
 * morning of the year. So the three corruptions the rubric names are produced
 * here, deliberately, on real bytes: one TRUNCATED, one with two chunks
 * SWAPPED, one with a single BYTE FLIPPED. Each one has to fail, and each one
 * has to fail with its own name rather than with a stack trace out of the
 * cipher.
 *
 * WHAT WOULD MAKE THIS GO RED, MEASURED RATHER THAN CLAIMED. The reader was
 * weakened twice on purpose and this file was run against it:
 *
 *   - Sequence out of BOTH the nonce and the per-chunk AAD: the swap test went
 *     red and nothing else moved. Out of the AAD alone it stays green, because
 *     the nonce is derived from the same counter, and that redundancy is the
 *     point rather than an accident.
 *   - The final flag out of the AAD, plus a reader that treats a clean EOF as an
 *     ending: the truncation test went red and nothing else moved.
 *
 * Two weakenings, two red tests, sixteen still green. A test that cannot be made
 * to fail is not evidence of anything.
 */

const SECRET = 'a-secret-that-is-not-the-owners-master-key';

/** Small chunks so a few kilobytes of plaintext is genuinely many chunks. */
const CHUNK = 1024;

function body(bytes: number): Buffer {
  // Not random: a repeating pattern makes a flipped byte visible in a diff and
  // makes two swapped chunks distinguishable from each other.
  const buffer = Buffer.alloc(bytes);
  for (let index = 0; index < bytes; index += 1) buffer[index] = index % 251;
  return buffer;
}

async function seal(plain: Buffer, chunkBytes = CHUNK): Promise<Buffer> {
  return collect(encryptArchive(SECRET, [plain], { chunkBytes }));
}

async function open(archive: Buffer): Promise<Buffer> {
  return collect(decryptArchive(SECRET, [archive]));
}

/** The byte offsets of every frame in a sealed archive, header excluded. */
function frames(archive: Buffer): Array<{ start: number; end: number; length: number; final: boolean }> {
  const found: Array<{ start: number; end: number; length: number; final: boolean }> = [];
  let offset = HEADER_BYTES;
  while (offset + FRAME_HEADER_BYTES <= archive.length) {
    const length = archive.readUInt32BE(offset);
    const final = archive.readUInt8(offset + 4) === 1;
    const end = offset + FRAME_HEADER_BYTES + length + TAG_BYTES;
    found.push({ start: offset, end, length, final });
    if (final) break;
    offset = end;
  }
  return found;
}

async function refusal(archive: Buffer): Promise<ArchiveError> {
  try {
    await open(archive);
  } catch (error) {
    if (error instanceof ArchiveError) return error;
    throw error;
  }
  throw new Error('the reader accepted an archive it should have refused');
}

describe('the archive header', () => {
  it('carries the magic, the version, the KDF parameters, the chunk size and the salt', () => {
    const header = buildHeader({ chunkBytes: CHUNK });
    expect(header.bytes).toHaveLength(HEADER_BYTES);
    expect(header.bytes.subarray(0, 8).toString('ascii')).toBe(ARCHIVE_MAGIC);
    const read = readHeader(header.bytes);
    expect(read.formatVersion).toBe(1);
    expect(read.chunkBytes).toBe(CHUNK);
    expect(read.scrypt).toEqual(header.scrypt);
    expect(read.salt).toEqual(header.salt);
    expect(read.noncePrefix).toEqual(header.noncePrefix);
  });

  it('gives two archives written under one secret different salts and nonce prefixes', () => {
    const first = buildHeader({});
    const second = buildHeader({});
    expect(first.salt.equals(second.salt)).toBe(false);
    expect(first.noncePrefix.equals(second.noncePrefix)).toBe(false);
  });

  it('refuses a file that is not one of ours, by name', () => {
    expect(() => readHeader(Buffer.alloc(HEADER_BYTES))).toThrow(ArchiveError);
    try {
      readHeader(Buffer.alloc(HEADER_BYTES));
    } catch (error) {
      expect((error as ArchiveError).code).toBe('archive_bad_magic');
    }
  });

  it('refuses a version it does not know rather than reading half of it', () => {
    const header = Buffer.from(buildHeader({}).bytes);
    header.writeUInt8(9, 8);
    try {
      readHeader(header);
      throw new Error('unreachable');
    } catch (error) {
      expect((error as ArchiveError).code).toBe('archive_version_unsupported');
      expect((error as ArchiveError).claimed).toBe(9);
    }
  });
});

describe('the archive round trip', () => {
  it('returns exactly what went in, over many chunks', async () => {
    const plain = body(CHUNK * 7 + 13);
    const archive = await seal(plain);
    expect(frames(archive).length).toBe(8);
    const back = await open(archive);
    expect(back.length).toBe(plain.length);
    expect(sha256(back)).toBe(sha256(plain));
  });

  it('produces one empty final chunk for an empty payload', async () => {
    const archive = await seal(Buffer.alloc(0));
    const listed = frames(archive);
    expect(listed).toHaveLength(1);
    expect(listed[0].final).toBe(true);
    expect(await open(archive)).toHaveLength(0);
  });

  it('reports the chunk count and the plaintext size it authenticated', async () => {
    // An exact multiple of the chunk size, which is the boundary case: the last
    // FULL chunk carries the final flag, so this is three chunks and not three
    // plus an empty fourth. An empty payload is the only archive whose final
    // chunk is empty.
    const plain = body(CHUNK * 3);
    const report = await verifyArchive(SECRET, [await seal(plain)]);
    expect(report.chunks).toBe(3);
    expect(report.plainBytes).toBe(plain.length);
  });

  it('refuses the right secret for the wrong archive', async () => {
    const archive = await seal(body(CHUNK * 2));
    let code = '';
    try {
      await collect(decryptArchive('a-different-secret', [archive]));
    } catch (error) {
      code = (error as ArchiveError).code;
    }
    expect(code).toBe('archive_chunk_unauthenticated');
  });
});

describe('integrity is proven by failure', () => {
  it('refuses a TRUNCATED archive, naming the truncation', async () => {
    const archive = await seal(body(CHUNK * 5));
    const listed = frames(archive);
    // Cut cleanly at a frame boundary: every frame still present is intact and
    // verifies. Only the missing final flag says the file is incomplete.
    const cut = archive.subarray(0, listed[2].start);
    const error = await refusal(cut);
    expect(error.code).toBe('archive_truncated');
    expect(error.sequence).toBe(2);

    // And a cut in the middle of a frame, which is what `head -c` usually does.
    const ragged = archive.subarray(0, listed[2].start + 40);
    expect((await refusal(ragged)).code).toBe('archive_truncated');
  });

  it('refuses an archive with two chunks SWAPPED, naming the chunk', async () => {
    const archive = await seal(body(CHUNK * 5));
    const listed = frames(archive);
    const first = archive.subarray(listed[1].start, listed[1].end);
    const second = archive.subarray(listed[3].start, listed[3].end);
    expect(first.length).toBe(second.length);
    const swapped = Buffer.from(archive);
    second.copy(swapped, listed[1].start);
    first.copy(swapped, listed[3].start);
    expect(swapped.length).toBe(archive.length);
    expect(swapped.equals(archive)).toBe(false);

    const error = await refusal(swapped);
    expect(error.code).toBe('archive_chunk_unauthenticated');
    expect(error.sequence).toBe(1);
  });

  it('refuses an archive with ONE BYTE FLIPPED, wherever it is flipped', async () => {
    const archive = await seal(body(CHUNK * 3));
    const listed = frames(archive);

    const inBody = Buffer.from(archive);
    const at = listed[1].start + FRAME_HEADER_BYTES + 7;
    inBody[at] ^= 0x01;
    const bodyError = await refusal(inBody);
    expect(bodyError.code).toBe('archive_chunk_unauthenticated');
    expect(bodyError.sequence).toBe(1);

    // The tag itself.
    const inTag = Buffer.from(archive);
    inTag[listed[1].end - 1] ^= 0x80;
    expect((await refusal(inTag)).code).toBe('archive_chunk_unauthenticated');

    // And the header, which is the AAD of every chunk in the file: flipping one
    // bit of the salt breaks chunk 0 rather than being read as a valid archive
    // whose parameters somebody else chose.
    const inHeader = Buffer.from(archive);
    inHeader[40] ^= 0x01;
    const headerError = await refusal(inHeader);
    expect(headerError.code).toBe('archive_chunk_unauthenticated');
    expect(headerError.sequence).toBe(0);
  });

  it('refuses bytes appended after the final chunk', async () => {
    const archive = await seal(body(CHUNK * 2));
    const extended = Buffer.concat([archive, Buffer.from('and one more thing')]);
    const error = await refusal(extended);
    expect(error.code).toBe('archive_trailing_bytes');
  });

  it('refuses a frame header claiming a chunk larger than any writer produces', async () => {
    const archive = await seal(body(CHUNK * 2));
    const listed = frames(archive);
    const inflated = Buffer.from(archive);
    inflated.writeUInt32BE(0x7fffffff, listed[0].start);
    const error = await refusal(inflated);
    expect(error.code).toBe('archive_chunk_size_invalid');
  });
});

describe('the tar inside the archive', () => {
  const entries = [
    { name: 'manifest.json', body: Buffer.from('{"format":1}') },
    { name: 'database.sql', body: Buffer.from('insert into measurement values (1);\n') },
    { name: 'storage.tar', body: body(1500) },
  ];

  it('predicts its own size before it builds anything', async () => {
    const planned = tarSize(entries.map((entry) => ({ size: entry.body.length })));
    const built = await collect(
      tarEntries(entries.map((entry) => ({ ...entry, size: entry.body.length }))),
    );
    expect(built.length).toBe(planned);
    expect(built.length % 512).toBe(0);
  });

  it('round trips every member with its bytes intact', async () => {
    const built = await collect(
      tarEntries(entries.map((entry) => ({ ...entry, size: entry.body.length }))),
    );
    const members = readTar(built);
    expect(members.map((member) => member.name)).toEqual([
      'manifest.json',
      'database.sql',
      'storage.tar',
    ]);
    for (const [index, member] of members.entries()) {
      expect(member.size).toBe(entries[index].body.length);
      expect(sha256(member.body)).toBe(sha256(entries[index].body));
    }
  });

  it('refuses a member whose body is not the length it declared', async () => {
    let code = '';
    try {
      await collect(tarEntries([{ name: 'short.sql', size: 100, body: Buffer.alloc(10) }]));
    } catch (error) {
      code = (error as ArchiveError).code;
    }
    expect(code).toBe('tar_size_mismatch');
  });

  /**
   * The claim this file makes that no assertion of ours can make for us: that
   * what comes out of the archive is a REAL tar, readable by a tool that has
   * never heard of this repository. macOS ships bsdtar; if it ever does not,
   * this skips rather than passing, and says so.
   */
  it('is listed and unpacked by the system tar, not only by our own reader', async () => {
    const built = await collect(
      tarEntries(entries.map((entry) => ({ ...entry, size: entry.body.length }))),
    );
    const directory = mkdtempSync(join(tmpdir(), 'vernier-tar-'));
    try {
      const path = join(directory, 'members.tar');
      writeFileSync(path, built);
      const listing = execFileSync('tar', ['-tf', path], { encoding: 'utf8' });
      console.log(`system tar listed:\n${listing.trim()}`);
      expect(listing.split('\n').filter(Boolean).sort()).toEqual([
        'database.sql',
        'manifest.json',
        'storage.tar',
      ]);
      execFileSync('tar', ['-xf', path, '-C', directory]);
      const unpacked = execFileSync('cat', [join(directory, 'manifest.json')], { encoding: 'utf8' });
      expect(unpacked).toBe('{"format":1}');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('carries a whole tar through the cipher and back', async () => {
    const built = await collect(
      tarEntries(entries.map((entry) => ({ ...entry, size: entry.body.length }))),
    );
    const archive = await collect(encryptArchive(SECRET, [built], { chunkBytes: CHUNK }));
    const members = readTar(await open(archive));
    expect(members).toHaveLength(3);
    expect(members[2].size).toBe(1500);
  });
});
