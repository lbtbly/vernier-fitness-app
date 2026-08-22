import { eq, sql } from 'drizzle-orm';
import { getDb } from './client';
import { measurement, sourceRecord } from './schema';
import { IMPORT_VERSION, type Source } from '@/lib/provenance';
import { strings } from '@/lib/strings';
import type { SourceKind } from './measurements';

/**
 * The demonstration seed.
 *
 * Two rules, and they are the whole of it. It runs only when `DEMO_MODE` is 1,
 * and every row it writes, in both tables, is marked `seed`. Never blank, never
 * left to a naming convention: a demonstration row has to be tellable from a
 * real one by reading the database, because a badge in the user interface is a
 * claim, an id prefix is a habit, and a column is a fact.
 *
 * The source records it writes do carry the six real kinds, and that is not a
 * contradiction. The measurement's source says where the value entered this
 * database, which is the seed. The source record says what shape of origin the
 * row stands in for, so the sync batch, the shortcut payload, the laboratory
 * page, the model reply, the derivation and the demonstration record all exist
 * and all render through one screen. The value sheet prints both, plainly.
 *
 * What keeps that honest is `seed`. `measurement.seed` is computed by Postgres
 * from the source and cannot be set by any writer; `source_record.seed` is set
 * here; and a foreign key over both columns refuses a seeded measurement that
 * points at a real record or a real measurement that points at a seeded one.
 * So `demo_src_weight` still reads `source=withings, kind=sync_batch,
 * reference=1184`, and it also reads `seed=true`, which no Withings batch ever
 * will.
 *
 * Ids are fixed, so a second boot writes nothing new and no timestamp moves.
 *
 * Every word below comes out of the catalogue. A reference and a detail row are
 * free text in the database and they are read on /source/[id], so the seed
 * writing `'page 2, row 7'` here was the product authoring copy that reached a
 * person with no key: C6 says wherever in the shipped tree it was written, and
 * this file is in the shipped tree. The numbers stay literal, because a row
 * count and an HTTP status are values and not words.
 */

const DEMO_ID_PREFIX = 'demo_';

export function demoModeOn(): boolean {
  return process.env.DEMO_MODE === '1';
}

type DemoRow = {
  slug: string;
  metric: string;
  rawValue: string;
  rawUnit: string;
  value: number | null;
  unit: string;
  conversionFactor?: number;
  daysAgo: number;
  atHour: number;
  atMinute: number;
  standsInFor: Source;
  kind: SourceKind;
  reference: string;
  detail: Array<{ key: string; value: string }>;
};

/**
 * Six rows, one per source shape, and every number in them is a plausible
 * reading for this owner rather than a round figure. The laboratory row keeps
 * its printed 1.44 g/L and its factor beside the stored 3.72 mmol/L, because a
 * converted value never appears alone.
 */
const DEMO_ROWS: DemoRow[] = [
  {
    slug: 'weight',
    metric: 'weight',
    rawValue: '85.9',
    rawUnit: 'kg',
    value: 85.9,
    unit: 'kg',
    daysAgo: 0,
    atHour: 6,
    atMinute: 52,
    standsInFor: 'withings',
    kind: 'sync_batch',
    reference: strings.demoSeed.reference.weight,
    detail: [
      { key: 'source.field.endpoint', value: strings.demoSeed.field.endpoint },
      { key: 'source.field.window', value: strings.demoSeed.field.syncWindow },
      { key: 'source.field.rowsReceived', value: '7' },
      { key: 'source.field.rowsStored', value: '6' },
      { key: 'source.field.result', value: '200' },
    ],
  },
  {
    slug: 'steps',
    metric: 'steps',
    rawValue: '9412',
    rawUnit: 'step',
    value: 9412,
    unit: 'step',
    daysAgo: 4,
    atHour: 7,
    atMinute: 12,
    standsInFor: 'apple_health_shortcut',
    kind: 'shortcut_payload',
    reference: strings.demoSeed.reference.steps,
    detail: [
      { key: 'source.field.shortcut', value: strings.demoSeed.shortcutName },
      { key: 'source.field.rowsReceived', value: '4' },
      { key: 'source.field.rowsStored', value: '4' },
      { key: 'source.field.result', value: '202' },
    ],
  },
  {
    slug: 'waist',
    metric: 'waist',
    rawValue: '98.5',
    rawUnit: 'cm',
    value: 98.5,
    unit: 'cm',
    daysAgo: 3,
    atHour: 7,
    atMinute: 20,
    standsInFor: 'manual',
    kind: 'manual_entry',
    reference: strings.demoSeed.reference.waist,
    detail: [
      { key: 'source.field.enteredOn', value: strings.demoSeed.field.enteredOn },
      { key: 'source.field.method', value: strings.quickLog.waistMethod },
    ],
  },
  {
    slug: 'ldl',
    metric: 'ldl_cholesterol',
    rawValue: '1.44',
    rawUnit: 'g/L',
    value: 3.72,
    unit: 'mmol/L',
    conversionFactor: 2.586,
    daysAgo: 9,
    atHour: 8,
    atMinute: 5,
    standsInFor: 'lab_pdf',
    kind: 'lab_page',
    reference: strings.demoSeed.reference.ldl,
    detail: [
      { key: 'source.field.laboratory', value: strings.demoSeed.laboratory },
      { key: 'source.field.page', value: '2' },
      { key: 'source.field.printedValue', value: strings.demoSeed.field.printedValue },
      { key: 'source.field.factor', value: '2.586' },
      { key: 'source.field.storedValue', value: strings.demoSeed.field.storedValue },
    ],
  },
  {
    slug: 'average',
    metric: 'weight_average_7d',
    rawValue: '86.4',
    rawUnit: 'kg',
    value: 86.4,
    unit: 'kg',
    daysAgo: 0,
    atHour: 6,
    atMinute: 54,
    standsInFor: 'derived',
    kind: 'derivation',
    reference: strings.demoSeed.reference.average,
    detail: [
      { key: 'source.field.inputs', value: '7' },
      { key: 'source.field.window', value: strings.demoSeed.field.derivationWindow },
      { key: 'source.field.rule', value: strings.demoSeed.derivationRule },
    ],
  },
  {
    slug: 'energy',
    metric: 'energy',
    rawValue: '4',
    rawUnit: 'point',
    value: 4,
    unit: 'point',
    daysAgo: 1,
    atHour: 18,
    atMinute: 32,
    standsInFor: 'demo',
    kind: 'demo_record',
    reference: strings.demoSeed.reference.energy,
    detail: [
      { key: 'source.field.seed', value: IMPORT_VERSION },
      { key: 'source.field.rowsStored', value: '1' },
    ],
  },
];

