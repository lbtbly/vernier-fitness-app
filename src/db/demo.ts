import { eq, sql } from 'drizzle-orm';
import { getDb } from './client';
import { insertGoalIfAbsent } from './goal';
import { goal, measurement, plannedSession, sourceRecord } from './schema';
import {
  DEMO_GOAL,
  DEMO_SESSIONS,
  HRV_BY_DAY,
  RESTING_BY_DAY,
  SLEEP_BY_DAY,
  STEPS_BY_DAY,
  VO2_BY_DAY,
  WAIST_BY_DAY,
  WEIGHT_BY_DAY,
} from '@/lib/demo-series';
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

/**
 * ---------------------------------------------------------------------------
 * The series behind the charts.
 *
 * Six rows prove six shapes of provenance. They cannot prove a trend, and the
 * trend is the product: a seven-day average that leads, a gap drawn as a gap, a
 * rolling window that states its count, a goal line with a corridor, and a
 * source that has gone quiet. All five need history, so the seed writes six
 * weeks of it.
 *
 * The numbers are hand-written rather than generated, because the arithmetic
 * they produce is what the screens say out loud and it has to be true. Read off
 * this table: today's seven-day average is 86.4 kg, last week's is 87.0 on
 * three days of seven, the 28-day pace is half a kilogram a week, and this
 * morning's 85.9 sits half a kilo under the average it does not get to be. That
 * last pair is the whole point of the design, and it is a hydration swing.
 *
 * DATES ARE ANCHORED TO THE FIRST RUN AND NEVER MOVE. Every id names its own
 * offset in days, so a second boot writes nothing new and no timestamp shifts,
 * which is the same rule the six rows above have always followed. The
 * consequence is stated rather than hidden: a demonstration database left
 * running for a week grows a trailing gap, because the seed does not invent
 * readings for days it was not started on. That is the honest behaviour for a
 * seed and it is what a real silent source looks like too.
 * ---------------------------------------------------------------------------
 */

const SESSION_SHAPES = [
  {
    title: strings.demoSeed.session.strength,
    place: strings.demoSeed.session.mat,
    cause: strings.demoSeed.session.eveningCause,
    hour: 18,
    minute: 45,
    minutes: 35,
  },
  {
    title: strings.demoSeed.session.calisthenics,
    place: strings.demoSeed.session.bar,
    cause: strings.demoSeed.session.eveningCause,
    hour: 18,
    minute: 45,
    minutes: 40,
  },
  {
    title: strings.demoSeed.session.walk,
    place: strings.demoSeed.session.park,
    cause: strings.demoSeed.session.morningCause,
    hour: 7,
    minute: 15,
    minutes: 30,
  },
];

/** One reading of the series, ready to be written. */
type SeriesRow = {
  id: string;
  metric: string;
  value: number;
  unit: string;
  offset: number;
  hour: number;
  minute: number;
  sourceRecordId: string;
  standsInFor: Source;
  kind: SourceKind;
  reference: string;
  detail: Array<{ key: string; value: string }>;
};

/** The Withings batch a day's weight arrived in. One sync a week, plus today's. */
function weightBatch(offset: number, rows: number): { id: string; reference: string; detail: SeriesRow['detail'] } {
  const week = Math.floor(offset / 7);
  return {
    id: `${DEMO_ID_PREFIX}src_weight_w${week}`,
    reference: String(1183 - week),
    detail: [
      { key: 'source.field.endpoint', value: strings.demoSeed.field.endpoint },
      { key: 'source.field.window', value: strings.demoSeed.field.weekWindow },
      { key: 'source.field.rowsReceived', value: '7' },
      { key: 'source.field.rowsStored', value: String(rows) },
      { key: 'source.field.result', value: '200' },
    ],
  };
}

/** The shortcut payload a day's phone signals arrived in. One a day. */
function healthPayload(offset: number, rows: number) {
  return {
    // Offset 4 already has one: the payload the six shapes above wrote, which
    // carries that day's steps. Everything else from that day joins it rather
    // than inventing a second payload for the same morning.
    id: offset === 4 ? `${DEMO_ID_PREFIX}src_steps` : `${DEMO_ID_PREFIX}src_health_d${offset}`,
    reference: offset === 4 ? strings.demoSeed.reference.steps : String(3391 - offset),
    detail: [
      { key: 'source.field.shortcut', value: strings.demoSeed.shortcutName },
      { key: 'source.field.rowsReceived', value: String(rows) },
      { key: 'source.field.rowsStored', value: String(rows) },
      { key: 'source.field.result', value: '202' },
    ],
  };
}

