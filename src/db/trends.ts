import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { getDb } from './client';
import { integrationCredential, measurement, sourceRecord } from './schema';
import { type Freshness, type Reading, freshnessOf } from '@/lib/trend';

/**
 * What the trend screens read: a metric's readings over a window, and how old
 * each source's newest sample is.
 *
 * Two things are deliberate here.
 *
 * **A reading carries its origin, not its writer.** `measurement.source` says
 * where the value entered this database, which for a demonstration row is the
 * seed. `source_record.source` says what shape of origin it stands in for,
 * which is what a chart's provenance chip should name and what a staleness
 * calculation has to count against: "Health has sent nothing for four days" is
 * a fact about Apple Health whether the rows behind it are seeded or real.
 * `seed` travels beside it so the chip can be drawn dotted and nothing pretends
 * a demonstration is a measurement.
 *
 * **Corrections are applied.** Only the head of each chain reaches a chart. The
 * superseded rows are still in the table, still readable, still linked from the
 * value sheet; they are simply not what stands today.
 */

export type ReadingRow = Reading & { rootId: string; correctionIndex: number };

/** The window a chart reads, as instants rather than as day keys. */
function boundsOf(anchor: Date, days: number): { from: Date; to: Date } {
  // A day earlier than the window needs, so a reading taken at 23:50 in a zone
  // ahead of UTC still lands inside its own calendar day.
  const from = new Date(anchor.getTime() - (days + 1) * 86_400_000);
  const to = new Date(anchor.getTime() + 86_400_000);
  return { from, to };
}

/** Chain heads only: the value that stands today for each stored reading. */
function heads(rows: ReadingRow[]): Reading[] {
  const byRoot = new Map<string, ReadingRow>();
  for (const row of rows) {
    const held = byRoot.get(row.rootId);
    if (!held || row.correctionIndex > held.correctionIndex) byRoot.set(row.rootId, row);
  }
  return [...byRoot.values()].sort((left, right) => left.measuredAt.getTime() - right.measuredAt.getTime());
}

/**
 * Every reading of one metric inside the window, corrections applied, with the
 * origin each one stands for.
 */
export async function readTrend(metric: string, anchor: Date, days: number): Promise<Reading[]> {
  const db = getDb();
  const { from, to } = boundsOf(anchor, days);
  const rows = await db
    .select({
      id: measurement.id,
      value: measurement.value,
      measuredAt: measurement.measuredAt,
      origin: sourceRecord.source,
      seed: measurement.seed,
      rootId: measurement.rootId,
      correctionIndex: measurement.correctionIndex,
    })
    .from(measurement)
    .innerJoin(sourceRecord, eq(sourceRecord.id, measurement.sourceRecordId))
    .where(
      and(
        eq(measurement.metric, metric),
        gte(measurement.measuredAt, from),
        lte(measurement.measuredAt, to),
      ),
    )
    .orderBy(asc(measurement.measuredAt));

  // A note has no number and is never a point on a chart. Nothing here turns a
  // null into a zero; the row is simply not a reading.
  const usable = rows.filter((row): row is ReadingRow & { value: number } => row.value !== null);
  return heads(usable);
}

/** Several metrics in one round trip, keyed by metric. */
export async function readTrends(
  metrics: string[],
  anchor: Date,
  days: number,
): Promise<Map<string, Reading[]>> {
  const db = getDb();
  const { from, to } = boundsOf(anchor, days);
  if (metrics.length === 0) return new Map();
  const rows = await db
    .select({
      metric: measurement.metric,
      id: measurement.id,
      value: measurement.value,
      measuredAt: measurement.measuredAt,
      origin: sourceRecord.source,
      seed: measurement.seed,
      rootId: measurement.rootId,
      correctionIndex: measurement.correctionIndex,
    })
    .from(measurement)
    .innerJoin(sourceRecord, eq(sourceRecord.id, measurement.sourceRecordId))
    .where(
      and(
        inArray(measurement.metric, metrics),
        gte(measurement.measuredAt, from),
        lte(measurement.measuredAt, to),
      ),
    )
    .orderBy(asc(measurement.measuredAt));

  const byMetric = new Map<string, ReadingRow[]>();
  for (const row of rows) {
    if (row.value === null) continue;
    const held = byMetric.get(row.metric) ?? [];
    held.push(row as ReadingRow);
    byMetric.set(row.metric, held);
  }
  const out = new Map<string, Reading[]>();
  for (const metric of metrics) out.set(metric, heads(byMetric.get(metric) ?? []));
  return out;
}

/** The last reading of one metric, whenever it was, corrections applied. */
export async function readLastReading(metric: string): Promise<Reading | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: measurement.id,
      value: measurement.value,
      measuredAt: measurement.measuredAt,
      origin: sourceRecord.source,
      seed: measurement.seed,
      rootId: measurement.rootId,
      correctionIndex: measurement.correctionIndex,
    })
    .from(measurement)
    .innerJoin(sourceRecord, eq(sourceRecord.id, measurement.sourceRecordId))
    .where(eq(measurement.metric, metric))
    .orderBy(sql`${measurement.measuredAt} desc`)
    .limit(24);
  const usable = rows.filter((row): row is ReadingRow & { value: number } => row.value !== null);
  return heads(usable).at(-1) ?? null;
}

/**
 * The two sources that sync on their own, and therefore the two that can go
 * silent without anybody pressing anything.
 *
 * Manual entry and a laboratory PDF are not on this list on purpose. A tape
 * measure that has not been used for four days is a thing the owner knows about
 * and a warning about it would be nagging; a scale that stopped talking four
 * days ago is the failure the operator said he only ever notices late.
 */
export const SYNCING_SOURCES = ['withings', 'apple_health_shortcut'] as const;

export type SourceFreshness = Freshness & {
  /** The integration's own state, when there is a credential row for it. */
  state: string | null;
  lastError: string | null;
};

/**
 * How old each syncing source's newest sample is.
 *
 * The age is measured against the later of two facts: the newest sample stored
 * from that source, and the integration's own last successful sync. A sync that
 * returned nothing new is still a sync, and a sample that landed is still proof
 * the source is alive, so the fresher of the two is the truth. Both are read
 * back out of the database rather than remembered in the process, because a
 * restart must not make a dead source look alive.
 */
export async function readFreshness(now: Date): Promise<SourceFreshness[]> {
  const db = getDb();
  const samples = await db
    .select({ origin: sourceRecord.source, last: sql<string | null>`max(${measurement.measuredAt})` })
    .from(measurement)
    .innerJoin(sourceRecord, eq(sourceRecord.id, measurement.sourceRecordId))
    .groupBy(sourceRecord.source);
  const credentials = await db.select().from(integrationCredential);

  const lastSample = new Map(
    samples.map((row) => [row.origin, row.last ? new Date(row.last) : null] as const),
  );
  // The credential table names the provider; the provenance spine names the
  // source. One is `apple_health` and the other `apple_health_shortcut`, and
  // they are the same integration.
  const providerOf: Record<string, string> = {
    withings: 'withings',
    apple_health_shortcut: 'apple_health',
  };

  return SYNCING_SOURCES.map((source) => {
    const credential = credentials.find((row) => row.provider === providerOf[source]);
    const candidates = [lastSample.get(source) ?? null, credential?.lastSuccessfulSyncAt ?? null].filter(
      (date): date is Date => date instanceof Date,
    );
    const lastAt = candidates.length === 0 ? null : new Date(Math.max(...candidates.map((d) => d.getTime())));
    return {
      ...freshnessOf(source, lastAt, now),
      state: credential?.state ?? null,
      lastError: credential?.lastError ?? null,
    };
  });
}
