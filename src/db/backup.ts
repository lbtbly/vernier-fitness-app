import { desc, eq } from 'drizzle-orm';
import { getDb } from './client';
import { backupRun, deletionRun, restoreCheck } from './schema';

/**
 * The rows the operator console reads: what the last archive did, whether a
 * restore has ever been proven, and what the owner has deliberately destroyed.
 *
 * Every column here is a token, a number or an instant. Nothing in this file
 * writes a sentence into the database: the screen looks the words up in the
 * catalogue from `cause`, exactly as `src/db/jobs.ts` does with `detail`.
 */

export type BackupRunRow = typeof backupRun.$inferSelect;

export type BackupRunView = {
  id: string;
  kind: string;
  periodStart: string | null;
  startedAt: string;
  finishedAt: string | null;
  outcome: 'running' | 'ok' | 'failed';
  destination: 'configured' | 'fallback';
  directory: string;
  writtenTo: string;
  fileName: string;
  bytes: number;
  chunks: number;
  integrity: 'unchecked' | 'verified' | 'failed';
  cause: string;
  detail: Record<string, unknown>;
  tableCount: number;
  rowCount: number;
  manifestDigest: string;
  freeBytes: number | null;
  kept: number;
  removed: number;
};

export function toBackupRunView(row: BackupRunRow): BackupRunView {
  return {
    id: row.id,
    kind: row.kind,
    periodStart: row.periodStart,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    outcome: row.outcome as BackupRunView['outcome'],
    destination: row.destination as BackupRunView['destination'],
    directory: row.directory,
    writtenTo: row.writtenTo,
    fileName: row.fileName,
    bytes: Number(row.bytes),
    chunks: row.chunks,
    integrity: row.integrity as BackupRunView['integrity'],
    cause: row.cause,
    detail: (row.detail ?? {}) as Record<string, unknown>,
    tableCount: row.tableCount,
    rowCount: Number(row.rowCount),
    manifestDigest: row.manifestDigest,
    freeBytes: row.freeBytes === null || row.freeBytes === undefined ? null : Number(row.freeBytes),
    kept: row.kept,
    removed: row.removed,
  };
}

/**
 * The row goes in BEFORE the work starts.
 *
 * A run that dies halfway through leaves `running` behind, which the console
 * shows and the alert sweep reads. The alternative is a row written at the end,
 * and a run that never got there leaves nothing at all: an absence, which is
 * the exact failure mode this slice exists to end.
 */
export async function startBackupRun(input: {
  kind: 'scheduled' | 'manual';
  periodStart?: string | null;
}): Promise<BackupRunView> {
  const db = getDb();
  const [row] = await db
    .insert(backupRun)
    .values({
      id: crypto.randomUUID(),
      kind: input.kind,
      periodStart: input.periodStart ?? null,
      outcome: 'running',
    })
    .returning();
  return toBackupRunView(row);
}

export async function finishBackupRun(
  id: string,
  patch: Partial<Omit<BackupRunView, 'id' | 'startedAt' | 'kind' | 'periodStart'>>,
): Promise<BackupRunView | null> {
  const db = getDb();
  const [row] = await db
    .update(backupRun)
    .set({
      finishedAt: new Date(),
      outcome: patch.outcome,
      destination: patch.destination,
      directory: patch.directory,
      writtenTo: patch.writtenTo,
      fileName: patch.fileName,
      bytes: patch.bytes,
      chunks: patch.chunks,
      integrity: patch.integrity,
      cause: patch.cause,
      detail: patch.detail ?? {},
      tableCount: patch.tableCount,
      rowCount: patch.rowCount,
      manifestDigest: patch.manifestDigest,
      freeBytes: patch.freeBytes ?? null,
      kept: patch.kept,
      removed: patch.removed,
    })
    .where(eq(backupRun.id, id))
    .returning();
  return row ? toBackupRunView(row) : null;
}

export async function readLastBackupRun(): Promise<BackupRunView | null> {
  const db = getDb();
  const [row] = await db.select().from(backupRun).orderBy(desc(backupRun.startedAt)).limit(1);
  return row ? toBackupRunView(row) : null;
}

/** The last run that actually produced a verified archive, which is a different question. */
export async function readLastGoodBackupRun(): Promise<BackupRunView | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(backupRun)
    .where(eq(backupRun.outcome, 'ok'))
    .orderBy(desc(backupRun.startedAt))
    .limit(1);
  return row ? toBackupRunView(row) : null;
}