function waistEntry(offset: number) {
  return {
    id: offset === 3 ? `${DEMO_ID_PREFIX}src_waist` : `${DEMO_ID_PREFIX}src_waist_d${offset}`,
    reference: strings.demoSeed.reference.waist,
    detail: [
      { key: 'source.field.enteredOn', value: strings.demoSeed.field.enteredOn },
      { key: 'source.field.method', value: strings.quickLog.waistMethod },
    ],
  };
}

/**
 * Every row of the series, six weeks of it, with the six anchor rows above left
 * out because they are already written and their ids are already fixed.
 */
function seriesRows(): SeriesRow[] {
  const rows: SeriesRow[] = [];

  const weightOffsets = Object.keys(WEIGHT_BY_DAY).map(Number).sort((a, b) => a - b);
  const perWeek = new Map<number, number>();
  for (const offset of weightOffsets) {
    perWeek.set(Math.floor(offset / 7), (perWeek.get(Math.floor(offset / 7)) ?? 0) + 1);
  }
  for (const offset of weightOffsets) {
    if (offset === 0) continue; // demo_weight, already written and already 85.9.
    const batch = weightBatch(offset, perWeek.get(Math.floor(offset / 7)) ?? 1);
    rows.push({
      id: `${DEMO_ID_PREFIX}weight_d${offset}`,
      metric: 'weight',
      value: WEIGHT_BY_DAY[offset],
      unit: 'kg',
      offset,
      hour: 6,
      minute: 52,
      sourceRecordId: batch.id,
      standsInFor: 'withings',
      kind: 'sync_batch',
      reference: batch.reference,
      detail: batch.detail,
    });
  }

  for (const [key, value] of Object.entries(WAIST_BY_DAY)) {
    const offset = Number(key);
    if (offset === 3) continue; // demo_waist.
    const entry = waistEntry(offset);
    rows.push({
      id: `${DEMO_ID_PREFIX}waist_d${offset}`,
      metric: 'waist',
      value,
      unit: 'cm',
      offset,
      hour: 7,
      minute: 20,
      sourceRecordId: entry.id,
      standsInFor: 'manual',
      kind: 'manual_entry',
      reference: entry.reference,
      detail: entry.detail,
    });
  }

  // How many signals rode in on one morning's payload, so its stored count is
  // the count and not a guess.
  const perDay = new Map<number, number>();
  const phone: Array<[Record<number, number>, string, string, number, number]> = [
    [STEPS_BY_DAY, 'steps', 'step', 7, 12],
    [SLEEP_BY_DAY, 'sleep_minutes', 'min', 7, 14],
    [RESTING_BY_DAY, 'resting_heart_rate', 'bpm', 7, 16],
    [HRV_BY_DAY, 'hrv', 'ms', 7, 18],
    [VO2_BY_DAY, 'vo2_max', 'mL/kg/min', 7, 20],
  ];
  for (const [table] of phone) {
    for (const key of Object.keys(table)) {
      const offset = Number(key);
      perDay.set(offset, (perDay.get(offset) ?? 0) + 1);
    }
  }
  for (const [table, metric, unit, hour, minute] of phone) {
    for (const [key, value] of Object.entries(table)) {
      const offset = Number(key);
      if (metric === 'steps' && offset === 4) continue; // demo_steps.
      const payload = healthPayload(offset, perDay.get(offset) ?? 1);
      rows.push({
        id: `${DEMO_ID_PREFIX}${metric}_d${offset}`,
        metric,
        value,
        unit,
        offset,
        hour,
        minute,
        sourceRecordId: payload.id,
        standsInFor: 'apple_health_shortcut',
        kind: 'shortcut_payload',
        reference: payload.reference,
        detail: payload.detail,
      });
    }
  }

  return rows;
}

/** The instant an offset lands on, at a plausible hour, in the app's zone. */
function instantAt(offset: number, hour: number, minute: number, timeZone: string): Date {
  return instantOf(
    { daysAgo: offset, atHour: hour, atMinute: minute } as DemoRow,
    timeZone,
  );
}

