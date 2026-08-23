import { describe, expect, it } from 'vitest';
import type { CallCounters, MeasureResult } from '@/lib/withings/client';
import { type WithingsMeasureGroup, harvest } from '@/lib/withings/codes';
import {
  type CommitReport,
  type ImportPorts,
  type PreparedBatch,
  type StandingOnDay,
  type StoredForKey,
  batchIdFor,
  dayKeyFor,
  decideRow,
  runImport,
} from '@/lib/withings/import';

/**
 * The order of operations, and the one thing it exists to guarantee: the cursor
 * is the LAST thing that moves.
 *
 * A cursor that advanced before the write committed would turn a crash into a
 * permanent hole, because `lastupdate` is how the next run decides what it has
 * already seen and nothing else would ever ask about those rows again. Nothing
 * in this file touches a database or a socket, so the crash can be driven on
 * purpose and the cursor read afterwards.
 */

/** Every run in this file is the real scale, in the app's zone. */
const RUN = { historical: false, source: 'withings' as const, timeZone: 'Europe/Paris' };
const HISTORY = { ...RUN, historical: true };

const NO_COUNTERS: CallCounters = {
  refreshesForAuthFailure: 0,
  retriesAfterRefresh: 0,
  rateLimitBackoffs: 0,
  timeoutRetries: 0,
  proactiveRefreshes: 0,
};

/**
 * The first morning of the six weeks, as a unix second. Groups are placed one
 * calendar day apart from here, because "one reading per metric per day" is a
 * rule about days and a fixture whose groups all landed at second 2000 would be
 * a fixture whose groups all landed on 1 January 1970.
 */
const FIRST_MORNING = Math.floor(Date.parse('2026-07-13T06:52:00Z') / 1000);

function group(grpid: number, modified: number, weight: number): WithingsMeasureGroup {
  const date = FIRST_MORNING + grpid * 86_400;
  return {
    grpid,
    attrib: 0,
    date,
    created: date + 10,
    modified,
    category: 1,
    measures: [{ value: Math.round(weight * 1000), type: 1, unit: -3 }],
  };
}

function measured(groups: WithingsMeasureGroup[], kind: MeasureResult['outcome']['kind'] = 'ok'): MeasureResult {
  const harvested = harvest(groups);
  return {
    outcome: kind === 'ok' ? { kind: 'ok', body: {} } : { kind: 'failed', status: 503 },
    requests: [],
    counters: NO_COUNTERS,
    groups,
    harvest: harvested,
    maxModified: groups.reduce<number | null>(
      (highest, entry) => (highest === null || entry.modified > highest ? entry.modified : highest),
      null,
    ),
    pages: 1,
    cappedOut: false,
  };
}

function emptyCommit(): CommitReport {
  return { stored: 0, revised: 0, duplicates: 0, questions: 0, refused: 0, storedIds: [], questionIds: [] };
}

type Harness = {
  ports: ImportPorts;
  cursor: () => number | null;
  batches: PreparedBatch[];
  advances: number[];
};

function harness(options: {
  cursor?: number | null;
  result: MeasureResult;
  stored?: Map<string, StoredForKey>;
  standing?: Map<string, StandingOnDay>;
  crashOnCommit?: boolean;
}): Harness {
  let cursor = options.cursor ?? null;
  const batches: PreparedBatch[] = [];
  const advances: number[] = [];

  const ports: ImportPorts = {
    readCursor: async () => cursor,
    fetch: async () => options.result,
    lookup: async () => options.stored ?? new Map(),
    standing: async () => options.standing ?? new Map(),
    async commit(batch) {
      batches.push(batch);
      if (options.crashOnCommit) throw new Error('the transaction was rolled back');
      const report = emptyCommit();
      for (const entry of batch.rows) {
        if (entry.decision.kind === 'insert') report.stored += 1;
        else if (entry.decision.kind === 'revise') report.revised += 1;
        else if (entry.decision.kind === 'question') report.questions += 1;
        else report.duplicates += 1;
      }
      return report;
    },
    async advanceCursor(to) {
      advances.push(to);
      cursor = to;
    },
    now: () => new Date('2026-08-23T07:00:00Z'),
  };

  return { ports, cursor: () => cursor, batches, advances };
}

