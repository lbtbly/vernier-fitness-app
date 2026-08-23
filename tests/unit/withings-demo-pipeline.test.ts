import { describe, expect, it } from 'vitest';
import {
  type BatchContext,
  type BatchWriter,
  type MeasurementInsert,
  type QuestionInsert,
  type SourceRecordInsert,
  commitBatch,
  deterministicId,
  stateOf,
} from '@/db/withings';
import {
  type ClientPorts,
  type TokenBundle,
  exchangeCode,
  fetchMeasures,
} from '@/lib/withings/client';
import { whatStands } from '@/lib/provenance';
import { type DemoServerState, demoTransport } from '@/lib/withings/demo-dataset';
import {
  type ImportPorts,
  type StandingOnDay,
  type StoredForKey,
  dayKeyFor,
  runImport,
} from '@/lib/withings/import';
import { rotateTokens } from '@/lib/withings/rotation';

/**
 * The whole demonstration pipeline, end to end, with no client identifier, no
 * network and no database.
 *
 * F36 asks that connect, historical import, incremental sync and status all
 * COMPLETE in demonstration mode, and that every imported row carry source
 * `demo`. That is what this file drives: the real client, the real page loop,
 * the real decisions and the real storage layer, against the demonstration
 * transport and an in-memory table that enforces the same unique index Postgres
 * does. The only thing standing in for Postgres is the table, and it refuses
 * what Postgres refuses.
 *
 * It also runs the same import three times, which is F40's first clause, and
 * puts a hand-typed correction in the way of the fourth, which is the question
 * path A2 completes.
 */

const ANCHOR = '2026-08-23';
const ZONE = 'Europe/Paris';
const CONTEXT: BatchContext = { mode: 'demo', source: 'demo', timeZone: ZONE };
const HISTORY = { historical: true, source: 'demo' as const, timeZone: ZONE };
const SYNC = { ...HISTORY, historical: false };

type StoredRow = MeasurementInsert;

/**
 * An in-memory `measurement`, refusing what the real one refuses: no UPDATE, no
 * DELETE, and one row per (source, external_key).
 */
class Table {
  rows: StoredRow[] = [];
  records: SourceRecordInsert[] = [];
  questions: QuestionInsert[] = [];
  transactions = 0;

  session = async <T>(work: (writer: BatchWriter) => Promise<T>): Promise<T> => {
    this.transactions += 1;
    const writer: BatchWriter = {
      writeSourceRecord: async (input) => {
        if (!this.records.some((record) => record.id === input.id)) this.records.push(input);
      },
      insertMeasurement: async (row) => {
        const clash = this.rows.some(
          (held) => held.source === row.source && held.externalKey === row.externalKey,
        );
        if (clash) return 'conflicted';
        this.rows.push(row);
        return 'inserted';
      },
      raiseQuestion: async (question) => {
        if (this.questions.some((held) => held.id === question.id)) return 'exists';
        this.questions.push(question);
        return 'raised';
      },
    };
    return work(writer);
  };

  /** The chain heads, exactly as `lookupExternalKeys` builds them from Postgres. */
  lookup = async (keys: string[]): Promise<Map<string, StoredForKey>> => {
    const found = new Map<string, StoredForKey>();
    for (const key of keys) {
      const original = this.rows.find(
        (row) => row.source === CONTEXT.source && row.externalKey === key,
      );
      if (!original) continue;
      const chain = this.rows.filter((row) => row.rootId === original.rootId);
      const head = chain.reduce((highest, row) =>
        row.correctionIndex > highest.correctionIndex ? row : highest,
      );
      found.set(key, {
        originalId: original.id,
        rootId: original.rootId,
        headId: head.id,
        headRawValue: head.rawValue,
        headSource: head.source,
        headCorrectionIndex: head.correctionIndex,
        storedModified: Math.max(...chain.map((row) => row.externalModified)),
      });
    }
    return found;
  };