export async function readBackupRuns(limit = 10): Promise<BackupRunView[]> {
  const db = getDb();
  const rows = await db.select().from(backupRun).orderBy(desc(backupRun.startedAt)).limit(limit);
  return rows.map(toBackupRunView);
}

export type RestoreCheckRow = typeof restoreCheck.$inferSelect;

export type RestoreCheckView = {
  id: string;
  checkedAt: string;
  archiveName: string;
  targetDatabase: string;
  outcome: 'matched' | 'mismatched' | 'failed';
  tablesCompared: number;
  sourceRows: number;
  restoredRows: number;
  differences: unknown;
  cause: string;
};

export function toRestoreCheckView(row: RestoreCheckRow): RestoreCheckView {
  return {
    id: row.id,
    checkedAt: row.checkedAt.toISOString(),
    archiveName: row.archiveName,
    targetDatabase: row.targetDatabase,
    outcome: row.outcome as RestoreCheckView['outcome'],
    tablesCompared: row.tablesCompared,
    sourceRows: Number(row.sourceRows),
    restoredRows: Number(row.restoredRows),
    differences: row.differences,
    cause: row.cause,
  };
}

/**
 * Written by `scripts/restore.mjs` through the app, or by the suite.
 *
 * The restore itself runs on the host, because a machine whose app will not
 * boot is exactly the machine a restore is for. What it leaves behind here is
 * the date the operator console shows: an archive nobody has ever restored is a
 * hypothesis, and the console says which of the two it is looking at.
 */
export async function recordRestoreCheck(input: {
  archiveName: string;
  targetDatabase: string;
  outcome: RestoreCheckView['outcome'];
  tablesCompared: number;
  sourceRows: number;
  restoredRows: number;
  differences?: unknown;
  cause?: string;
}): Promise<RestoreCheckView> {
  const db = getDb();
  const [row] = await db
    .insert(restoreCheck)
    .values({
      id: crypto.randomUUID(),
      archiveName: input.archiveName,
      targetDatabase: input.targetDatabase,
      outcome: input.outcome,
      tablesCompared: input.tablesCompared,
      sourceRows: input.sourceRows,
      restoredRows: input.restoredRows,
      differences: input.differences ?? [],
      cause: input.cause ?? '',
    })
    .returning();
  return toRestoreCheckView(row);
}

export async function readLastRestoreCheck(): Promise<RestoreCheckView | null> {
  const db = getDb();
  const [row] = await db.select().from(restoreCheck).orderBy(desc(restoreCheck.checkedAt)).limit(1);
  return row ? toRestoreCheckView(row) : null;
}

export type DeletionRunRow = typeof deletionRun.$inferSelect;

export type DeletionRunView = {
  id: string;
  category: string;
  requestedAt: string;
  completedAt: string | null;
  outcome: 'done' | 'refused';
  before: Record<string, number>;
  removed: Record<string, number>;
  filesRemoved: number;
  cause: string;
};

export function toDeletionRunView(row: DeletionRunRow): DeletionRunView {
  return {
    id: row.id,
    category: row.category,
    requestedAt: row.requestedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    outcome: row.outcome as DeletionRunView['outcome'],
    before: (row.before ?? {}) as Record<string, number>,
    removed: (row.removed ?? {}) as Record<string, number>,
    filesRemoved: row.filesRemoved,
    cause: row.cause,
  };
}

export async function recordDeletionRun(input: {
  category: string;
  outcome: 'done' | 'refused';
  before: Record<string, number>;
  removed: Record<string, number>;
  filesRemoved: number;
  cause?: string;
}): Promise<DeletionRunView> {
  const db = getDb();
  const [row] = await db
    .insert(deletionRun)
    .values({
      id: crypto.randomUUID(),
      category: input.category,
      completedAt: input.outcome === 'done' ? new Date() : null,
      outcome: input.outcome,
      before: input.before,
      removed: input.removed,
      filesRemoved: input.filesRemoved,
      cause: input.cause ?? '',
    })
    .returning();
  return toDeletionRunView(row);
}

export async function readDeletionRuns(limit = 10): Promise<DeletionRunView[]> {
  const db = getDb();
  const rows = await db.select().from(deletionRun).orderBy(desc(deletionRun.requestedAt)).limit(limit);
  return rows.map(toDeletionRunView);
}
