import { describe, expect, it } from 'vitest';
import {
  ArchiveError,
  DAMAGE_MODES,
  type DamageMode,
  collect,
  damageArchive,
  decryptArchive,
  encryptArchive,
  readFrames,
} from '@/lib/backup/archive';

/**
 * The corruption tool F125 rests on, driven over every archive shape there is.
 *
 * WHY THIS FILE EXISTS. F125 says a truncated archive, an archive with two
 * chunks swapped and an archive with one byte flipped each exit non-zero with a
 * named error. The end-to-end test drives `scripts/restore.mjs corrupt` to make
 * those three files, and on 2026-08-23 that command exited 2 on the real
 * archive: the swap was guarded by a rule that the file must hold four chunks,
 * and a scratch archive holds two or three. The suite reported "expected 0,
 * received 2" at the line that MAKES the damaged copy, so not one of the three
 * verifications ever ran. A tool that cannot damage the file cannot prove the
 * reader refuses damage.
 *
 * So the arithmetic is graded here, where an archive of any shape can be built
 * in a millisecond: ONE chunk, TWO chunks, and twelve. Each mode has to produce
 * bytes that differ from the source, and the reader has to refuse them with the
 * code the mode names.
 *
 * WHAT WOULD MAKE THIS GO RED. Put the four-chunk rule back and the two-chunk
 * and one-chunk swap cases fail. Cut the truncation one frame later, so the
 * final chunk survives, and the truncation cases pass verification instead of
 * failing it. Flip the byte outside any frame and the flip cases return the
 * archive unharmed, which the "differs from the source" assertion catches
 * before the reader is ever asked.
 */

const SECRET = 'a-secret-that-is-not-the-owners-master-key';

/** Small chunks, so a few kilobytes of plaintext is genuinely many chunks. */
const CHUNK = 1024;

function body(bytes: number): Buffer {
  const buffer = Buffer.alloc(bytes);
  for (let index = 0; index < bytes; index += 1) buffer[index] = index % 251;
  return buffer;
}

async function seal(plainBytes: number): Promise<Buffer> {
  return collect(encryptArchive(SECRET, [body(plainBytes)], { chunkBytes: CHUNK }));
}

async function refusal(archive: Uint8Array): Promise<ArchiveError> {
  try {
    await collect(decryptArchive(SECRET, [archive]));
  } catch (error) {
    if (error instanceof ArchiveError) return error;
    throw error;
  }
  throw new Error('the reader accepted an archive it should have refused');
}

/** The three shapes an archive can have, named by how many chunks they hold. */
const SHAPES = [
  { name: 'one chunk', plainBytes: CHUNK - 40, chunks: 1 },
  { name: 'two chunks', plainBytes: CHUNK + 7, chunks: 2 },
  { name: 'twelve chunks', plainBytes: CHUNK * 11 + 13, chunks: 12 },
];

describe('reading the frames of a sealed archive', () => {
  it('counts the chunks the writer wrote, at every shape', async () => {
    for (const shape of SHAPES) {
      const frames = readFrames(await seal(shape.plainBytes));
      expect(frames, shape.name).toHaveLength(shape.chunks);
      expect(frames[frames.length - 1].final, shape.name).toBe(true);
      // Every frame but the last is not final, and the boundaries are contiguous.
      for (let index = 0; index < frames.length - 1; index += 1) {
        expect(frames[index].final, `${shape.name} frame ${index}`).toBe(false);
        expect(frames[index].end, `${shape.name} frame ${index}`).toBe(frames[index + 1].start);
      }
    }
  });

  it('refuses a file that is too short to hold a header', () => {
    expect(() => readFrames(Buffer.alloc(10))).toThrow(ArchiveError);
  });
});