  /** What already stands for each metric on each day, chain heads only. */
  standing = async (rows: { metric: string; measuredAt: Date }[]): Promise<Map<string, StandingOnDay>> => {
    const heads = new Map<string, StoredRow>();
    for (const row of this.rows) {
      const held = heads.get(row.rootId);
      if (!held || row.correctionIndex > held.correctionIndex) heads.set(row.rootId, row);
    }
    // One row per day, chosen by the comparator every other resolution site
    // uses, which is how `standingOnDays` chooses it. This double kept whichever
    // row it happened to see first, and that is the coin toss A7 removed.
    const perDay = new Map<string, StoredRow[]>();
    for (const head of heads.values()) {
      const key = dayKeyFor(head.metric, head.measuredAt, ZONE);
      perDay.set(key, [...(perDay.get(key) ?? []), head]);
    }
    const found = new Map<string, StandingOnDay>();
    for (const [key, held] of perDay) {
      const head = whatStands(held, ZONE)!;
      found.set(key, { id: head.id, source: head.source, rawValue: head.rawValue });
    }
    // Only the days this answer actually touches, the way the query does.
    const wanted = new Set(rows.map((row) => dayKeyFor(row.metric, row.measuredAt, ZONE)));
    return new Map([...found].filter(([key]) => wanted.has(key)));
  };

  /** The owner correcting a value by hand, which is an insert like everything else. */
  correctByHand(headId: string, rawValue: string): void {
    const head = this.rows.find((row) => row.id === headId)!;
    this.rows.push({
      ...head,
      id: `manual-${headId}`,
      rawValue,
      value: Number(rawValue),
      source: 'manual',
      confidence: 'measured_manual',
      dedupDecision: 'correction',
      correctsId: head.id,
      correctionIndex: head.correctionIndex + 1,
      correctionReason: 'read on the other scale',
      // A hand correction has no identifier from any origin, and the real
      // column pair is null on both halves together.
      externalKey: `manual:${headId}`,
      externalModified: head.externalModified,
    });
  }
}

function openDemo(state: DemoServerState) {
  const rotated: TokenBundle[] = [];
  let held: TokenBundle | null = null;
  const ports: ClientPorts = {
    transport: demoTransport(
      () => state,
      () => {
        state.generation += 1;
      },
    ),
    // NO CLIENT ID AND NO CLIENT SECRET. F36's first clause, as an empty pair
    // rather than as a claim in a comment.
    credentials: { clientId: '', clientSecret: '', redirectUri: '' },
    readTokens: async () => held,
    rotateTokens: async (next) => {
      rotated.push(next);
      held = next;
    },
    now: () => new Date('2026-08-23T07:00:00Z'),
    sleep: async () => {},
  };
  return { ports, rotated, tokens: () => held };
}

function importPorts(table: Table, ports: ClientPorts, cursor: { at: number | null }): ImportPorts {
  return {
    readCursor: async () => cursor.at,
    fetch: (lastUpdate) => fetchMeasures(ports, lastUpdate),
    lookup: table.lookup,
    standing: table.standing,
    commit: (batch) => commitBatch(table.session, batch, CONTEXT),
    advanceCursor: async (to) => {
      cursor.at = to;
    },
    now: () => new Date('2026-08-23T07:00:00Z'),
  };
}

