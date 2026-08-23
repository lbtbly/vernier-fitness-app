import { asc, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from './client';
import { storeMeasurement, type SourceRecordInput } from './measurements';
import { labAnalyte, labDocument, measurement } from './schema';
import type { Analyte, PrintedUnit } from '@/lib/labs';
import type { PageCensus } from '@/lib/lab-parse';
import type { ReviewDocument, ReviewRow } from '@/lib/lab-review';
import { removeDocument } from '@/lib/lab-storage';

/**
 * The laboratory tables, and the door every laboratory write goes through.
 *
 * One rule holds this file together: A REVIEW IS A HOLDING AND `measurement` IS
 * THE STORE. Everything about a candidate row lives in `lab_document.extraction`
 * and is deleted whole when the review is abandoned; a row only reaches
 * `measurement` when `saveRow` is called for that one ordinal, which is what
 * `/api/labs/row` does once per explicit tap. There is no function here that
 * writes more than one measurement, and that is not an omission.
 */

export type AnalyteRow = typeof labAnalyte.$inferSelect;
export type DocumentRow = typeof labDocument.$inferSelect;

function toAnalyte(row: AnalyteRow): Analyte {
  return {
    key: row.key,
    label: row.label,
    unit: row.unit,
    printed: row.printed as PrintedUnit[],
    low: row.low,
    high: row.high,
    referenceLow: row.referenceLow,
    referenceHigh: row.referenceHigh,
    sourceUrl: row.sourceUrl,
    aliases: row.aliases,
    builtIn: row.builtIn,
  };
}

/** The catalogue in the order the screens draw it. The read every lab surface starts from. */
export async function readAnalytes(): Promise<Analyte[]> {
  const db = getDb();
  const rows = await db.select().from(labAnalyte).orderBy(asc(labAnalyte.position));
  return rows.map(toAnalyte);
}

export async function readAnalyte(key: string): Promise<Analyte | null> {
  const db = getDb();
  const [row] = await db.select().from(labAnalyte).where(eq(labAnalyte.key, key));
  return row ? toAnalyte(row) : null;
}

export type AddAnalyteInput = {
  key: string;
  label: string;
  unit: string;
  printed: PrintedUnit[];
  low: number;
  high: number;
  referenceLow: number | null;
  referenceHigh: number | null;
  sourceUrl: string;
  aliases: string[];
};

/**
 * A fourteenth analyte, added through the interface while a panel is reviewed.
 *
 * F64 asks for this with no source file modified and `git status` clean, which
 * is the whole reason the catalogue is a table. `built_in` is false and stays
 * false: the label is the owner's word, the closed-world string check reads it
 * out of this column as data, and nothing about it is copy this repository
 * wrote.
 *
 * The band is generous on purpose. A plausibility band for an analyte nobody
 * planned for cannot be tighter than the owner's own numbers, so it is derived
 * from the reference range he typed rather than guessed at, and the row is still
 * saved one tap at a time like every other.
 */
export async function addAnalyte(input: AddAnalyteInput): Promise<Analyte> {
  const db = getDb();
  const [count] = await db.select({ position: labAnalyte.position }).from(labAnalyte)
    .orderBy(desc(labAnalyte.position))
    .limit(1);
  const [row] = await db
    .insert(labAnalyte)
    .values({
      key: input.key,
      label: input.label,
      unit: input.unit,
      printed: input.printed,
      low: input.low,
      high: input.high,
      referenceLow: input.referenceLow,
      referenceHigh: input.referenceHigh,
      sourceUrl: input.sourceUrl,
      aliases: input.aliases,
      position: (count?.position ?? 0) + 1,
      builtIn: false,
    })
    .onConflictDoUpdate({
      target: labAnalyte.key,
      set: { label: input.label, unit: input.unit },
    })
    .returning();
  return toAnalyte(row);
}

export type CreateDocumentInput = {
  id: string;
  fileName: string;
  byteSize: number;
  pageCount: number;
  mode: 'text' | 'ocr' | 'manual';
  panelDate: Date | null;
  laboratory: string;
  storedPath: string | null;
  checksum: string | null;
  refusals: number;
  census: PageCensus[];
  rows: ReviewRow[];
};

export async function createDocument(input: CreateDocumentInput): Promise<DocumentRow> {
  const db = getDb();
  const [row] = await db
    .insert(labDocument)
    .values({
      id: input.id,
      fileName: input.fileName,
      byteSize: input.byteSize,
      pageCount: input.pageCount,
      mode: input.mode,
      state: 'review',
      panelDate: input.panelDate,
      laboratory: input.laboratory,
      storedPath: input.storedPath,
      checksum: input.checksum,
      fileRemoved: false,
      refusals: input.refusals,
      census: input.census,
      extraction: input.rows,
    })
    .returning();
  return row;
}

export function toReviewDocument(row: DocumentRow): ReviewDocument {
  return {
    id: row.id,
    uploadedAt: row.uploadedAt.toISOString(),
    fileName: row.fileName,
    byteSize: row.byteSize,
    pageCount: row.pageCount,
    laboratory: row.laboratory,
    panelDate: row.panelDate ? row.panelDate.toISOString() : null,
    mode: row.mode as ReviewDocument['mode'],
    state: row.state,
    retention: row.retention,
    fileRemoved: row.fileRemoved,
    hasFile: row.storedPath !== null && !row.fileRemoved,
    refusals: row.refusals,
    census: row.census as PageCensus[],
    rows: row.extraction as ReviewRow[],
  };
}

export async function readDocument(id: string): Promise<DocumentRow | null> {
  const db = getDb();
  const [row] = await db.select().from(labDocument).where(eq(labDocument.id, id));
  return row ?? null;
}

/** Every document, most recent first. The archive on the labs screen. */
export async function readDocuments(): Promise<DocumentRow[]> {
  const db = getDb();
  return db.select().from(labDocument).orderBy(desc(labDocument.uploadedAt));
}

/** The reviews still open. Counted on Health so an abandoned import is visible. */
export async function readOpenReviews(): Promise<DocumentRow[]> {
  const db = getDb();
  return db
    .select()
    .from(labDocument)
    .where(eq(labDocument.state, 'review'))
    .orderBy(desc(labDocument.uploadedAt));
}

/** The holding, rewritten after one row was decided. Never touches `measurement`. */
export async function writeExtraction(id: string, rows: ReviewRow[]): Promise<void> {
  const db = getDb();
  await db.update(labDocument).set({ extraction: rows }).where(eq(labDocument.id, id));
}

/**
 * The review abandoned: the holding deleted, and the file with it.
 *
 * F58 counts rows before and after abandonment and expects zero, and this is
 * what makes that true of both tables. The document row goes because it is a
 * holding and holding nothing is what an abandoned review holds; the file goes
 * because it was uploaded for a review that no longer exists, and keeping a
 * medical document nobody asked to keep is the opposite of what F63 is about.
 *
 * A document with saved rows cannot be abandoned. Those rows are in
 * `measurement`, which refuses DELETE, so deleting the holding would orphan the
 * page link they point at. The route refuses instead and says so.
 */
export async function abandonDocument(id: string): Promise<{ fileRemoved: boolean }> {
  const db = getDb();
  const row = await readDocument(id);
  const fileRemoved = row?.storedPath && !row.fileRemoved ? await removeDocument(id) : false;
  await db.delete(labDocument).where(eq(labDocument.id, id));
  return { fileRemoved };
}

/**
 * The moment of validation: the review is closed and the keep-or-delete answer
 * is recorded.
 *
 * DESIGN.md puts this question here rather than in a settings screen six weeks
 * later, and F63 wants the file actually gone when the answer is delete. It is
 * `rm` on the volume and not a flag: `removeDocument` reports whether the bytes
 * were there, and that boolean travels back so the screen states what happened
 * rather than what was intended.
 */
export async function validateDocument(
  id: string,
  retention: 'kept' | 'deleted',
): Promise<{ fileRemoved: boolean }> {
  const db = getDb();
  const row = await readDocument(id);
  if (!row) return { fileRemoved: false };
  const fileRemoved =
    retention === 'deleted' && row.storedPath !== null && !row.fileRemoved
      ? await removeDocument(id)
      : false;
  await db
    .update(labDocument)
    .set({
      state: 'validated',
      retention,
      retentionAt: new Date(),
      validatedAt: row.validatedAt ?? new Date(),
      storedPath: retention === 'deleted' ? null : row.storedPath,
      fileRemoved: retention === 'deleted' ? true : row.fileRemoved,
    })
    .where(eq(labDocument.id, id));
  return { fileRemoved };
}

export type SaveRowInput = {
  /** The client UUID that carried this write. Row id and idempotency key both. */
  id: string;
  document: DocumentRow;
  row: ReviewRow;
  analyte: Analyte;
  /** The value in the analyte's own unit, already converted and checked. */
  value: number;
  /** The number the sheet printed, exactly as it printed it. */
  printedValue: string;
  printedUnit: string;
  conversionFactor: number | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  referenceText: string | null;
  measuredAt: Date;
  timeZone: string;
};

/**
 * ONE measurement. Never two, and there is no batch overload of this function.
 *
 * The source record is per PAGE, not per document and not per row, because that
 * is what a page of a laboratory report is: one real event that carried several
 * readings, the same way a Withings sync batch does. Tap 2 on any stored value
 * lands on the page it was printed on, which is the destination DESIGN.md's
 * provenance walk names for a lab value.
 *
 * The source is `manual` when the panel was typed and `lab_pdf` when it came out
 * of a file, and the confidence is `printed` either way: the laboratory printed
 * the number, the owner only carried it. That distinction matters on the value
 * sheet months later.
 */
export async function saveRow(input: SaveRowInput) {
  const source = input.document.mode === 'manual' ? ('manual' as const) : ('lab_pdf' as const);
  const sourceRecord: SourceRecordInput = {
    id: `src_${input.document.id}_p${input.row.page}`,
    source,
    kind: source === 'manual' ? 'manual_entry' : 'lab_page',
    reference:
      input.document.fileName === ''
        ? input.document.id
        : `${input.document.fileName}, ${input.row.page}`,
    occurredAt: input.measuredAt,
    detail: [
      { key: 'source.field.laboratory', value: input.document.laboratory },
      { key: 'source.field.page', value: String(input.row.page) },
      { key: 'source.field.printedValue', value: `${input.printedValue} ${input.printedUnit}` },
      ...(input.conversionFactor !== null
        ? [{ key: 'source.field.factor', value: String(input.conversionFactor) }]
        : []),
      { key: 'source.field.storedValue', value: `${input.value} ${input.analyte.unit}` },
    ],
  };

  return storeMeasurement({
    id: input.id,
    metric: input.analyte.key,
    rawValue: input.printedValue,
    rawUnit: input.printedUnit,
    value: input.value,
    unit: input.analyte.unit,
    conversionFactor: input.conversionFactor,
    referenceLow: input.referenceLow,
    referenceHigh: input.referenceHigh,
    referenceText: input.referenceText,
    timeZone: input.timeZone,
    source,
    measuredAt: input.measuredAt,
    confidence: 'printed',
    sourceRecord,
  });
}

/**
 * Every stored value of a set of analytes, oldest first, for the trend charts.
 *
 * Chain heads only: a row that was corrected is superseded by its correction and
 * the trend draws what stands today. Nothing is interpolated between two panels
 * and no panel is carried forward, so the series is exactly as long as the
 * number of panels that exist.
 */
export async function readAnalyteSeries(
  keys: string[],
): Promise<Map<string, Array<{ id: string; at: Date; value: number; unit: string; source: string; seed: boolean }>>> {
  const series = new Map<string, Array<{ id: string; at: Date; value: number; unit: string; source: string; seed: boolean }>>();
  if (keys.length === 0) return series;
  const db = getDb();
  const rows = await db
    .select()
    .from(measurement)
    .where(inArray(measurement.metric, keys))
    .orderBy(asc(measurement.measuredAt), asc(measurement.correctionIndex));

  const heads = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const held = heads.get(row.rootId);
    if (!held || row.correctionIndex > held.correctionIndex) heads.set(row.rootId, row);
  }
  for (const row of [...heads.values()].sort(
    (left, right) => left.measuredAt.getTime() - right.measuredAt.getTime(),
  )) {
    if (row.value === null) continue;
    const list = series.get(row.metric) ?? [];
    list.push({
      id: row.id,
      at: row.measuredAt,
      value: row.value,
      unit: row.unit,
      source: row.source,
      seed: row.seed,
    });
    series.set(row.metric, list);
  }
  return series;
}
