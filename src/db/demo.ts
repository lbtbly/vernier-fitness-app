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
 * and every measurement it writes carries source `demo`. Never `manual`, never
 * blank, never the origin it is standing in for: a demonstration row has to be
 * tellable from a real one by reading the database, because a badge in the user
 * interface is a claim and a column is a fact.
 *
 * The source records it writes do carry the six real kinds, and that is not a
 * contradiction. The measurement's source says where the value entered this
 * database, which is the seed. The source record says what shape of origin the
 * row stands in for, so the sync batch, the shortcut payload, the laboratory
 * page, the model reply, the derivation and the demonstration record all exist
 * and all render through one screen. The value sheet prints both, plainly.
 *
 * Ids are fixed, so a second boot writes nothing new and no timestamp moves.
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
    reference: '1184',
    detail: [
      { key: 'source.field.endpoint', value: 'measure?action=getmeas' },
      { key: 'source.field.window', value: '24 h' },
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
    reference: 'batch-3391',
    detail: [
      { key: 'source.field.shortcut', value: 'Vernier daily export' },
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
    reference: 'quick-log',
    detail: [
      { key: 'source.field.enteredOn', value: 'iPhone' },
      { key: 'source.field.method', value: 'Tape at the navel, standing, breathing out' },
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
    reference: 'page 2, row 7',
    detail: [
      { key: 'source.field.laboratory', value: 'Biogroup' },
      { key: 'source.field.page', value: '2' },
      { key: 'source.field.printedValue', value: '1.44 g/L' },
      { key: 'source.field.factor', value: '2.586' },
      { key: 'source.field.storedValue', value: '3.72 mmol/L' },
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
    reference: 'weight-7d',
    detail: [
      { key: 'source.field.inputs', value: '7' },
      { key: 'source.field.window', value: '7 d' },
      { key: 'source.field.rule', value: 'mean of daily readings, no interpolation' },
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
    reference: 'seed',
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

export type SeedResult =
  | { ran: false; reason: string; measurements: number }
  | { ran: true; measurements: number; sourceRecords: number; written: number };

/**
 * Loads the seed, or refuses and says so. Called once per boot, right after the
 * migrations, so both outcomes land in the same log the migration count does.
 */
export async function seedDemoData(timeZone: string): Promise<SeedResult> {
  const db = getDb();

  if (!demoModeOn()) {
    const [counted] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(measurement)
      .where(eq(measurement.source, 'demo'));
    return {
      ran: false,
      reason: 'DEMO_MODE is not 1, so the demonstration seed refused to run and wrote nothing.',
      measurements: counted?.n ?? 0,
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

  const [counted] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(measurement)
    .where(eq(measurement.source, 'demo'));

  return {
    ran: true,
    measurements: counted?.n ?? 0,
    sourceRecords: DEMO_ROWS.length,
    written,
  };
}
