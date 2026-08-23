import { type Source, PRECEDENCE } from '@/lib/provenance';
import type { CallCounters, MeasureResult, RequestLine } from '@/lib/withings/client';
import type { HarvestedGroup, HarvestedRow } from '@/lib/withings/codes';

/**
 * The import, as an order of operations rather than as a database script.
 *
 * Fetch, decide, commit, and only then advance the cursor. The last comma is
 * the whole point: the cursor is what tells the next run where to start, so a
 * cursor that moves before the write commits turns a crash into a permanent
 * hole. Nothing here touches a database or a socket, so a test can drive a
 * deliberate crash between fetch and commit and read the cursor afterwards.
 */

/** What this database already holds for one external key, chain and all. */
export type StoredForKey = {
  /** The row the first arrival of this measure wrote. */
  originalId: string;
  rootId: string;
  /** The row that stands today: the last correction, or the original. */
  headId: string;
  headRawValue: string;
  headSource: string;
  headCorrectionIndex: number;
  /** The highest modification instant any row of this chain was written from. */
  storedModified: number | null;
};

export type RowDecision =
  | { kind: 'insert' }
  | { kind: 'duplicate'; keptId: string; because: 'identical' | 'not_newer' | 'day_taken' }
  | { kind: 'revise'; correctsId: string; rootId: string; from: string; index: number }
  | { kind: 'question'; measurementId: string; storedRawValue: string; storedSource: string };

/**
 * A reading of the same metric that already stands for the same day, from some
 * chain this import has never written.
 *
 * The demonstration seed writes a Withings-shaped weight every morning, and so
 * does the demonstration account this slice connects. Without this the two
 * would both be points on the chart, twice a day, for six weeks: one reading
 * per metric per day is the rule this product has had since slice 3 and an
 * importer does not get an exemption from it.
 */
export type StandingOnDay = { id: string; source: string; rawValue: string };

/**
 * What to do with one measure that arrived.
 *
 * Four answers and the order is the rule.
 *
 * 1. Nothing here has this external key: it is new, insert it.
 * 2. The value that stands today is the same number: the same fact arrived
 *    twice and there is nothing to store. Withings resends everything modified
 *    since the cursor, so this is the ordinary case on every sync and not an
 *    error.
 * 3. The value that stands today is a correction the OWNER typed: it is a
 *    question, and a question writes nothing. This is the quiet half of the
 *    unapproved-write risk. An import that overwrites a correction produces a
 *    wrong number with nothing pointing at it, and the owner's own words were
 *    "that's worse than not importing at all, because I won't know to check".
 * 4. The group's modification instant is newer than anything this chain was
 *    written from: Withings revised the measure, so the chain gets one more
 *    row and the original stays exactly where it is. An equal or older
 *    modification cannot revise anything; it is the same fact told again.
 */
export function decideRow(
  incoming: { rawText: string; modified: number; source: Source },
  stored: StoredForKey | null,
  standing: StandingOnDay | null = null,
): RowDecision {
  if (!stored) {
    // 0. Nothing has this key, but something already describes this metric on
    //    this day. Precedence decides, and an equal rank means the row that is
    //    already here stays: an append-only store cannot take the loser back
    //    out, so the tie has to be broken in favour of what is committed.
    if (standing) {
      const mine = PRECEDENCE[incoming.source] ?? 0;
      const theirs = PRECEDENCE[standing.source as Source] ?? 0;
      if (mine <= theirs) {
        return { kind: 'duplicate', keptId: standing.id, because: 'day_taken' };
      }
    }
    return { kind: 'insert' };
  }

  if (stored.headRawValue === incoming.rawText) {
    return { kind: 'duplicate', keptId: stored.headId, because: 'identical' };
  }

  if (stored.headCorrectionIndex > 0 && stored.headSource === 'manual') {
    return {
      kind: 'question',
      measurementId: stored.headId,
      storedRawValue: stored.headRawValue,
      storedSource: stored.headSource,
    };
  }

  if (stored.storedModified !== null && incoming.modified <= stored.storedModified) {
    return { kind: 'duplicate', keptId: stored.headId, because: 'not_newer' };
  }

  return {
    kind: 'revise',
    correctsId: stored.headId,
    rootId: stored.rootId,
    from: stored.headRawValue,
    index: stored.headCorrectionIndex + 1,
  };
}

export type PreparedRow = { row: HarvestedRow; decision: RowDecision };

export type PreparedBatch = {
  /** Deterministic, so the same import running twice writes one source record. */
  batchId: string;
  occurredAt: Date;
  from: number | null;
  to: number | null;
  rows: PreparedRow[];
  droppedGroups: HarvestedGroup[];
  requests: RequestLine[];
  counters: CallCounters;
  measuresSeen: number;
  groupsSeen: number;
  pages: number;
  cappedOut: boolean;
};

export type CommitReport = {
  stored: number;
  revised: number;
  duplicates: number;
  questions: number;
  /** Rows the storage layer refused because their type is outside the allowlist. */
  refused: number;
  storedIds: string[];
  questionIds: string[];
};

export type ImportPorts = {
  readCursor: () => Promise<number | null>;
  fetch: (lastUpdate: number | null) => Promise<MeasureResult>;
  lookup: (externalKeys: string[]) => Promise<Map<string, StoredForKey>>;
  /**
   * What already stands for each metric on each day this answer touches, keyed
   * `metric|YYYY-MM-DD` in the app's zone. Chain heads only.
   */
  standing: (rows: HarvestedRow[]) => Promise<Map<string, StandingOnDay>>;
  /** One transaction. Everything in the batch lands, or none of it does. */
  commit: (batch: PreparedBatch) => Promise<CommitReport>;
  advanceCursor: (to: number) => Promise<void>;
  now: () => Date;
};