describe('the three corruptions, over every archive shape', () => {
  it('produces bytes that differ from the source, and never returns the source', async () => {
    for (const shape of SHAPES) {
      const archive = await seal(shape.plainBytes);
      for (const mode of DAMAGE_MODES) {
        const damage = damageArchive(archive, mode);
        if (!damage.ok) {
          // The only refusal there is: two chunks cannot be swapped in a file
          // that holds one. It is named rather than silent.
          expect(`${shape.name} ${mode}`).toBe('one chunk reorder');
          expect(damage.reason).toBe('too_few_chunks');
          expect(damage.frames).toBe(1);
          continue;
        }
        expect(damage.frames, `${shape.name} ${mode}`).toBe(shape.chunks);
        expect(Buffer.from(damage.bytes).equals(archive), `${shape.name} ${mode}`).toBe(false);
      }
    }
  });

  it('makes a truncation the reader names as a truncation, at every shape', async () => {
    for (const shape of SHAPES) {
      const archive = await seal(shape.plainBytes);
      const damage = damageArchive(archive, 'truncate');
      if (!damage.ok) throw new Error(`truncation refused at ${shape.name}`);
      expect(damage.bytes.length, shape.name).toBeLessThan(archive.length);
      expect(damage.expect, shape.name).toBe('archive_truncated');
      expect((await refusal(damage.bytes)).code, shape.name).toBe('archive_truncated');
    }
  });

  it('makes a swap the reader names as an unauthenticated chunk, from two chunks up', async () => {
    for (const shape of SHAPES.filter((candidate) => candidate.chunks >= 2)) {
      const archive = await seal(shape.plainBytes);
      const damage = damageArchive(archive, 'reorder');
      if (!damage.ok) throw new Error(`the swap was refused at ${shape.name}`);
      // A SWAP MOVES NOTHING ELSE. The file is the same length and holds the
      // same bytes in a different order, which is what separates this case from
      // the flip below: a length that changed would be a truncation wearing a
      // swap's name.
      expect(damage.bytes.length, shape.name).toBe(archive.length);
      expect(damage.expect, shape.name).toBe('archive_chunk_unauthenticated');
      const error = await refusal(damage.bytes);
      expect(error.code, shape.name).toBe('archive_chunk_unauthenticated');
      expect(error.sequence, shape.name).toBe(0);
    }
  });

  it('refuses to swap two chunks in a one-chunk archive rather than pretending', async () => {
    const damage = damageArchive(await seal(CHUNK - 40), 'reorder');
    expect(damage.ok).toBe(false);
    if (damage.ok) throw new Error('a one-chunk archive cannot hold a swap');
    expect(damage.reason).toBe('too_few_chunks');
    expect(damage.needs).toBe(2);
  });

  it('makes a one-byte flip the reader names as an unauthenticated chunk, at every shape', async () => {
    for (const shape of SHAPES) {
      const archive = await seal(shape.plainBytes);
      const damage = damageArchive(archive, 'flip');
      if (!damage.ok) throw new Error(`the flip was refused at ${shape.name}`);
      expect(damage.bytes.length, shape.name).toBe(archive.length);

      // EXACTLY ONE BYTE. A test that only asked "does it fail" would pass over
      // a tool that rewrote half the file, and half a file is not the thing the
      // rubric line names.
      let different = 0;
      for (let index = 0; index < archive.length; index += 1) {
        if (damage.bytes[index] !== archive[index]) different += 1;
      }
      expect(different, shape.name).toBe(1);
      expect(damage.expect, shape.name).toBe('archive_chunk_unauthenticated');
      const error = await refusal(damage.bytes);
      expect(error.code, shape.name).toBe('archive_chunk_unauthenticated');
      // It is the LAST chunk that fails, which is what proves the reader
      // authenticated its way to the end rather than stopping early.
      expect(error.sequence, shape.name).toBe(shape.chunks - 1);
    }
  });

  it('names three modes and no more, so the script and this file cannot drift', () => {
    expect([...DAMAGE_MODES]).toEqual(['truncate', 'reorder', 'flip']);
    const modes: DamageMode[] = [...DAMAGE_MODES];
    expect(modes).toHaveLength(3);
  });
});
