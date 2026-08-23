import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Where a laboratory PDF lives on this machine, and how it stops living there.
 *
 * `compose.yaml` mounts the named volume `vernier_storage` at /app/storage and
 * the Dockerfile creates it owned by the app user, so the directory exists
 * before the first upload. Nothing here reaches outside it: a document is
 * addressed by its own id and the path is rebuilt from that id every time, so
 * there is no caller-supplied path anywhere in this module and no way to ask it
 * to delete something that is not a lab document.
 *
 * F63 reads a directory listing before and after a delete, so `listDocuments`
 * exists and returns what is actually on the volume rather than what the
 * database believes. Those two answers disagreeing is the interesting case and
 * a helper that read the database would hide it.
 */

/** The storage root. An environment override so a test can point it at a temp dir. */
export function storageRoot(): string {
  return process.env.VERNIER_STORAGE_DIR?.trim() || '/app/storage';
}

export function labsDirectory(): string {
  return join(storageRoot(), 'labs');
}

/**
 * The path of one document, built from its id and nothing else.
 *
 * The id is minted by `crypto.randomUUID` with a fixed prefix, and this refuses
 * anything that is not that shape. Not because a traversal is expected, but
 * because a delete that takes a path from a request is one refactor away from
 * taking a path from a browser, and this function is the only thing standing
 * between that and `rm`.
 */
export function pathOfDocument(id: string): string {
  if (!/^lab_[0-9a-f-]{36}$/.test(id)) throw new Error(NOT_A_DOCUMENT_ID);
  const path = resolve(labsDirectory(), `${id}.pdf`);
  if (!path.startsWith(resolve(labsDirectory()) + '/')) throw new Error(NOT_A_DOCUMENT_ID);
  return path;
}

/**
 * An operator-facing failure, not product copy: it reaches a container log and
 * a 500, never a screen. C6's rendered check reads screens, and the route that
 * catches this answers with a catalogued refusal.
 */
const NOT_A_DOCUMENT_ID = 'lab-storage: not a document id';

export function newDocumentId(): string {
  return `lab_${crypto.randomUUID()}`;
}

/** The bytes on the volume, with the checksum that names them. */
export async function writeDocument(id: string, bytes: Uint8Array): Promise<string> {
  await mkdir(labsDirectory(), { recursive: true });
  const path = pathOfDocument(id);
  await writeFile(path, bytes);
  return createHash('sha256').update(bytes).digest('hex');
}

export async function readDocumentBytes(id: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(pathOfDocument(id)));
  } catch {
    return null;
  }
}

/**
 * Gone from the volume, and the answer says whether it was there.
 *
 * `force` is deliberately off. A delete that reports success over a file that
 * was never there is a delete nobody can prove happened, and F63 asks for a
 * directory listing before and after: the two listings and this boolean have to
 * agree or something is wrong.
 */
export async function removeDocument(id: string): Promise<boolean> {
  const path = pathOfDocument(id);
  try {
    await stat(path);
  } catch {
    return false;
  }
  await rm(path);
  return true;
}

export async function documentExists(id: string): Promise<boolean> {
  try {
    await stat(pathOfDocument(id));
    return true;
  } catch {
    return false;
  }
}

/** Every file on the volume right now, names only, sorted. The evidence F63 reads. */
export async function listDocuments(): Promise<string[]> {
  try {
    return (await readdir(labsDirectory())).sort();
  } catch {
    return [];
  }
}
