import { describe, expect, it } from 'vitest';
import {
  type BatchContext,
  type BatchWriter,
  type MeasurementInsert,
  type QuestionInsert,
  type SourceRecordInsert,
  commitBatch,
  deterministicId,
  storageAllowsType,
} from '@/db/withings';
import { ALLOWED_TYPES, BLOOD_PRESSURE_TYPES, type HarvestedRow } from '@/lib/withings/codes';
import type { CallCounters } from '@/lib/withings/client';
import type { PreparedBatch, PreparedRow } from '@/lib/withings/import';

/**
 * The SECOND blood pressure net, at the storage layer, with the fetch layer
 * bypassed entirely.
 *
 * The fetch layer drops a measure group carrying type 9 or 10 whole, and
 * tests/unit/withings-codes.test.ts grades that. This file never calls it. It
 * hands `commitBatch` rows that a bypassed fetch layer would have produced and
 * asks whether the store writes them, because a rule enforced in one place is
 * one refactor away from not being enforced at all.
 *
 * The writer is an argument, exactly as `src/db/idempotency.ts` makes its store
 * an argument. What decides whether a blood pressure measure can reach this
 * database is a guard and an ordering, and both are worth grading without
 * Postgres running.
 */

const NO_COUNTERS: CallCounters = {
  refreshesForAuthFailure: 0,
  retriesAfterRefresh: 0,
  rateLimitBackoffs: 0,
  timeoutRetries: 0,
  proactiveRefreshes: 0,
};

const DEMO_CONTEXT: BatchContext = { mode: 'demo', source: 'demo', timeZone: 'Europe/Paris' };
const LIVE_CONTEXT: BatchContext = { mode: 'live', source: 'withings', timeZone: 'Europe/Paris' };

function row(overrides: Partial<HarvestedRow> = {}): HarvestedRow {
  return {
    grpid: 4_100_042,
    type: 1,
    externalKey: '4100042:1',
    metric: 'weight',
    unit: 'kg',
    rawText: '86.100',
    value: 86.1,
    measuredAt: new Date('2026-08-23T06:52:00Z'),
    modified: 1_787_000_000,
    attribution: 'device',
    ...overrides,
  };
}

function batchOf(rows: PreparedRow[]): PreparedBatch {
  return {
    batchId: 'withings_batch_0_1787000000',
    occurredAt: new Date('2026-08-23T07:00:00Z'),
    from: null,
    to: 1_787_000_000,
    rows,
    droppedGroups: [],
    requests: [
      {
        url: 'https://wbsapi.withings.net/measure',
        form: { action: 'getmeas', meastypes: '1,5,6,8,11,76,77,88', category: '1' },
        envelopeStatus: 0,
        httpStatus: 200,
        verdict: 'ok',
      },
    ],
    counters: NO_COUNTERS,
    measuresSeen: rows.length,
    groupsSeen: 1,
    pages: 1,
    cappedOut: false,
  };
}

type Recorded = {
  session: <T>(work: (writer: BatchWriter) => Promise<T>) => Promise<T>;
  records: SourceRecordInsert[];
  inserts: MeasurementInsert[];
  questions: QuestionInsert[];
  transactions: string[];
};

function recorder(options: { conflictOn?: string[] } = {}): Recorded {
  const records: SourceRecordInsert[] = [];
  const inserts: MeasurementInsert[] = [];
  const questions: QuestionInsert[] = [];
  const transactions: string[] = [];

  const writer: BatchWriter = {
    async writeSourceRecord(input) {
      records.push(input);
    },
    async insertMeasurement(insert) {
      inserts.push(insert);
      return options.conflictOn?.includes(insert.externalKey) ? 'conflicted' : 'inserted';
    },
    async raiseQuestion(question) {
      questions.push(question);
      return 'raised';
    },
  };

  return {
    async session(work) {
      transactions.push('begin');
      const answer = await work(writer);
      transactions.push('commit');
      return answer;
    },
    records,
    inserts,
    questions,
    transactions,
  };
}