export type ImportReport = {
  ran: 'historical' | 'incremental';
  outcome: MeasureResult['outcome']['kind'];
  status: number | null;
  from: number | null;
  /** Where the cursor stands after this run. Unchanged when the write did not commit. */
  cursor: number | null;
  cursorAdvanced: boolean;
  commit: CommitReport | null;
  batchId: string | null;
  measuresSeen: number;
  groupsSeen: number;
  groupsDropped: number;
  bloodPressureGroupsDropped: number;
  pages: number;
  cappedOut: boolean;
  requests: RequestLine[];
  counters: CallCounters;
  /** Set when the commit threw. The cursor did not move and the run is a failure. */
  failure: string | null;
};

export function batchIdFor(from: number | null, to: number | null): string {
  return `withings_batch_${from ?? 0}_${to ?? 0}`;
}

/** The key `standing` is read by: one metric, one calendar day, in the app's zone. */
export function dayKeyFor(metric: string, at: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(at);
  return `${metric}|${day}`;
}

/**
 * One import run.
 *
 * `historical` is the first sweep after a connection: no `lastupdate`, so
 * Withings answers with everything the account holds and the page loop walks it
 * under its cap. Every run after that is incremental and starts from the stored
 * cursor.
 */
export async function runImport(
  ports: ImportPorts,
  options: { historical: boolean; source: Source; timeZone: string },
): Promise<ImportReport> {
  const from = options.historical ? null : await ports.readCursor();
  const result = await ports.fetch(from);

  const base = {
    ran: (options.historical ? 'historical' : 'incremental') as ImportReport['ran'],
    outcome: result.outcome.kind,
    status: 'status' in result.outcome ? result.outcome.status : null,
    from,
    pages: result.pages,
    cappedOut: result.cappedOut,
    requests: result.requests,
    counters: result.counters,
    measuresSeen: result.harvest.measuresSeen,
    groupsSeen: result.harvest.groupsSeen,
    groupsDropped: result.harvest.droppedGroups.length,
    bloodPressureGroupsDropped: result.harvest.droppedGroups.filter(
      (group) => group.dropped === 'blood_pressure',
    ).length,
  };

  if (result.outcome.kind !== 'ok' && result.outcome.kind !== 'no_data') {
    return {
      ...base,
      cursor: from,
      cursorAdvanced: false,
      commit: null,
      batchId: null,
      failure: null,
    };
  }

  const keys = [...new Set(result.harvest.rows.map((row) => row.externalKey))];
  const stored = keys.length > 0 ? await ports.lookup(keys) : new Map<string, StoredForKey>();
  const standing =
    result.harvest.rows.length > 0
      ? await ports.standing(result.harvest.rows)
      : new Map<string, StandingOnDay>();

  // A day this run has already claimed counts as taken for the rest of the run,
  // so two weigh-ins in one morning land as one reading and the second names
  // the first. Without it the day rule would only hold against rows that were
  // already committed when the fetch started.
  const claimed = new Map<string, StandingOnDay>();
  const rows: PreparedRow[] = result.harvest.rows.map((row) => {
    const held = stored.get(row.externalKey) ?? null;
    const dayKey = dayKeyFor(row.metric, row.measuredAt, options.timeZone);
    const already = standing.get(dayKey) ?? claimed.get(dayKey) ?? null;
    const decision = decideRow({ ...row, source: options.source }, held, already);
    if (!held && decision.kind === 'insert') {
      claimed.set(dayKey, { id: row.externalKey, source: options.source, rawValue: row.rawText });
    }
    return { row, decision };
  });

  const batch: PreparedBatch = {
    batchId: batchIdFor(from, result.maxModified),
    occurredAt: ports.now(),
    from,
    to: result.maxModified,
    rows,
    droppedGroups: result.harvest.droppedGroups,
    requests: result.requests,
    counters: result.counters,
    measuresSeen: result.harvest.measuresSeen,
    groupsSeen: result.harvest.groupsSeen,
    pages: result.pages,
    cappedOut: result.cappedOut,
  };

  let committed: CommitReport;
  try {
    committed = await ports.commit(batch);
  } catch (error) {
    // Nothing landed and the cursor has not moved, so the next run asks
    // Withings the same question and gets the same answer. That is the whole
    // reason the cursor is the last thing to change.
    return {
      ...base,
      cursor: from,
      cursorAdvanced: false,
      commit: null,
      batchId: batch.batchId,
      failure: (error as Error).message,
    };
  }

  // ONLY NOW. The write has committed, so the cursor may name what it covered.
  //
  // It advances past a dropped group too, and that is deliberate: a blood
  // pressure group is decided rather than committed, the decision is the same
  // every time, and a cursor that refused to pass one would re-fetch it on
  // every tick for the rest of the installation's life.
  let cursor = from;
  let cursorAdvanced = false;
  if (result.maxModified !== null && (from === null || result.maxModified > from)) {
    await ports.advanceCursor(result.maxModified);
    cursor = result.maxModified;
    cursorAdvanced = true;
  }

  return {
    ...base,
    cursor,
    cursorAdvanced,
    commit: committed,
    batchId: batch.batchId,
    failure: null,
  };
}