describe('the demonstration pipeline, with no client id and no network', () => {
  it('connects, imports the history, syncs again and holds its status', async () => {
    const state: DemoServerState = { anchorDay: ANCHOR, today: ANCHOR, stage: 'initial', generation: 1 };
    const demo = openDemo(state);
    const table = new Table();
    const cursor: { at: number | null } = { at: null };

    // ---- connect. The exchange runs through the same client the live path
    // uses, and the credentials it carries are empty strings.
    const exchanged = await exchangeCode(demo.ports, 'demo-authorization-code');
    expect(exchanged.bundle).not.toBeNull();
    await rotateTokens(
      async (work) => work({ writeTokens: async () => {}, writeConnection: async () => {} }),
      null,
      exchanged.bundle!,
      new Date(),
    );
    demo.ports.rotateTokens(exchanged.bundle!);
    expect(demo.tokens()?.tokenType).toBe('demo-bearer');

    // ---- historical import.
    const history = await runImport(importPorts(table, demo.ports, cursor), HISTORY);
    console.log(
      `historical import: ${history.pages} pages, ${history.groupsSeen} groups, ${history.measuresSeen} measures, ${history.commit?.stored} stored, ${history.groupsDropped} groups dropped whole`,
    );

    expect(history.outcome).toBe('ok');
    // Several pages, so the more/offset loop really ran.
    expect(history.pages).toBeGreaterThan(4);
    expect(history.commit?.stored).toBe(41 * 8);
    expect(history.bloodPressureGroupsDropped).toBe(1);
    expect(history.cursorAdvanced).toBe(true);
    expect(cursor.at).not.toBeNull();

    // EVERY IMPORTED ROW CARRIES SOURCE DEMO. F36's own words, counted over the
    // population rather than sampled.
    const bySource = new Map<string, number>();
    for (const row of table.rows) bySource.set(row.source, (bySource.get(row.source) ?? 0) + 1);
    console.log(`row source counts after the import: ${JSON.stringify([...bySource])}`);
    expect([...bySource]).toEqual([['demo', 41 * 8]]);
    expect(table.rows.every((row) => row.confidence === 'demo')).toBe(true);
    // And the source record stands in for a Withings sync batch, marked seeded.
    expect(table.records.every((record) => record.source === 'withings' && record.seed)).toBe(true);

    // Nothing from the blood pressure group reached the table, and the eight
    // metrics that did are the eight this product asks for.
    expect(table.rows.some((row) => row.metric.includes('pressure'))).toBe(false);
    expect([...new Set(table.rows.map((row) => row.metric))].sort()).toEqual([
      'body_water',
      'bone_mass',
      'fat_free_mass',
      'fat_mass',
      'fat_ratio',
      'muscle_mass',
      'standing_heart_rate',
      'weight',
    ]);

    // ---- the same import again. Same row count, and the second run says so.
    const again = await runImport(importPorts(table, demo.ports, { at: null }), HISTORY);
    console.log(
      `second historical run: ${again.commit?.stored} stored, ${again.commit?.duplicates} already here, over ${again.measuresSeen} measures`,
    );
    expect(table.rows).toHaveLength(41 * 8);
    expect(again.commit?.stored).toBe(0);
    expect(again.commit?.duplicates).toBe(41 * 8);

    // ---- incremental sync, after the account revised its newest weigh-in.
    state.stage = 'revised';
    const sync = await runImport(importPorts(table, demo.ports, cursor), SYNC);
    console.log(
      `incremental sync: ${sync.measuresSeen} measures came back, ${sync.commit?.revised} revised, ${sync.commit?.stored} new`,
    );
    expect(sync.outcome).toBe('ok');
    // One group came back and eight measures with it. Five of them moved,
    // because a scale that re-reads a weight re-derives the fat mass, the
    // fat-free mass, the muscle and the water from it; the fat ratio, the bone
    // mass and the pulse did not, and those three are deduplicated rather than
    // written again.
    expect(sync.measuresSeen).toBe(8);
    expect(sync.commit?.revised).toBe(5);
    expect(sync.commit?.duplicates).toBe(3);
    expect(sync.commit?.stored).toBe(0);
    expect(table.rows).toHaveLength(41 * 8 + 5);

    // The revision appended and the original is still readable, which is the
    // whole of A1: the table refuses UPDATE, so a corrected value is a second
    // row that names the first.
    const revision = table.rows.find(
      (row) => row.correctionIndex === 1 && row.metric === 'weight',
    )!;
    expect(revision.correctsId).not.toBeNull();
    const original = table.rows.find((row) => row.id === revision.correctsId)!;
    expect(original.rawValue).not.toBe(revision.rawValue);
    expect(original.correctionIndex).toBe(0);
    expect(revision.externalKey).toBe(`${original.externalKey}@${revision.externalModified}`);

    // ---- status. The connection reads as a demonstration one, whatever the
    // stored state token says, because the mode is what the screen is naming.
    const row = {
      state: 'connected',
      refreshRotatedAt: new Date('2026-08-23T07:00:00Z'),
    } as Parameters<typeof stateOf>[0];
    expect(stateOf(row, 'demo', new Date('2026-08-23T08:00:00Z'))).toBe('demo');
  });

  it('raises a question instead of overwriting a correction the owner typed', async () => {
    const state: DemoServerState = { anchorDay: ANCHOR, today: ANCHOR, stage: 'initial', generation: 1 };
    const demo = openDemo(state);
    const table = new Table();
    const cursor: { at: number | null } = { at: null };

    const exchanged = await exchangeCode(demo.ports, 'demo-authorization-code');
    demo.ports.rotateTokens(exchanged.bundle!);
    await runImport(importPorts(table, demo.ports, cursor), HISTORY);

    // The owner reads the newest weight on another scale and corrects it.
    const newest = table.rows
      .filter((row) => row.metric === 'weight')
      .sort((left, right) => right.measuredAt.getTime() - left.measuredAt.getTime())[0];
    table.correctByHand(newest.id, '84.100');
    const before = table.rows.length;

    // Withings then revises the same measure to something else.
    state.stage = 'revised';
    const sync = await runImport(importPorts(table, demo.ports, cursor), SYNC);

    console.log(
      `after a hand correction of ${newest.rawValue} to 84.100, the revised import raised ${sync.commit?.questions ?? 0} question(s), revised ${sync.commit?.revised ?? 0} of the derived values and stored ${sync.commit?.stored ?? 0} new rows over ${sync.measuresSeen} measures`,
    );
    expect(sync.commit?.questions).toBe(1);
    expect(sync.commit?.stored).toBe(0);
    // THE CORRECTED MEASURE WAS NOT WRITTEN, AND THAT IS THE WHOLE LINE. The
    // four derived values the owner never touched did revise, which is what
    // makes this a refusal about his correction rather than an import that
    // happened to do nothing: fat mass, fat-free mass, muscle and water moved
    // with the new weight, and the weight itself is a question.
    expect(sync.commit?.revised).toBe(4);
    expect(table.rows).toHaveLength(before + 4);
    expect(table.rows.some((row) => row.metric === 'weight' && row.correctionIndex > 1)).toBe(false);

    const question = table.questions[0];
    expect(question.storedRawValue).toBe('84.100');
    expect(question.storedSource).toBe('manual');
    expect(question.incomingSource).toBe('demo');
    expect(question.metric).toBe('weight');
    // The stored value is still the owner's, untouched.
    const head = table.rows.find((row) => row.id === `manual-${newest.id}`)!;
    expect(head.rawValue).toBe('84.100');
  });

  it('leaves the demonstration seed\'s own weight series alone', async () => {
    // THE COLLISION THIS SLICE WOULD OTHERWISE SHIP. The demonstration seed
    // writes a Withings-shaped weight every morning at 06:52 and the
    // demonstration account this slice connects writes one too. Both are source
    // `demo`, so neither the external key nor the source outranks the other, and
    // without the day rule the chart would carry two points a morning for six
    // weeks with a seven-day average computed over fourteen readings.
    const state: DemoServerState = { anchorDay: ANCHOR, today: ANCHOR, stage: 'initial', generation: 1 };
    const demo = openDemo(state);
    const table = new Table();
    const cursor: { at: number | null } = { at: null };
    const exchanged = await exchangeCode(demo.ports, 'demo-authorization-code');
    demo.ports.rotateTokens(exchanged.bundle!);

    // The seed's own rows, as it writes them: source demo, no external key, one
    // weight a morning.
    const seededDays = [0, 1, 2, 3, 4];
    for (const daysAgo of seededDays) {
      const at = new Date(`${ANCHOR}T06:52:00Z`);
      at.setUTCDate(at.getUTCDate() - daysAgo);
      table.rows.push({
        id: `demo_weight_d${daysAgo}`,
        metric: 'weight',
        rawValue: `86.${daysAgo}00`,
        rawUnit: 'kg',
        value: 86 + daysAgo / 10,
        unit: 'kg',
        timeZone: ZONE,
        source: 'demo',
        measuredAt: at,
        confidence: 'demo',
        dedupDecision: 'unique',
        dedupReason: 'seeded',
        sourceRecordId: 'demo_src_weight',
        externalKey: `seed:${daysAgo}`,
        externalModified: 1,
        rootId: `demo_weight_d${daysAgo}`,
        correctsId: null,
        correctionIndex: 0,
        correctionReason: null,
      });
    }

    const report = await runImport(importPorts(table, demo.ports, cursor), HISTORY);
    const weights = table.rows.filter((row) => row.metric === 'weight');
    const perDay = new Map<string, number>();
    for (const row of weights) {
      const key = dayKeyFor('weight', row.measuredAt, ZONE);
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }
    const doubled = [...perDay].filter(([, count]) => count > 1);
    console.log(
      `${seededDays.length} seeded mornings met the import: ${weights.length} weight rows over ${perDay.size} days, ${doubled.length} of them holding two`,
    );

    // A zero beside its population: five days the seed already owned, and not
    // one of them holds two readings.
    expect(perDay.size).toBeGreaterThan(seededDays.length);
    expect(doubled).toEqual([]);
    // The five days the seed owned were left to it, and the other seven metrics
    // on those same mornings were stored, so this is a day rule and not a
    // metric this import quietly stopped writing.
    expect(report.commit?.duplicates).toBe(seededDays.length);
    for (const daysAgo of seededDays) {
      const at = new Date(`${ANCHOR}T06:52:00Z`);
      at.setUTCDate(at.getUTCDate() - daysAgo);
      const key = dayKeyFor('fat_mass', at, ZONE);
      const fat = table.rows.find(
        (row) => row.metric === 'fat_mass' && dayKeyFor('fat_mass', row.measuredAt, ZONE) === key,
      );
      expect(fat).toBeDefined();
    }
  });

  it('gives the same measure the same row id on every run, for ever', async () => {
    // The demonstration account is a pure function of its anchor, so a boot
    // tomorrow writes the days that are missing and nothing else, exactly as
    // the demonstration seed does.
    expect(deterministicId('demo', '4100042:1')).toBe(deterministicId('demo', '4100042:1'));
  });
});

