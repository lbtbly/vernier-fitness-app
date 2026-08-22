import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from './client';
import { importQuestion, measurement, sourceRecord } from './schema';
import {
  type Confidence,
  type DedupOutcome,
  type DedupReason,
  type Source,
  type StoredCandidate,
  IMPORT_VERSION,
  decideDedup,
  orderChain,
  sameDay,
} from '@/lib/provenance';
import type { LogSnapshot, MeasurementView } from '@/lib/measurement-view';
import { strings } from '@/lib/strings';

/**
 * A decision's reason, rendered once, at write time, from the string catalogue
 * and stored beside the row. Frozen English on purpose: the sentence explains
 * what the app decided on that day under that version, and rewording it later
 * would rewrite history rather than translate it.
 */
export function renderDedupReason(reason: DedupReason): string {
  const render = strings.provenance.dedupReasons[reason.key] as (
    params: Record<string, string>,
  ) => string;
  return render(reason.params);
}

/**
 * The only door into the provenance spine.
 *
 * Nothing else in the app inserts into `measurement`, and nothing at all
 * updates it: the table carries a trigger that refuses UPDATE and DELETE
 * outright, so a correction is an insert or it does not happen. What that buys
 * is the sentence the panel kept repeating in different words, that the moment
 * a number changes without saying so, every other number on the dashboard stops
 * being worth reading.
 */

export type SourceKind =
  | 'sync_batch'
  | 'shortcut_payload'
  | 'lab_page'
  | 'model_reply'
  | 'derivation'
  | 'manual_entry'
  | 'demo_record';

/** One line of the source screen: a key into the string catalogue and its data. */
export type SourceDetailRow = { key: string; value: string };

export type SourceRecordInput = {
  id: string;
  source: Source;
  kind: SourceKind;
  reference: string;
  occurredAt: Date;
  detail: SourceDetailRow[];
};

export type MeasurementRow = typeof measurement.$inferSelect;
export type SourceRecordRow = typeof sourceRecord.$inferSelect;

export type WriteInput = {
  /** The client UUID that carried the write. It is the row id and the idempotency key. */
  id: string;
  metric: string;
  rawValue: string;
  rawUnit: string;
  value: number | null;
  unit: string;
  conversionFactor?: number | null;
  timeZone: string;
  source: Source;
  measuredAt: Date;
  confidence: Confidence;
  sourceRecord: SourceRecordInput;
};

export type WriteResult =
  | { stored: true; id: string; outcome: DedupOutcome }
  | { stored: false; outcome: DedupOutcome; questionId?: string; keptId?: string };

/** The window deduplication looks back over: enough to hold the same day in any zone. */
const DEDUP_WINDOW_HOURS = 72;

async function candidatesFor(metric: string, measuredAt: Date): Promise<StoredCandidate[]> {
  const db = getDb();
  const since = new Date(measuredAt.getTime() - DEDUP_WINDOW_HOURS * 3600_000);
  const until = new Date(measuredAt.getTime() + DEDUP_WINDOW_HOURS * 3600_000);
  const rows = await db
    .select()
    .from(measurement)
    .where(
      and(
        eq(measurement.metric, metric),
        sql`${measurement.measuredAt} >= ${since.toISOString()}`,
        sql`${measurement.measuredAt} <= ${until.toISOString()}`,
      ),
    );
  return rows.map((row) => ({
    id: row.id,
    metric: row.metric,
    source: row.source,
    rawValue: row.rawValue,
    measuredAt: row.measuredAt,
    rootId: row.rootId,
    correctionIndex: row.correctionIndex,
  }));
}

export async function upsertSourceRecord(input: SourceRecordInput): Promise<void> {
  const db = getDb();
  await db
    .insert(sourceRecord)
    .values({
      id: input.id,
      source: input.source,
      kind: input.kind,
      reference: input.reference,
      occurredAt: input.occurredAt,
      importVersion: IMPORT_VERSION,
      detail: input.detail,
    })
    .onConflictDoNothing({ target: sourceRecord.id });
}

/**
 * Store one measurement, or decide not to and say why.
 *
 * Three outcomes and only three. It is stored with a deduplication decision on
 * it; it is the same fact arriving twice and nothing is written; or it
 * disagrees with a value the owner corrected by hand, and then it becomes an
 * open question holding both numbers and still nothing is written. The third
 * case is the one that matters: the alternative is a silently replaced
 * correction, which is a wrong number with nothing pointing at it.
 */
