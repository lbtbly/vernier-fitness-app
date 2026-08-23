import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  documentExists,
  labsDirectory,
  listDocuments,
  newDocumentId,
  pathOfDocument,
  removeDocument,
  writeDocument,
} from '@/lib/lab-storage';

/**
 * The volume, and the one operation on it that cannot be taken back.
 *
 * F63 asks for a directory listing before and after a delete, so the delete has
 * to actually remove bytes and the listing has to read the filesystem rather
 * than the database. Both are asserted here against a temporary directory: this
 * suite never touches the owner's storage volume, and the environment override
 * exists so it does not have to.
 */

let root = '';

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'vernier-labs-'));
  process.env.VERNIER_STORAGE_DIR = root;
});

afterAll(() => {
  delete process.env.VERNIER_STORAGE_DIR;
  rmSync(root, { recursive: true, force: true });
});

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2]);

describe('a laboratory document on the volume', () => {
  it('is written under its own id and read back by the listing', async () => {
    const id = newDocumentId();
    const checksum = await writeDocument(id, PDF);
    expect(checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(await documentExists(id)).toBe(true);
    const listed = await listDocuments();
    console.log(`lab-storage: ${listed.length} file(s) on the volume: ${listed.join(', ')}`);
    expect(listed).toContain(`${id}.pdf`);
    expect(labsDirectory()).toBe(join(root, 'labs'));
  });

  it('is gone from the volume after a delete, and the listing says so', async () => {
    const id = newDocumentId();
    await writeDocument(id, PDF);
    const before = await listDocuments();
    expect(before).toContain(`${id}.pdf`);

    expect(await removeDocument(id)).toBe(true);

    const after = await listDocuments();
    console.log(`lab-storage: before ${before.length} file(s), after ${after.length}`);
    expect(after).not.toContain(`${id}.pdf`);
    expect(await documentExists(id)).toBe(false);
    // The population is not empty on either side. A delete proved over an empty
    // directory reads exactly like a delete that did nothing.
    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBe(before.length - 1);
  });

  it('reports a delete over a file that was not there as false, rather than as success', async () => {
    // `rm` with force would answer success over nothing at all, and F63's two
    // listings would then agree with a boolean that meant nothing.
    const id = newDocumentId();
    expect(await removeDocument(id)).toBe(false);
  });

  it('refuses any identifier that is not a document id', () => {
    // The delete path takes an id and rebuilds the path from it, so this is the
    // only thing between a future refactor that passes a request value through
    // and `rm` on something that is not a lab document.
    for (const bad of ['../../etc/passwd', 'lab_../x', 'labs', '', 'lab_notauuid']) {
      expect(() => pathOfDocument(bad), bad).toThrow();
    }
    expect(() => pathOfDocument(newDocumentId())).not.toThrow();
  });
});