describe('the status the screen reads', () => {
  const rotated = new Date('2026-08-23T07:00:00Z');
  const row = (state: string) =>
    ({ state, refreshRotatedAt: rotated }) as Parameters<typeof stateOf>[0];

  it('says connected while the refresh token has a year left', () => {
    expect(stateOf(row('connected'), 'live', new Date('2026-09-23T07:00:00Z'))).toBe('connected');
  });

  it('says expiring inside the last month of the refresh token', () => {
    // The refresh token lives a year and rotates on every use, so an
    // installation that syncs weekly never meets this. One that sat switched
    // off for eleven months does, and this is the month of warning it gets
    // before the only way back is consenting by hand.
    expect(stateOf(row('connected'), 'live', new Date('2027-08-10T07:00:00Z'))).toBe('expiring');
  });

  it('keeps revoked, disconnected and connecting exactly as they were stored', () => {
    for (const state of ['revoked', 'disconnected', 'connecting']) {
      expect(stateOf(row(state), 'live', new Date('2026-09-23T07:00:00Z'))).toBe(state);
      expect(stateOf(row(state), 'demo', new Date('2026-09-23T07:00:00Z'))).toBe(state);
    }
  });

  it('says disconnected when there is no connection row at all', () => {
    expect(stateOf(null, 'demo', new Date())).toBe('disconnected');
  });
});