describe('the storage layer type guard', () => {
  it('allows exactly the eight this product asks for', () => {
    for (const type of ALLOWED_TYPES) expect(storageAllowsType(type)).toBe(true);
    console.log(`storage allowlist: ${[...ALLOWED_TYPES].join(', ')}`);
  });

  it('refuses both blood pressure codes even when the fetch layer never ran', async () => {
    // THE FETCH LAYER IS BYPASSED HERE ON PURPOSE. These rows could not have
    // come out of `harvest`: it drops the whole group they belong to. They are
    // what a future importer, a restored export or a direct call would produce,
    // and the store has to refuse them on its own.
    const rows: PreparedRow[] = [
      { row: row({ type: BLOOD_PRESSURE_TYPES[0], externalKey: '9:9', metric: 'weight' }), decision: { kind: 'insert' } },
      { row: row({ type: BLOOD_PRESSURE_TYPES[1], externalKey: '9:10', metric: 'weight' }), decision: { kind: 'insert' } },
      { row: row({ type: 11, externalKey: '9:11', metric: 'standing_heart_rate', unit: 'bpm', rawText: '71', value: 71 }), decision: { kind: 'insert' } },
      { row: row(), decision: { kind: 'insert' } },
    ];
    const store = recorder();
    const report = await commitBatch(store.session, batchOf(rows), LIVE_CONTEXT);

    console.log(
      `store walked ${rows.length} rows of types ${rows.map((entry) => entry.row.type).join(', ')} and refused ${report.refused}`,
    );
    expect(storageAllowsType(9)).toBe(false);
    expect(storageAllowsType(10)).toBe(false);
    expect(report.refused).toBe(2);

    // Nothing with a blood pressure type reached the writer at all.
    expect(store.inserts.some((insert) => insert.externalKey.endsWith(':9'))).toBe(false);
    expect(store.inserts.some((insert) => insert.externalKey.endsWith(':10'))).toBe(false);

    // AND THE ZERO MEANS SOMETHING: the two allowed rows in the same batch did
    // land, so this is a refusal and not an empty run.
    expect(store.inserts).toHaveLength(2);
    expect(report.stored).toBe(2);
  });

  it('refuses every type outside the eight, not only the two named ones', () => {
    // Pulse wave velocity, atrial fibrillation, the ECG intervals, temperature,
    // SP02, visceral fat, basal metabolic rate. None is asked for, so none is
    // stored, and a code Withings adds tomorrow is refused by default.
    for (const type of [4, 12, 54, 71, 73, 91, 123, 130, 135, 155, 170, 226, 999]) {
      expect(storageAllowsType(type)).toBe(false);
    }
  });

  it('runs the guard before the transaction, so a refused row is never inside one', async () => {
    const store = recorder();
    await commitBatch(
      store.session,
      batchOf([{ row: row({ type: 9, externalKey: '5:9' }), decision: { kind: 'insert' } }]),
      LIVE_CONTEXT,
    );
    expect(store.transactions).toEqual(['begin', 'commit']);
    expect(store.inserts).toEqual([]);
  });
});