export async function storeMeasurement(input: WriteInput): Promise<WriteResult> {
  const db = getDb();
  const stored = await candidatesFor(input.metric, input.measuredAt);
  const outcome = decideDedup(
    {
      metric: input.metric,
      source: input.source,
      rawValue: input.rawValue,
      measuredAt: input.measuredAt,
      timeZone: input.timeZone,
    },
    stored,
  );

  if (outcome.decision === 'dropped_as_duplicate') {
    return { stored: false, outcome, keptId: outcome.keptId };
  }

  if (outcome.decision === 'held_for_question') {
    const conflicting = stored.find((row) => row.id === outcome.conflictsWith)!;
    const questionId = `q_${input.id}`;
    await db
      .insert(importQuestion)
      .values({
        id: questionId,
        metric: input.metric,
        measurementId: conflicting.id,
        storedRawValue: conflicting.rawValue,
        storedUnit: input.unit,
        storedSource: conflicting.source,
        storedMeasuredAt: conflicting.measuredAt,
        incomingRawValue: input.rawValue,
        incomingUnit: input.rawUnit,
        incomingSource: input.source,
        incomingMeasuredAt: input.measuredAt,
        incomingImportVersion: IMPORT_VERSION,
      })
      .onConflictDoNothing({ target: importQuestion.id });
    return { stored: false, outcome, questionId };
  }

  await upsertSourceRecord(input.sourceRecord);
  await db
    .insert(measurement)
    .values({
      id: input.id,
      metric: input.metric,
      rawValue: input.rawValue,
      rawUnit: input.rawUnit,
      value: input.value,
      unit: input.unit,
      conversionFactor: input.conversionFactor ?? null,
      timeZone: input.timeZone,
      source: input.source,
      measuredAt: input.measuredAt,
      confidence: input.confidence,
      importVersion: IMPORT_VERSION,
      dedupDecision: outcome.decision,
      dedupReason: renderDedupReason(outcome.reason),
      sourceRecordId: input.sourceRecord.id,
      rootId: input.id,
      correctsId: null,
      correctionIndex: 0,
      correctionReason: null,
    })
    .onConflictDoNothing({ target: measurement.id });

  return { stored: true, id: input.id, outcome };
}

export type CorrectionInput = {
  id: string;
  /** Any row of the chain. The correction attaches to whichever value stands today. */
  correctsId: string;
  rawValue: string;
  value: number | null;
  reason: string;
  timeZone: string;
};

/**
 * An edit, which is an insert. The original keeps its row, its number and its
 * source forever, and after three edits the chain holds four rows.
 *
 * The new row corrects whatever stands today rather than whatever the caller
 * happened to be looking at, so two edits raised from two stale screens still
 * produce a chain and never a fork.
 */
export async function appendCorrection(input: CorrectionInput): Promise<MeasurementRow> {
  const db = getDb();
  const anchor = await readMeasurement(input.correctsId);
  if (!anchor) throw new Error(strings.api.log.correctionTargetGone(input.correctsId));

  const chain = await readChain(anchor.rootId);
  const current = orderChain(chain).at(-1)!;

  const sourceRecordId = `src_${input.id}`;
  await upsertSourceRecord({
    id: sourceRecordId,
    source: 'manual',
    kind: 'manual_entry',
    reference: input.id,
    occurredAt: new Date(),
    detail: [
      { key: 'source.field.correctedFrom', value: current.rawValue },
      { key: 'source.field.correctedTo', value: input.rawValue },
      { key: 'source.field.correctionOf', value: current.id },
      { key: 'source.field.reason', value: input.reason },
    ],
  });

  const [row] = await db
    .insert(measurement)
    .values({
      id: input.id,
      metric: current.metric,
      rawValue: input.rawValue,
      rawUnit: current.rawUnit,
      value: input.value,
      unit: current.unit,
      conversionFactor: current.conversionFactor,
      timeZone: input.timeZone,
      source: 'manual',
      measuredAt: current.measuredAt,
      confidence: 'measured_manual',
      importVersion: IMPORT_VERSION,
      dedupDecision: 'correction',
      dedupReason: strings.provenance.correctionOf(current.id),
      sourceRecordId,
      rootId: current.rootId,
      correctsId: current.id,
      correctionIndex: current.correctionIndex + 1,
      correctionReason: input.reason,
    })
    .returning();

  return row;
}

export async function readMeasurement(id: string): Promise<MeasurementRow | undefined> {
  const db = getDb();
  const [row] = await db.select().from(measurement).where(eq(measurement.id, id));
  return row;
}

/** Every row of one value's history, oldest first. The original is always index 0. */
export async function readChain(rootId: string): Promise<MeasurementRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(measurement)
    .where(eq(measurement.rootId, rootId))
    .orderBy(measurement.correctionIndex);
  return rows;
}