describe('the cursor advances only after the write commits', () => {
  it('moves to the highest modification time the answer carried', async () => {
    const { ports, cursor, advances } = harness({
      cursor: 1000,
      result: measured([group(1, 2000, 86.1), group(2, 3000, 85.9)]),
    });
    const report = await runImport(ports, RUN);

    expect(report.commit?.stored).toBe(2);
    expect(advances).toEqual([3000]);
    expect(cursor()).toBe(3000);
    expect(report.cursorAdvanced).toBe(true);
    expect(report.from).toBe(1000);
  });

  it('leaves the cursor exactly where it was when the commit throws', async () => {
    // THE DELIBERATE CRASH BETWEEN FETCH AND COMMIT. The transaction rolls
    // back, nothing landed, and the cursor has not moved, so the next run asks
    // Withings the same question and gets the same answer.
    //
    // WHAT WOULD MAKE THIS GO RED: advancing the cursor from the fetch result
    // rather than after the commit resolves, which is the shape the agent
    // reference's "store the updatetime from each response" advice produces.
    const { ports, cursor, advances, batches } = harness({
      cursor: 1000,
      result: measured([group(1, 2000, 86.1), group(2, 3000, 85.9)]),
      crashOnCommit: true,
    });
    const report = await runImport(ports, RUN);

    console.log(
      `crash between fetch and commit: ${batches[0].rows.length} rows were prepared, ${advances.length} cursor advances happened, cursor is ${cursor()}`,
    );
    expect(batches).toHaveLength(1);
    expect(batches[0].rows).toHaveLength(2);
    expect(advances).toEqual([]);
    expect(cursor()).toBe(1000);
    expect(report.cursor).toBe(1000);
    expect(report.cursorAdvanced).toBe(false);
    expect(report.commit).toBeNull();
    expect(report.failure).toBe('the transaction was rolled back');
  });

  it('does not move the cursor backwards when an answer carries older groups', async () => {
    const { ports, cursor } = harness({ cursor: 5000, result: measured([group(1, 2000, 86.1)]) });
    await runImport(ports, RUN);
    expect(cursor()).toBe(5000);
  });

  it('never calls out with a cursor on the historical sweep', async () => {
    const { ports, batches } = harness({ cursor: 4000, result: measured([group(1, 6000, 86.1)]) });
    const report = await runImport(ports, HISTORY);
    expect(report.ran).toBe('historical');
    expect(report.from).toBeNull();
    expect(batches[0].from).toBeNull();
    expect(batches[0].batchId).toBe(batchIdFor(null, 6000));
  });

  it('writes nothing and moves nothing when the call itself failed', async () => {
    const { ports, cursor, advances, batches } = harness({
      cursor: 1000,
      result: measured([group(1, 9000, 86.1)], 'failed'),
    });
    const report = await runImport(ports, RUN);
    expect(batches).toEqual([]);
    expect(advances).toEqual([]);
    expect(cursor()).toBe(1000);
    expect(report.outcome).toBe('failed');
  });
});

