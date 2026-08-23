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
  | { kind: 'duplicate'; keptId: string; because: 'identical' | 'not_newer' }
  | { kind: 'revise'; correctsId: string; rootId: string; from: string; index: number }
  | { kind: 'question'; measurementId: string; storedRawValue: string; storedSource: string };

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
  incoming: { rawText: string; modified: number },
  stored: StoredForKey | null,
): RowDecision {
  if (!stored) return { kind: 'insert' };

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
  options: { historical: boolean },
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

  const rows: PreparedRow[] = result.harvest.rows.map((row) => ({
    row,
    decision: decideRow(row, stored.get(row.externalKey) ?? null),
  }));

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