function instantOf(row: DemoRow, timeZone: string): Date {
  // Anchored to the seed's own day, at a plausible hour, in the app's zone.
  const now = new Date();
  const local = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(new Date(now.getTime() - row.daysAgo * 86_400_000));
  const offset = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(now)
    .find((part) => part.type === 'timeZoneName')!
    .value.replace('GMT', '');
  const hour = String(row.atHour).padStart(2, '0');
  const minute = String(row.atMinute).padStart(2, '0');
  return new Date(`${local}T${hour}:${minute}:00${offset || '+00:00'}`);
}

export type SeededRows = { measurements: number; sourceRecords: number };

export type SeedResult =
  | ({ ran: false; reason: string } & SeededRows)
  | ({ ran: true; written: number } & SeededRows);

/**
 * How many seeded rows the database holds, counted off the marker column in
 * both tables the seed touches. F25 reads this back: zero and zero with
 * demonstration mode off, six and six with it on.
 */
export async function countSeededRows(): Promise<SeededRows> {
  const db = getDb();
  const [measurements] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(measurement)
    .where(eq(measurement.seed, true));
  const [sourceRecords] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sourceRecord)
    .where(eq(sourceRecord.seed, true));
  return { measurements: measurements?.n ?? 0, sourceRecords: sourceRecords?.n ?? 0 };
}

/**
 * Loads the seed, or refuses and says so. Called once per boot, right after the
 * migrations, so both outcomes land in the same log the migration count does.
 */
export async function seedDemoData(timeZone: string): Promise<SeedResult> {
  const db = getDb();

  if (!demoModeOn()) {
    return {
      ran: false,
      reason: strings.demoSeed.refused,
      ...(await countSeededRows()),
    };
  }

  let written = 0;
  for (const row of DEMO_ROWS) {
    const id = `${DEMO_ID_PREFIX}${row.slug}`;
    const sourceRecordId = `${DEMO_ID_PREFIX}src_${row.slug}`;
    const measuredAt = instantOf(row, timeZone);

    await db
      .insert(sourceRecord)
      .values({
        id: sourceRecordId,
        // The record's own source is the shape it stands in for, so all six
        // destinations exist. The measurement below is stamped demo regardless.
        source: row.standsInFor,
        kind: row.kind,
        reference: row.reference,
        occurredAt: measuredAt,
        importVersion: IMPORT_VERSION,
        detail: row.detail,
        seed: true,
      })
      .onConflictDoNothing({ target: sourceRecord.id });

    const inserted = await db
      .insert(measurement)
      .values({
        id,
        metric: row.metric,
        rawValue: row.rawValue,
        rawUnit: row.rawUnit,
        value: row.value,
        unit: row.unit,
        conversionFactor: row.conversionFactor ?? null,
        timeZone,
        source: 'demo',
        measuredAt,
        confidence: 'demo',
        importVersion: IMPORT_VERSION,
        dedupDecision: 'unique',
        dedupReason: strings.provenance.seeded,
        sourceRecordId,
        rootId: id,
        correctsId: null,
        correctionIndex: 0,
        correctionReason: null,
      })
      .onConflictDoNothing({ target: measurement.id })
      .returning({ id: measurement.id });
    written += inserted.length;
  }

  return { ran: true, written, ...(await countSeededRows()) };
}