describe('what one batch writes', () => {
  it('writes one source record standing in for a sync batch, and marks a demonstration one', async () => {
    const demo = recorder();
    await commitBatch(demo.session, batchOf([{ row: row(), decision: { kind: 'insert' } }]), DEMO_CONTEXT);
    // The measurement's source says where the value entered this database; the
    // record says what shape of origin it stands in for, and `seed` is the
    // column that tells the two apart by reading the table.
    expect(demo.records[0].source).toBe('withings');
    expect(demo.records[0].seed).toBe(true);
    expect(demo.inserts[0].source).toBe('demo');
    expect(demo.inserts[0].confidence).toBe('demo');

    const live = recorder();
    await commitBatch(live.session, batchOf([{ row: row(), decision: { kind: 'insert' } }]), LIVE_CONTEXT);
    expect(live.records[0].seed).toBe(false);
    expect(live.inserts[0].source).toBe('withings');
    expect(live.inserts[0].confidence).toBe('measured_device');
  });

  it('records what the batch actually did, so the source screen can be read back', async () => {
    const store = recorder();
    await commitBatch(store.session, batchOf([{ row: row(), decision: { kind: 'insert' } }]), DEMO_CONTEXT);
    const detail = Object.fromEntries(store.records[0].detail.map((line) => [line.key, line.value]));
    console.log(`batch detail written: ${JSON.stringify(detail)}`);
    expect(detail['source.field.typeFilter']).toBe('1,5,6,8,11,76,77,88');
    expect(detail['source.field.category']).toBe('1');
    expect(detail['source.field.bloodPressureDropped']).toBe('0');
    expect(detail['source.field.refusedByStorage']).toBe('0');
    expect(detail['source.field.envelopeStatus']).toBe('0');
  });

  it('marks a hand-typed Withings reading as measured by hand, not by the device', async () => {
    const store = recorder();
    await commitBatch(
      store.session,
      batchOf([{ row: row({ attribution: 'manual' }), decision: { kind: 'insert' } }]),
      LIVE_CONTEXT,
    );
    expect(store.inserts[0].confidence).toBe('measured_manual');
  });

  it('appends a revision that names what it corrects and never updates anything', async () => {
    const store = recorder();
    const report = await commitBatch(
      store.session,
      batchOf([
        {
          row: row({ rawText: '85.700', value: 85.7, modified: 1_787_005_400 }),
          decision: {
            kind: 'revise',
            correctsId: 'the-original',
            rootId: 'the-original',
            from: '86.100',
            index: 1,
          },
        },
      ]),
      LIVE_CONTEXT,
    );

    expect(report.revised).toBe(1);
    expect(report.stored).toBe(0);
    const written = store.inserts[0];
    expect(written.correctsId).toBe('the-original');
    expect(written.rootId).toBe('the-original');
    expect(written.correctionIndex).toBe(1);
    expect(written.dedupDecision).toBe('correction');
    // The key carries the modification instant that produced it, so the
    // original keeps its own key and its own row and the same revised group
    // arriving twice conflicts and does nothing.
    expect(written.externalKey).toBe('4100042:1@1787005400');
    expect(written.externalModified).toBe(1_787_005_400);
    expect(written.dedupReason).toContain('86.100');
    expect(written.dedupReason).toContain('85.700');
  });

  it('raises a question and writes no measurement for it', async () => {
    const store = recorder();
    const report = await commitBatch(
      store.session,
      batchOf([
        {
          row: row({ rawText: '86.400', value: 86.4 }),
          decision: {
            kind: 'question',
            measurementId: 'the-correction',
            storedRawValue: '85.100',
            storedSource: 'manual',
          },
        },
      ]),
      LIVE_CONTEXT,
    );
    expect(report.questions).toBe(1);
    expect(store.inserts).toEqual([]);
    expect(store.questions[0].storedRawValue).toBe('85.100');
    expect(store.questions[0].incomingRawValue).toBe('86.400');
    expect(store.questions[0].incomingSource).toBe('withings');
    expect(store.questions[0].id.startsWith('q_')).toBe(true);
  });

  it('counts a conflicted insert as a duplicate rather than as stored', async () => {
    // The unique index is the database half of idempotency. Two runs racing
    // each other both prepare an insert; one wins and the other is told so.
    const store = recorder({ conflictOn: ['4100042:1'] });
    const report = await commitBatch(
      store.session,
      batchOf([{ row: row(), decision: { kind: 'insert' } }]),
      LIVE_CONTEXT,
    );
    expect(report.stored).toBe(0);
    expect(report.duplicates).toBe(1);
  });

  it('writes nothing at all for a decided duplicate', async () => {
    const store = recorder();
    const report = await commitBatch(
      store.session,
      batchOf([{ row: row(), decision: { kind: 'duplicate', keptId: 'kept', because: 'identical' } }]),
      LIVE_CONTEXT,
    );
    expect(report.duplicates).toBe(1);
    expect(store.inserts).toEqual([]);
    expect(store.questions).toEqual([]);
  });
});

describe('the row identifiers', () => {
  it('are the same for the same measure for ever, on any machine', () => {
    // An import has no client UUID to key a row by, and a random one would make
    // the second run write a row only the unique index could catch.
    expect(deterministicId('withings', '4100042:1')).toBe(deterministicId('withings', '4100042:1'));
    expect(deterministicId('withings', '4100042:1')).not.toBe(deterministicId('demo', '4100042:1'));
    expect(deterministicId('withings', '4100042:1')).not.toBe(deterministicId('withings', '4100042:6'));
  });

  it('are uuid shaped, so they read on a screen like every other id here', () => {
    const id = deterministicId('withings', '4100042:1');
    console.log(`a Withings row id: ${id}`);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