export async function readSourceRecord(id: string): Promise<SourceRecordRow | undefined> {
  const db = getDb();
  const [row] = await db.select().from(sourceRecord).where(eq(sourceRecord.id, id));
  return row;
}

/** Every measurement that points at one source record, for the rows-in-this-batch card. */
export async function readMeasurementsOfSource(sourceRecordId: string): Promise<MeasurementRow[]> {
  const db = getDb();
  return db
    .select()
    .from(measurement)
    .where(eq(measurement.sourceRecordId, sourceRecordId))
    .orderBy(measurement.measuredAt);
}

/**
 * What stands today, per metric: the head of every chain, most recent first.
 * A superseded row is dropped from this list and from nowhere else.
 */
export async function readCurrentValues(limit = 40): Promise<MeasurementRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(measurement)
    .orderBy(desc(measurement.measuredAt), desc(measurement.correctionIndex))
    .limit(limit * 4);

  const heads = new Map<string, MeasurementRow>();
  for (const row of rows) {
    const held = heads.get(row.rootId);
    if (!held || row.correctionIndex > held.correctionIndex) heads.set(row.rootId, row);
  }
  return [...heads.values()]
    .sort((left, right) => right.measuredAt.getTime() - left.measuredAt.getTime())
    .slice(0, limit);
}

/** The last value of one metric, corrections applied. Null when there has never been one. */
export async function readLatestOfMetric(metric: string): Promise<MeasurementRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(measurement)
    .where(eq(measurement.metric, metric))
    .orderBy(desc(measurement.measuredAt))
    .limit(12);
  if (rows.length === 0) return null;
  const newest = rows[0];
  const chain = await readChain(newest.rootId);
  return orderChain(chain).at(-1) ?? newest;
}

export async function readOpenQuestions() {
  const db = getDb();
  return db
    .select()
    .from(importQuestion)
    .where(eq(importQuestion.state, 'open'))
    .orderBy(desc(importQuestion.raisedAt));
}

/** The source records behind a set of measurements, in one round trip. */
export async function readSourceRecordsFor(rows: MeasurementRow[]): Promise<Map<string, SourceRecordRow>> {
  if (rows.length === 0) return new Map();
  const db = getDb();
  const ids = [...new Set(rows.map((row) => row.sourceRecordId))];
  const records = await db.select().from(sourceRecord).where(inArray(sourceRecord.id, ids));
  return new Map(records.map((record) => [record.id, record]));
}

/**
 * The row as a screen or an API response sees it. Every provenance column
 * travels, because a value that reaches a component without its origin is a
 * value whose origin can be lost by accident later.
 */
export function toView(
  row: MeasurementRow,
  records?: Map<string, SourceRecordRow>,
): MeasurementView {
  const record = records?.get(row.sourceRecordId);
  return {
    id: row.id,
    rootId: row.rootId,
    metric: row.metric,
    rawValue: row.rawValue,
    rawUnit: row.rawUnit,
    value: row.value,
    unit: row.unit,
    conversionFactor: row.conversionFactor,
    timeZone: row.timeZone,
    source: row.source,
    measuredAt: row.measuredAt.toISOString(),
    importedAt: row.importedAt.toISOString(),
    confidence: row.confidence,
    importVersion: row.importVersion,
    dedupDecision: row.dedupDecision,
    dedupReason: row.dedupReason,
    sourceRecordId: row.sourceRecordId,
    correctionIndex: row.correctionIndex,
    correctionReason: row.correctionReason,
    sourceRecordSource: record && record.source !== row.source ? record.source : null,
  };
}

/** Every current value measured on one calendar day, in the app's zone. */
export async function readDay(day: Date, timeZone: string): Promise<MeasurementRow[]> {
  const rows = await readCurrentValues(120);
  return rows.filter((row) => sameDay(row.measuredAt, day, timeZone));
}

/** What the quick-log sheet opens with. One round trip, one shape. */
export async function readLogSnapshot(timeZone: string): Promise<LogSnapshot> {
  const now = new Date();
  const [today, lastWaist, questions] = await Promise.all([
    readDay(now, timeZone),
    readLatestOfMetric('waist'),
    readOpenQuestions(),
  ]);
  const records = await readSourceRecordsFor(lastWaist ? [...today, lastWaist] : today);
  return {
    asOf: now.toISOString(),
    timeZone,
    today: today.map((row) => toView(row, records)),
    lastWaist: lastWaist ? toView(lastWaist, records) : null,
    openQuestions: questions.length,
  };
}