/** Nine calendar months on, which is what "over nine months" means on a calendar. */
function monthsOn(from: Date, months: number): Date {
  const on = new Date(from.getTime());
  on.setUTCMonth(on.getUTCMonth() + months);
  return on;
}

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

export type SeededRows = {
  measurements: number;
  sourceRecords: number;
  sessions: number;
  goals: number;
};

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
  const [sessions] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(plannedSession)
    .where(eq(plannedSession.seed, true));
  const [goals] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(goal)
    .where(eq(goal.seed, true));
  return {
    measurements: measurements?.n ?? 0,
    sourceRecords: sourceRecords?.n ?? 0,
    sessions: sessions?.n ?? 0,
    goals: goals?.n ?? 0,
  };
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

  written += await seedSeries(timeZone);
  written += await seedSessions(timeZone);
  await seedGoal(timeZone);

  return { ran: true, written, ...(await countSeededRows()) };
}

/**
 * Six weeks of readings, written once and never moved.
 *
 * Every row goes in through the same two tables and the same marker as the six
 * above: the measurement's own source is `demo`, the record it points at
 * carries the shape it stands in for, and `seed` is true on both. The composite
 * foreign key refuses any row that gets one of those two wrong.
 */
async function seedSeries(timeZone: string): Promise<number> {
  const db = getDb();
  const rows = seriesRows();
  const records = new Map<string, SeriesRow>();
  for (const row of rows) if (!records.has(row.sourceRecordId)) records.set(row.sourceRecordId, row);

  for (const [id, row] of records) {
    await db
      .insert(sourceRecord)
      .values({
        id,
        source: row.standsInFor,
        kind: row.kind,
        reference: row.reference,
        occurredAt: instantAt(row.offset, row.hour, row.minute, timeZone),
        importVersion: IMPORT_VERSION,
        detail: row.detail,
        seed: true,
      })
      .onConflictDoNothing({ target: sourceRecord.id });
  }

  let written = 0;
  for (const row of rows) {
    const measuredAt = instantAt(row.offset, row.hour, row.minute, timeZone);
    const inserted = await db
      .insert(measurement)
      .values({
        id: row.id,
        metric: row.metric,
        rawValue: String(row.value),
        rawUnit: row.unit,
        value: row.value,
        unit: row.unit,
        conversionFactor: null,
        timeZone,
        source: 'demo',
        measuredAt,
        confidence: 'demo',
        importVersion: IMPORT_VERSION,
        dedupDecision: 'unique',
        dedupReason: strings.provenance.seeded,
        sourceRecordId: row.sourceRecordId,
        rootId: row.id,
        correctsId: null,
        correctionIndex: 0,
        correctionReason: null,
      })
      .onConflictDoNothing({ target: measurement.id })
      .returning({ id: measurement.id });
    written += inserted.length;
  }
  return written;
}

/** The planned sessions adherence is counted against. */
async function seedSessions(timeZone: string): Promise<number> {
  const db = getDb();
  let written = 0;
  for (const [index, session] of DEMO_SESSIONS.entries()) {
    const shape = SESSION_SHAPES[index % SESSION_SHAPES.length];
    const plannedFor = instantAt(session.offset, shape.hour, shape.minute, timeZone);
    const inserted = await db
      .insert(plannedSession)
      .values({
        id: `${DEMO_ID_PREFIX}session_d${session.offset}`,
        plannedFor,
        durationMinutes: shape.minutes,
        title: shape.title,
        place: shape.place,
        cause: shape.cause,
        state: session.state,
        completedAt: session.state === 'completed' ? plannedFor : null,
        seed: true,
      })
      .onConflictDoNothing({ target: plannedSession.id })
      .returning({ id: plannedSession.id });
    written += inserted.length;
  }
  return written;
}

/**
 * The goal, written only if there is not one already, so a boot never walks
 * over a target the owner edited.
 */
async function seedGoal(timeZone: string): Promise<void> {
  const startAt = instantAt(DEMO_GOAL.startOffset, 7, 0, timeZone);
  await insertGoalIfAbsent({
    metric: 'weight',
    unit: 'kg',
    startValue: DEMO_GOAL.startValue,
    startAt,
    targetValue: DEMO_GOAL.targetValue,
    targetAt: monthsOn(startAt, DEMO_GOAL.targetMonths),
    seed: true,
  });
}
