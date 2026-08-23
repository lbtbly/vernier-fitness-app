import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { storageRoot } from '@/lib/lab-storage';

/**
 * Where a meal photograph lives on this machine, and the two places it can be.
 *
 * TWO DIRECTORIES, BECAUSE F96 SAYS NOTHING IS STORED UNTIL THE OWNER CONFIRMS.
 * An estimate that is still on screen is a HOLDING: the bytes are on the volume
 * because the model had to be sent something, and no row anywhere refers to
 * them. Confirming moves the file into `meals/` and writes the rows in one
 * transaction. Abandoning leaves the holding, and the next upload sweeps every
 * holding older than a day.
 *
 * The path is rebuilt from an id on every call and there is no caller-supplied
 * path anywhere in this module, which is the same rule and the same reason as
 * `src/lib/lab-storage.ts`: a delete that takes a path from a request is one
 * refactor away from taking a path from a browser.
 */

export function mealPhotoDirectory(): string {
  return join(storageRoot(), 'meals');
}

export function mealHoldingDirectory(): string {
  return join(storageRoot(), 'meals-holding');
}

/**
 * An operator-facing token, not product copy, and not a sentence. It reaches a
 * container log and a 500, never a screen.
 */
const NOT_A_PHOTO_ID = 'meal-photo: not a photo id';

export function newPhotoId(): string {
  return `meal_${crypto.randomUUID()}`;
}

function pathIn(directory: string, id: string): string {
  if (!/^meal_[0-9a-f-]{36}$/.test(id)) throw new Error(NOT_A_PHOTO_ID);
  const path = resolve(directory, `${id}.jpg`);
  if (!path.startsWith(resolve(directory) + '/')) throw new Error(NOT_A_PHOTO_ID);
  return path;
}

export function pathOfHolding(id: string): string {
  return pathIn(mealHoldingDirectory(), id);
}

export function pathOfPhoto(id: string): string {
  return pathIn(mealPhotoDirectory(), id);
}

/** The bytes on the volume, in the holding, with the checksum that names them. */
export async function writeHolding(id: string, bytes: Uint8Array): Promise<string> {
  await mkdir(mealHoldingDirectory(), { recursive: true });
  await writeFile(pathOfHolding(id), bytes);
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * The holding becomes a stored photo, in one move.
 *
 * A rename rather than a copy: the file is on the same volume, so the move is
 * atomic and there is never a moment where both exist and a later sweep could
 * delete the one the row points at.
 */
export async function keepHolding(id: string): Promise<boolean> {
  await mkdir(mealPhotoDirectory(), { recursive: true });
  try {
    await rename(pathOfHolding(id), pathOfPhoto(id));
    return true;
  } catch {
    return false;
  }
}

export async function readPhotoBytes(id: string): Promise<Uint8Array | null> {
  for (const path of [pathOfPhoto(id), pathOfHolding(id)]) {
    try {
      return new Uint8Array(await readFile(path));
    } catch {
      continue;
    }
  }
  return null;
}

export async function photoExists(id: string): Promise<boolean> {
  try {
    await stat(pathOfPhoto(id));
    return true;
  } catch {
    return false;
  }
}

/** Every file in each directory right now, names only, sorted. Evidence, not belief. */
export async function listPhotos(): Promise<{ kept: string[]; holding: string[] }> {
  const read = async (directory: string) => {
    try {
      return (await readdir(directory)).sort();
    } catch {
      return [];
    }
  };
  return { kept: await read(mealPhotoDirectory()), holding: await read(mealHoldingDirectory()) };
}

/** How long an abandoned holding stays on the volume before it is swept. */
export const HOLDING_TTL_MS = 24 * 3600_000;

/**
 * Removes every holding older than a day, and answers with how many and out of
 * how many.
 *
 * The population is in the answer on purpose. "Swept 0" beside "walked 0" is a
 * run with nothing in it, and it reads identically to a sweep that found
 * nothing to do; the caller logs both numbers so the two cannot be confused.
 */
export async function sweepHoldings(now: Date): Promise<{ walked: number; removed: number }> {
  let walked = 0;
  let removed = 0;
  let names: string[] = [];
  try {
    names = await readdir(mealHoldingDirectory());
  } catch {
    return { walked, removed };
  }
  for (const name of names) {
    walked += 1;
    const path = join(mealHoldingDirectory(), name);
    try {
      const info = await stat(path);
      if (now.getTime() - info.mtimeMs > HOLDING_TTL_MS) {
        await rm(path);
        removed += 1;
      }
    } catch {
      continue;
    }
  }
  return { walked, removed };
}