describe('what to do with one measure that arrived', () => {
  const incoming = { rawText: '85.900', modified: 3000, source: 'withings' as const };

  function stored(overrides: Partial<StoredForKey> = {}): StoredForKey {
    return {
      originalId: 'original',
      rootId: 'original',
      headId: 'original',
      headRawValue: '85.900',
      headSource: 'withings',
      headCorrectionIndex: 0,
      storedModified: 2000,
      ...overrides,
    };
  }

  it('inserts what this database has never seen', () => {
    expect(decideRow(incoming, null)).toEqual({ kind: 'insert' });
  });

  it('leaves a day alone when something of equal or higher rank already stands there', () => {
    // The demonstration seed writes a Withings-shaped weight every morning and
    // so does the demonstration account this slice connects. One reading per
    // metric per day is the rule this product has had since slice 3, and an
    // append-only store cannot take the loser back out, so a tie is broken in
    // favour of the row that is already committed.
    const seeded: StandingOnDay = { id: 'demo_weight_d0', source: 'demo', rawValue: '85.900' };
    expect(decideRow({ ...incoming, source: 'demo' }, null, seeded)).toEqual({
      kind: 'duplicate',
      keptId: 'demo_weight_d0',
      because: 'day_taken',
    });

    // And the real scale outranks a demonstration row, so a live import is not
    // blocked by a seed the owner left switched on.
    expect(decideRow({ ...incoming, source: 'withings' }, null, seeded)).toEqual({ kind: 'insert' });

    // A hand-typed reading does not outrank the scale either way round.
    const typed: StandingOnDay = { id: 'manual-row', source: 'manual', rawValue: '85.000' };
    expect(decideRow({ ...incoming, source: 'withings' }, null, typed)).toEqual({ kind: 'insert' });
    expect(decideRow({ ...incoming, source: 'demo' }, null, typed).kind).toBe('duplicate');
  });

  it('keys a standing reading by metric and calendar day in the app zone', () => {
    // A weigh-in at 23:50 in Paris is that day's, not the next one's in UTC.
    expect(dayKeyFor('weight', new Date('2026-08-23T21:50:00Z'), 'Europe/Paris')).toBe(
      'weight|2026-08-23',
    );
    expect(dayKeyFor('weight', new Date('2026-08-23T22:50:00Z'), 'Europe/Paris')).toBe(
      'weight|2026-08-24',
    );
  });

  it('calls the same number arriving again a duplicate and writes nothing', () => {
    // Withings resends everything modified since the cursor, so this is the
    // ordinary case on every sync rather than an error.
    expect(decideRow(incoming, stored())).toEqual({
      kind: 'duplicate',
      keptId: 'original',
      because: 'identical',
    });
  });

  it('raises a question when the value that stands is a correction the OWNER typed', () => {
    // The quiet half of the unapproved-write risk. An import that overwrites a
    // correction produces a wrong number with nothing pointing at it, and the
    // owner's own words were "that's worse than not importing at all, because I
    // won't know to check".
    const decision = decideRow({ rawText: '86.400', modified: 4000, source: 'withings' }, stored({
      headId: 'the-correction',
      headRawValue: '85.100',
      headSource: 'manual',
      headCorrectionIndex: 1,
    }));
    expect(decision).toEqual({
      kind: 'question',
      measurementId: 'the-correction',
      storedRawValue: '85.100',
      storedSource: 'manual',
    });
  });

  it('revises when the import itself wrote the value that stands', () => {
    // A chain whose head came from an earlier import is not a correction the
    // owner made, so a newer revision appends to it rather than asking him.
    const decision = decideRow({ rawText: '85.700', modified: 4000, source: 'withings' }, stored({
      headId: 'the-earlier-revision',
      headRawValue: '85.900',
      headSource: 'withings',
      headCorrectionIndex: 1,
      storedModified: 3000,
    }));
    expect(decision).toEqual({
      kind: 'revise',
      correctsId: 'the-earlier-revision',
      rootId: 'original',
      from: '85.900',
      index: 2,
    });
  });

  it('refuses to revise from an equal or older modification time', () => {
    // An older `modified` is the same fact told again, not a revision. Letting
    // it through would let a stale page of a paginated answer overwrite a newer
    // one, which is a chain that walks backwards.
    for (const modified of [2000, 1000]) {
      expect(decideRow({ rawText: '84.000', modified, source: 'withings' }, stored())).toEqual({
        kind: 'duplicate',
        keptId: 'original',
        because: 'not_newer',
      });
    }
    expect(decideRow({ rawText: '84.000', modified: 2001, source: 'withings' }, stored()).kind).toBe('revise');
  });
});

