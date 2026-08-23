import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_ARCHIVE_RETENTION } from './categories';

/**
 * What an archive is called, and which ones go when there are too many.
 *
 * THE NAME IS A PATTERN AND THE PATTERN IS A SAFETY DEVICE. The configured
 * destination is a folder inside the owner's iCloud Drive, which is a place
 * where other things live. A retention pass that removed "the oldest files in
 * the directory" would one day remove something that was never ours. Nothing is
 * considered for removal unless its name matches `ARCHIVE_NAME` exactly, and
 * `tests/unit/backup-run.test.ts` puts a photograph, a note and a file with our
 * own name on it in the directory and proves all three survive four runs.
 *
 * THE TIMESTAMP IS UTC AND THAT IS DELIBERATE. Every date this product shows a
 * person is Europe/Paris, as DESIGN.md requires, and the screen renders these
 * instants in Paris. The NAME is machine text, and a local name has two 02:30s
 * on the last Sunday in October, which is a collision on the one night a year
 * nobody would think to test.
 */

export const ARCHIVE_PREFIX = 'vernier-';
export const ARCHIVE_SUFFIX = '.archive';

/** `vernier-20260823T030012Z.archive`. Lexical order is chronological order. */
export const ARCHIVE_NAME = /^vernier-\d{8}T\d{6}Z\.archive$/;

/** The half-written file a run renames from. Never counted, never kept. */
export const PART_SUFFIX = '.part';

export function archiveName(at: Date): string {
  const iso = at.toISOString();
  const stamp = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
  return `${ARCHIVE_PREFIX}${stamp}${ARCHIVE_SUFFIX}`;
}

export function isArchiveName(name: string): boolean {
  return ARCHIVE_NAME.test(name);
}

/** The instant in a name, or null when the name is not one of ours. */
export function instantOf(name: string): Date | null {
  if (!isArchiveName(name)) return null;
  const stamp = name.slice(ARCHIVE_PREFIX.length, name.length - ARCHIVE_SUFFIX.length);
  const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : at;
}

export type RetentionPlan = { kept: string[]; removed: string[]; considered: number };

/**
 * Which archives stay and which go, counted rather than aged.
 *
 * COUNTED, AND F128 IS WHY. With retention at 3, a fourth run leaves exactly
 * three archives, and the three runs before it happened this afternoon. An
 * age-based sweep would keep all four and would not be wrong about anything
 * except the rule it was asked to enforce. One archive a day means a count of
 * archives and a count of days are the same number in normal service, which is
 * why the setting can honestly be called days in the environment file.
 */
export function selectForRemoval(names: string[], keep: number): RetentionPlan {
  const ours = names.filter(isArchiveName).sort();
  const limit = Math.max(1, Math.floor(keep));
  const removed = ours.slice(0, Math.max(0, ours.length - limit));
  const kept = ours.slice(Math.max(0, ours.length - limit));
  return { kept, removed, considered: ours.length };
}

/**
 * How many archives to keep, from the environment, with the documented default.
 *
 * The name in `.env.example` is `BACKUP_RETENTION_DAYS` and it stays that name:
 * it is already in the owner's file. What it counts is archives, and the
 * comment beside it says so.
 */
export function retentionSetting(env: Record<string, string | undefined> = process.env): number {
  const raw = (env.BACKUP_RETENTION_DAYS ?? '').trim();
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_ARCHIVE_RETENTION;
  return value;
}

export type RetentionOutcome = RetentionPlan & { bytesRemoved: number };

/** Applies the plan, and reports what it actually removed rather than what it meant to. */
export async function applyRetention(directory: string, keep: number): Promise<RetentionOutcome> {
  const entries = await readdir(directory).catch(() => [] as string[]);
  const plan = selectForRemoval(entries, keep);
  let bytesRemoved = 0;
  for (const name of plan.removed) {
    const path = join(directory, name);
    const size = await stat(path)
      .then((entry) => entry.size)
      .catch(() => 0);
    await rm(path, { force: true });
    bytesRemoved += size;
  }
  // Half-written files from a run that died are swept here too, and they are
  // not archives: they are never counted as kept and never restored from.
  for (const name of entries) {
    if (name.endsWith(PART_SUFFIX) && name.startsWith('.')) {
      await rm(join(directory, name), { force: true }).catch(() => undefined);
    }
  }
  return { ...plan, bytesRemoved };
}

export type ArchiveOnDisk = { name: string; bytes: number; at: Date };

/** Every archive in a directory, newest first, with nothing else in the list. */
export async function listArchives(directory: string): Promise<ArchiveOnDisk[]> {
  const entries = await readdir(directory).catch(() => [] as string[]);
  const found: ArchiveOnDisk[] = [];
  for (const name of entries.filter(isArchiveName)) {
    const at = instantOf(name);
    if (!at) continue;
    const size = await stat(join(directory, name))
      .then((entry) => entry.size)
      .catch(() => 0);
    found.push({ name, bytes: size, at });
  }
  return found.sort((left, right) => right.name.localeCompare(left.name));
}