describe('running the same import twice', () => {
  it('prepares the same rows and decides nothing new the second time', async () => {
    const groups = [group(1, 2000, 86.1), group(2, 3000, 85.9)];

    const first = harness({ cursor: null, result: measured(groups) });
    const one = await runImport(first.ports, HISTORY);
    expect(one.commit?.stored).toBe(2);

    // What the first run left behind, as the second run's lookup sees it.
    const already = new Map<string, StoredForKey>();
    for (const entry of first.batches[0].rows) {
      already.set(entry.row.externalKey, {
        originalId: entry.row.externalKey,
        rootId: entry.row.externalKey,
        headId: entry.row.externalKey,
        headRawValue: entry.row.rawText,
        headSource: 'withings',
        headCorrectionIndex: 0,
        storedModified: entry.row.modified,
      });
    }

    const second = harness({ cursor: one.cursor, result: measured(groups), stored: already });
    const two = await runImport(second.ports, HISTORY);

    console.log(
      `run one stored ${one.commit?.stored} of ${one.measuresSeen} measures; run two stored ${two.commit?.stored} and deduplicated ${two.commit?.duplicates} of the same ${two.measuresSeen}`,
    );
    // A zero beside its population: the second run walked the same two measures
    // and decided both were already here.
    expect(two.measuresSeen).toBe(2);
    expect(two.commit?.stored).toBe(0);
    expect(two.commit?.duplicates).toBe(2);
    expect(two.commit?.questions).toBe(0);
  });

  it('appends a revision when a group comes back with a newer modification time', async () => {
    const already = new Map<string, StoredForKey>([
      [
        '1:1',
        {
          originalId: 'the-original',
          rootId: 'the-original',
          headId: 'the-original',
          headRawValue: '86.100',
          headSource: 'withings',
          headCorrectionIndex: 0,
          storedModified: 2000,
        },
      ],
    ]);
    const revised = harness({
      cursor: 2000,
      result: measured([group(1, 7400, 85.9)]),
      stored: already,
    });
    const report = await runImport(revised.ports, RUN);

    expect(report.commit?.revised).toBe(1);
    expect(report.commit?.stored).toBe(0);
    const decision = revised.batches[0].rows[0].decision;
    expect(decision).toEqual({
      kind: 'revise',
      correctsId: 'the-original',
      rootId: 'the-original',
      from: '86.100',
      index: 1,
    });
    expect(revised.cursor()).toBe(7400);
  });
});

describe('the batch a run prepares', () => {
  it('claims a day as it goes, so two weigh-ins in one morning land as one reading', async () => {
    // The second group is the same metric on the same day from a different
    // grpid, so neither the external key nor the committed rows can catch it:
    // what catches it is the day this run already claimed.
    const morning = group(1, 2000, 86.1);
    const again = { ...group(2, 2100, 86.4), date: morning.date + 600 };
    expect(new Date(again.date * 1000).toISOString().slice(0, 10)).toBe(
      new Date(morning.date * 1000).toISOString().slice(0, 10),
    );
    const { ports, batches } = harness({ cursor: 1000, result: measured([morning, again]) });
    const report = await runImport(ports, RUN);
    console.log(
      `two weigh-ins on one morning: ${report.commit?.stored} stored, ${report.commit?.duplicates} dropped as the day already taken`,
    );
    expect(report.commit?.stored).toBe(1);
    expect(report.commit?.duplicates).toBe(1);
    expect(batches[0].rows[1].decision).toMatchObject({ kind: 'duplicate', because: 'day_taken' });
  });

  it('carries the population every count in the report is read against', async () => {
    const scale = group(1, 2000, 86.1);
    const monitor: WithingsMeasureGroup = {
      grpid: 2,
      attrib: 0,
      date: 1980,
      created: 1990,
      modified: 1995,
      category: 1,
      measures: [
        { value: 0, type: 9, unit: 0 },
        { value: 0, type: 10, unit: 0 },
        { value: 71, type: 11, unit: 0 },
      ],
    };
    const { ports, batches } = harness({ cursor: 1000, result: measured([scale, monitor]) });
    const report = await runImport(ports, RUN);

    expect(report.groupsSeen).toBe(2);
    expect(report.measuresSeen).toBe(4);
    expect(report.groupsDropped).toBe(1);
    expect(report.bloodPressureGroupsDropped).toBe(1);
    expect(batches[0].rows).toHaveLength(1);
    expect(batches[0].droppedGroups).toEqual([{ grpid: 2, dropped: 'blood_pressure', types: [9, 10, 11] }]);
  });

  it('names itself from the window it covered, so the same run writes one record', async () => {
    const groups = [group(1, 2000, 86.1)];
    const first = harness({ cursor: 1000, result: measured(groups) });
    await runImport(first.ports, RUN);
    const second = harness({ cursor: 1000, result: measured(groups) });
    await runImport(second.ports, RUN);
    expect(first.batches[0].batchId).toBe(second.batches[0].batchId);
    expect(first.batches[0].batchId).toBe('withings_batch_1000_2000');
  });
});
