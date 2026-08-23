import { createHash } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from './client';
import { importQuestion, integrationCredential, measurement, sourceRecord, withingsConnection } from './schema';
import { renderDedupReason } from './measurements';
import { openSecret, sealSecret } from '@/lib/master-key';
import { type Confidence, type Source, IMPORT_VERSION, whatStands } from '@/lib/provenance';
import { strings } from '@/lib/strings';
import type { TokenBundle } from '@/lib/withings/client';
import { type HarvestedRow, METRIC_OF_TYPE, isAllowedType } from '@/lib/withings/codes';
import type {
  CommitReport,
  PreparedBatch,
  StandingOnDay,
  StoredForKey,
} from '@/lib/withings/import';
import { dayKeyFor } from '@/lib/withings/import';
import type { WithingsMode } from '@/lib/withings/mode';
import type { RotationWriter } from '@/lib/withings/rotation';

/**
 * The Withings storage layer, and the second place blood pressure is refused.
 *
 * WHAT THIS FILE IS FOR. Everything the adapter decided is written here, in one
 * transaction, and the type allowlist is checked again on the way in. The fetch
 * layer already drops a group carrying blood pressure whole; this refuses any
 * measure whose type is outside the eight even when the fetch layer is bypassed
 * entirely, because a rule enforced in one place is a rule one refactor away
 * from not being enforced at all.
 *
 * THE WRITER IS AN ARGUMENT, the way `src/db/idempotency.ts` makes its store an
 * argument. What decides whether a blood pressure measure can reach this
 * database is a guard and an ordering, and both are worth grading without
 * Postgres running.
 */

export const WITHINGS_PROVIDER = 'withings';
export const CONNECTION_ID = 'withings';

/** The scope this product asks for, stored so the settings screen can print it. */
export const WITHINGS_SCOPE = 'user.metrics';

/**
 * The refresh token lives a year, and this is how long before the end of it the
 * status screen starts saying so. Thirty days is long enough that the owner
 * meets it on a Sunday rather than on the morning his trend stops moving.
 */
export const REFRESH_TOKEN_LIFE_DAYS = 365;
export const EXPIRING_WITHIN_DAYS = 30;

export type WithingsState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'expiring'
  | 'revoked'
  | 'demo';

/** Why the last attempt did not work. A token, and `src/lib/display.ts` finds the words. */
export type WithingsCause = keyof typeof strings.withings.causes;

export type ConnectionRow = typeof withingsConnection.$inferSelect;

/**
 * A deterministic identifier, uuid shaped, derived from what it names.
 *
 * An import has no client UUID to key a row by, and a random one would make
 * re-running the same import write a second row that only the unique index
 * would catch. Hashing the external key gives the same row the same id for
 * ever, on this machine and on a restored backup, and it reads on a screen
 * exactly like every other id in this database rather than like a scheme
 * somebody invented for one integration.
 */
export function deterministicId(namespace: string, key: string): string {
  const digest = createHash('sha256').update(`${namespace}:${key}`).digest('hex');
  const variant = ((parseInt(digest.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    `${variant}${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join('-');
}

/**
 * The storage layer's own blood pressure refusal, and its type allowlist.
 *
 * It refuses on the type rather than on the group, because by the time a row
 * reaches here the group is gone: what arrives is a measure, and the only thing
 * that can be asked of it is whether this product ever asked for its type. The
 * eight it did ask for are the seven a Body Smart publishes plus fat ratio.
 * Systolic, diastolic, temperature, pulse wave velocity, every ECG interval and
 * every code Withings adds after today are all outside it, and outside it is
 * refused rather than ignored.
 */
export function storageAllowsType(type: number): boolean {
  return isAllowedType(type) && Object.hasOwn(METRIC_OF_TYPE, type);
}

export type MeasurementInsert = {
  id: string;
  metric: string;
  rawValue: string;
  rawUnit: string;
  value: number;
  unit: string;
  timeZone: string;
  source: Source;
  measuredAt: Date;
  confidence: Confidence;
  dedupDecision: 'unique' | 'kept_over_duplicate' | 'correction';
  dedupReason: string;
  sourceRecordId: string;
  externalKey: string;
  externalModified: number;
  rootId: string;
  correctsId: string | null;
  correctionIndex: number;
  correctionReason: string | null;
};

export type QuestionInsert = {
  id: string;
  metric: string;
  measurementId: string;
  storedRawValue: string;
  storedUnit: string;
  storedSource: string;
  storedMeasuredAt: Date;
  incomingRawValue: string;
  incomingUnit: string;
  incomingSource: string;
  incomingMeasuredAt: Date;
};

export type SourceRecordInsert = {
  id: string;
  source: Source;
  reference: string;
  occurredAt: Date;
  detail: Array<{ key: string; value: string }>;
  seed: boolean;
};

export type BatchWriter = {
  writeSourceRecord(input: SourceRecordInsert): Promise<void>;
  insertMeasurement(row: MeasurementInsert): Promise<'inserted' | 'conflicted'>;
  raiseQuestion(question: QuestionInsert): Promise<'raised' | 'exists'>;
};

/** Opens one transaction, hands the writer bound to it, commits or rolls back. */
export type BatchSession = <T>(work: (writer: BatchWriter) => Promise<T>) => Promise<T>;

export type BatchContext = {
  mode: WithingsMode;
  /** `demo` in demonstration mode, `withings` when the real scale is connected. */
  source: Source;
  timeZone: string;
};

/**
 * Everything one import decided, written in one transaction.
 *
 * The type guard runs first and outside the session, so a measure this product
 * never asked for cannot be inside an open transaction at all. Then the source
 * record, then every row. Nothing here updates a measurement: the table refuses
 * UPDATE and a revision is an INSERT that names what it corrects.
 */
export async function commitBatch(
  session: BatchSession,
  batch: PreparedBatch,
  context: BatchContext,
): Promise<CommitReport> {
  const seed = context.source === 'demo';
  const allowed = batch.rows.filter((entry) => storageAllowsType(entry.row.type));
  const refused = batch.rows.length - allowed.length;

  const report: CommitReport = {
    stored: 0,
    revised: 0,
    duplicates: 0,
    questions: 0,
    refused,
    storedIds: [],
    questionIds: [],
  };

  const record: SourceRecordInsert = {
    id: `src_${deterministicId(context.source, batch.batchId)}`,
    // The shape this record stands in for is always the Withings sync batch,
    // even in demonstration mode. The measurement's source says where the value
    // entered this database; the record says what kind of origin it stands for,
    // and `seed` is the column that tells the two apart by reading the table.
    source: 'withings',
    reference: String(batch.to ?? 0),
    occurredAt: batch.occurredAt,
    detail: batchDetail(batch, context, refused),
    seed,
  };

  await session(async (writer) => {
    await writer.writeSourceRecord(record);

    for (const entry of allowed) {
      const { row, decision } = entry;
      const confidence: Confidence = seed
        ? 'demo'
        : row.attribution === 'device'
          ? 'measured_device'
          : 'measured_manual';

      if (decision.kind === 'duplicate') {
        report.duplicates += 1;
        continue;
      }

      if (decision.kind === 'question') {
        const questionId = `q_${deterministicId(context.source, `${row.externalKey}@${row.modified}`)}`;
        const raised = await writer.raiseQuestion({
          id: questionId,
          metric: row.metric,
          measurementId: decision.measurementId,
          storedRawValue: decision.storedRawValue,
          storedUnit: row.unit,
          storedSource: decision.storedSource,
          storedMeasuredAt: row.measuredAt,
          incomingRawValue: row.rawText,
          incomingUnit: row.unit,
          incomingSource: context.source,
          incomingMeasuredAt: row.measuredAt,
        });
        if (raised === 'raised') {
          report.questions += 1;
          report.questionIds.push(questionId);
        }
        continue;
      }

      if (decision.kind === 'insert') {
        const id = deterministicId(context.source, row.externalKey);
        const outcome = await writer.insertMeasurement({
          id,
          metric: row.metric,
          rawValue: row.rawText,
          rawUnit: row.unit,
          value: row.value,
          unit: row.unit,
          timeZone: context.timeZone,
          source: context.source,
          measuredAt: row.measuredAt,
          confidence,
          dedupDecision: 'unique',
          dedupReason: renderDedupReason({
            key: 'importedFirst',
            params: { source: sourceWord(context), key: row.externalKey },
          }),
          sourceRecordId: record.id,
          externalKey: row.externalKey,
          externalModified: row.modified,
          rootId: id,
          correctsId: null,
          correctionIndex: 0,
          correctionReason: null,
        });
        if (outcome === 'inserted') {
          report.stored += 1;
          report.storedIds.push(id);
        } else {
          report.duplicates += 1;
        }
        continue;
      }

      // A revision. The key carries the modification instant that produced it,
      // so the same revised group arriving twice conflicts and does nothing,
      // and the original keeps its own key and its own row for ever.
      const revisionKey = `${row.externalKey}@${row.modified}`;
      const id = deterministicId(context.source, revisionKey);
      const outcome = await writer.insertMeasurement({
        id,
        metric: row.metric,
        rawValue: row.rawText,
        rawUnit: row.unit,
        value: row.value,
        unit: row.unit,
        timeZone: context.timeZone,
        source: context.source,
        measuredAt: row.measuredAt,
        confidence,
        dedupDecision: 'correction',
        dedupReason: renderDedupReason({
          key: 'importRevised',
          params: { source: sourceWord(context), from: decision.from, to: row.rawText },
        }),
        sourceRecordId: record.id,
        externalKey: revisionKey,
        externalModified: row.modified,
        rootId: decision.rootId,
        correctsId: decision.correctsId,
        correctionIndex: decision.index,
        correctionReason: strings.provenance.revisedByImport(sourceWord(context)),
      });
      if (outcome === 'inserted') {
        report.revised += 1;
        report.storedIds.push(id);
      } else {
        report.duplicates += 1;
      }
    }
  });

  return report;
}

function sourceWord(context: BatchContext): string {
  return context.source === 'demo'
    ? strings.provenance.sources.demo
    : strings.provenance.sources.withings;
}

/** What the source screen shows about one batch. Values are data or catalogue copy. */
function batchDetail(
  batch: PreparedBatch,
  context: BatchContext,
  refused: number,
): Array<{ key: string; value: string }> {
  const bloodPressure = batch.droppedGroups.filter((group) => group.dropped === 'blood_pressure');
  return [
    {
      key: 'source.field.mode',
      value: context.mode === 'demo' ? strings.withings.modeDemo : strings.withings.modeLive,
    },
    { key: 'source.field.endpoint', value: strings.demoSeed.field.endpoint },
    { key: 'source.field.typeFilter', value: batch.requests.at(-1)?.form.meastypes ?? '' },
    { key: 'source.field.category', value: batch.requests.at(-1)?.form.category ?? '' },
    { key: 'source.field.cursorFrom', value: String(batch.from ?? 0) },
    { key: 'source.field.cursorTo', value: String(batch.to ?? 0) },
    { key: 'source.field.pages', value: String(batch.pages) },
    { key: 'source.field.groupsReceived', value: String(batch.groupsSeen) },
    { key: 'source.field.rowsReceived', value: String(batch.measuresSeen) },
    { key: 'source.field.groupsDropped', value: String(batch.droppedGroups.length) },
    { key: 'source.field.bloodPressureDropped', value: String(bloodPressure.length) },
    { key: 'source.field.refusedByStorage', value: String(refused) },
    { key: 'source.field.envelopeStatus', value: String(batch.requests.at(-1)?.envelopeStatus ?? 0) },
  ];
}

/**
 * The real writer, bound to one drizzle transaction.
 *
 * `onConflictDoNothing` and never `onConflictDoUpdate`. The append-only trigger
 * fires on both, so an upsert would raise `restrict_violation` rather than
 * quietly overwriting: it is not that the upsert is discouraged, it is that it
 * cannot execute. `.forge/AMENDMENTS.md` A1 records the ruling.
 */
export function postgresBatchSession(): BatchSession {
  const db = getDb();
  return (work) =>
    db.transaction(async (tx) =>
      work({
        async writeSourceRecord(input) {
          await tx
            .insert(sourceRecord)
            .values({
              id: input.id,
              source: input.source,
              kind: 'sync_batch',
              reference: input.reference,
              occurredAt: input.occurredAt,
              importVersion: IMPORT_VERSION,
              detail: input.detail,
              seed: input.seed,
            })
            .onConflictDoNothing({ target: sourceRecord.id });
        },
        async insertMeasurement(row) {
          const written = await tx
            .insert(measurement)
            .values({
              id: row.id,
              metric: row.metric,
              rawValue: row.rawValue,
              rawUnit: row.rawUnit,
              value: row.value,
              unit: row.unit,
              conversionFactor: null,
              timeZone: row.timeZone,
              source: row.source,
              measuredAt: row.measuredAt,
              confidence: row.confidence,
              importVersion: IMPORT_VERSION,
              dedupDecision: row.dedupDecision,
              dedupReason: row.dedupReason,
              sourceRecordId: row.sourceRecordId,
              externalKey: row.externalKey,
              externalModified: row.externalModified,
              rootId: row.rootId,
              correctsId: row.correctsId,
              correctionIndex: row.correctionIndex,
              correctionReason: row.correctionReason,
            })
            .onConflictDoNothing({ target: [measurement.source, measurement.externalKey] })
            .returning({ id: measurement.id });
          return written.length > 0 ? 'inserted' : 'conflicted';
        },
        async raiseQuestion(question) {
          const written = await tx
            .insert(importQuestion)
            .values({
              id: question.id,
              metric: question.metric,
              measurementId: question.measurementId,
              storedRawValue: question.storedRawValue,
              storedUnit: question.storedUnit,
              storedSource: question.storedSource,
              storedMeasuredAt: question.storedMeasuredAt,
              incomingRawValue: question.incomingRawValue,
              incomingUnit: question.incomingUnit,
              incomingSource: question.incomingSource,
              incomingMeasuredAt: question.incomingMeasuredAt,
              incomingImportVersion: IMPORT_VERSION,
            })
            .onConflictDoNothing({ target: importQuestion.id })
            .returning({ id: importQuestion.id });
          return written.length > 0 ? 'raised' : 'exists';
        },
      }),
    );
}

/**
 * What this database already holds for a set of external keys, chain and all.
 *
 * Two round trips rather than one join, because the second one has to walk the
 * whole chain of every match: the row that stands today is the highest
 * correction index, and a revision from an earlier import is a perfectly
 * ordinary member of that chain.
 */
export async function lookupExternalKeys(
  source: Source,
  keys: string[],
): Promise<Map<string, StoredForKey>> {
  const found = new Map<string, StoredForKey>();
  if (keys.length === 0) return found;
  const db = getDb();

  const originals = await db
    .select()
    .from(measurement)
    .where(and(eq(measurement.source, source), inArray(measurement.externalKey, keys)));
  if (originals.length === 0) return found;

  const rootIds = [...new Set(originals.map((row) => row.rootId))];
  const chains = await db.select().from(measurement).where(inArray(measurement.rootId, rootIds));

  for (const original of originals) {
    const chain = chains.filter((row) => row.rootId === original.rootId);
    const head = chain.reduce((highest, row) =>
      row.correctionIndex > highest.correctionIndex ? row : highest,
    );
    const modifieds = chain
      .map((row) => row.externalModified)
      .filter((value): value is number => typeof value === 'number');
    found.set(original.externalKey!, {
      originalId: original.id,
      rootId: original.rootId,
      headId: head.id,
      headRawValue: head.rawValue,
      headSource: head.source,
      headCorrectionIndex: head.correctionIndex,
      storedModified: modifieds.length > 0 ? Math.max(...modifieds) : null,
    });
  }
  return found;
}

/**
 * What already stands for each metric on each day this answer touches.
 *
 * The demonstration seed writes a Withings-shaped weight every morning, and so
 * does the demonstration account this slice connects. One reading per metric
 * per day is the rule this product has had since slice 3, and an importer does
 * not get an exemption from it: without this the chart would carry two points a
 * day for six weeks and its seven-day average would be computed over fourteen.
 *
 * Chain heads only, and every source rather than this one: what the decision
 * needs to know is what a person reading the chart would see for that day.
 *
 * WHICH HEAD, when a day already holds more than one, is `compareStanding` and
 * not the order the rows came back in. It was `if (!found.has(key))`, so the
 * incumbent this import measured itself against was whichever row Postgres
 * returned first, and on a collision day that is a coin toss between the seeded
 * reading and the measured one. "What a person reading the chart would see" is
 * a question the chart now answers with one comparator, so this asks the same
 * one. `.forge/AMENDMENTS.md` A7.
 */
export async function standingOnDays(
  rows: HarvestedRow[],
  timeZone: string,
): Promise<Map<string, StandingOnDay>> {
  const found = new Map<string, StandingOnDay>();
  if (rows.length === 0) return found;
  const db = getDb();

  const metrics = [...new Set(rows.map((row) => row.metric))];
  const times = rows.map((row) => row.measuredAt.getTime());
  // A day either side, so a reading taken at 23:50 in a zone ahead of UTC still
  // lands inside its own calendar day.
  const from = new Date(Math.min(...times) - 86_400_000);
  const to = new Date(Math.max(...times) + 86_400_000);

  const held = await db
    .select()
    .from(measurement)
    .where(
      and(
        inArray(measurement.metric, metrics),
        sql`${measurement.measuredAt} >= ${from.toISOString()}`,
        sql`${measurement.measuredAt} <= ${to.toISOString()}`,
      ),
    );

  const heads = new Map<string, (typeof held)[number]>();
  for (const row of held) {
    const standing = heads.get(row.rootId);
    if (!standing || row.correctionIndex > standing.correctionIndex) heads.set(row.rootId, row);
  }
  const perDay = new Map<string, (typeof held)[number][]>();
  for (const row of heads.values()) {
    const key = dayKeyFor(row.metric, row.measuredAt, timeZone);
    perDay.set(key, [...(perDay.get(key) ?? []), row]);
  }
  for (const [key, rows] of perDay) {
    const row = whatStands(rows, timeZone)!;
    found.set(key, { id: row.id, source: row.source, rawValue: row.rawValue });
  }
  return found;
}

/** How many rows this source has ever landed. The status card prints it. */
export async function countStoredRows(source: Source): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(measurement)
    .where(eq(measurement.source, source));
  return row?.n ?? 0;
}

// --------------------------------------------------------------------------
// The connection row.

export async function readConnection(): Promise<ConnectionRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(withingsConnection)
    .where(eq(withingsConnection.id, CONNECTION_ID));
  return row ?? null;
}

export async function ensureConnection(mode: WithingsMode): Promise<ConnectionRow> {
  const db = getDb();
  await db
    .insert(withingsConnection)
    .values({ id: CONNECTION_ID, mode, state: 'disconnected' })
    .onConflictDoNothing({ target: withingsConnection.id });
  const row = await readConnection();
  if (row && row.mode !== mode) {
    await db
      .update(withingsConnection)
      .set({ mode, updatedAt: new Date() })
      .where(eq(withingsConnection.id, CONNECTION_ID));
    return { ...row, mode };
  }
  return row!;
}

export async function updateConnection(patch: Partial<ConnectionRow>): Promise<void> {
  const db = getDb();
  await db
    .update(withingsConnection)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(withingsConnection.id, CONNECTION_ID));
}

/** The cursor, and it is the LAST thing an import writes. */
export async function advanceCursor(to: number): Promise<void> {
  await updateConnection({ cursor: to });
}

export async function recordFailure(cause: WithingsCause, status: number | null): Promise<void> {
  const db = getDb();
  await db
    .update(withingsConnection)
    .set({ lastFailureKind: cause, lastFailureStatus: status, updatedAt: new Date() })
    .where(eq(withingsConnection.id, CONNECTION_ID));
  await db
    .update(integrationCredential)
    .set({ lastError: cause, updatedAt: new Date() })
    .where(eq(integrationCredential.provider, WITHINGS_PROVIDER));
}

// --------------------------------------------------------------------------
// The token bundle, sealed, and the rotation that writes it.

export async function readTokens(): Promise<TokenBundle | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(integrationCredential)
    .where(eq(integrationCredential.provider, WITHINGS_PROVIDER));
  if (!row || !row.secretCiphertext || !row.secretNonce || !row.secretTag) return null;
  const plain = openSecret(
    {
      ciphertext: row.secretCiphertext,
      nonce: row.secretNonce,
      tag: row.secretTag,
      keyFingerprint: row.keyFingerprint ?? '',
    },
    WITHINGS_PROVIDER,
  );
  try {
    return JSON.parse(plain) as TokenBundle;
  } catch {
    return null;
  }
}

/**
 * The two writes that carry a refresh, in one transaction.
 *
 * The sealed bundle lands in `integration_credential` and the expiry and the
 * rotation instant land in `withings_connection`, and either both commit or
 * neither does. A crash between them would leave an installation whose access
 * token works for three hours and whose refresh token can never be used again,
 * and the Public API has no way back from that short of the owner consenting by
 * hand.
 */
export function postgresRotationSession(): <T>(
  work: (writer: RotationWriter) => Promise<T>,
) => Promise<T> {
  const db = getDb();
  return (work) =>
    db.transaction(async (tx) =>
      work({
        async writeTokens(next) {
          const sealed = sealSecret(JSON.stringify(next), WITHINGS_PROVIDER);
          const values = {
            provider: WITHINGS_PROVIDER,
            state: 'connected',
            scope: next.scope || WITHINGS_SCOPE,
            secretCiphertext: sealed.ciphertext,
            secretNonce: sealed.nonce,
            secretTag: sealed.tag,
            keyFingerprint: sealed.keyFingerprint,
            lastError: null,
            updatedAt: new Date(),
          };
          await tx
            .insert(integrationCredential)
            .values(values)
            .onConflictDoUpdate({ target: integrationCredential.provider, set: values });
        },
        async writeConnection(next) {
          await tx
            .update(withingsConnection)
            .set({
              accessExpiresAt: new Date(next.expiresAt),
              refreshRotatedAt: next.rotatedAt,
              state: next.state,
              lastFailureKind: null,
              lastFailureStatus: null,
              updatedAt: new Date(),
            })
            .where(eq(withingsConnection.id, CONNECTION_ID));
        },
      }),
    );
}

/** Forget the credential, keep every reading it ever imported. */
export async function forgetConnection(): Promise<void> {
  const db = getDb();
  await db.delete(integrationCredential).where(eq(integrationCredential.provider, WITHINGS_PROVIDER));
  await db
    .update(withingsConnection)
    .set({
      state: 'disconnected',
      accessExpiresAt: null,
      refreshRotatedAt: null,
      authStateHash: null,
      authStateIssuedAt: null,
      lastFailureKind: null,
      lastFailureStatus: null,
      updatedAt: new Date(),
    })
    .where(eq(withingsConnection.id, CONNECTION_ID));
}

// --------------------------------------------------------------------------
// The status the settings screen renders. No token, no secret, no account id.

/**
 * Exactly what screen 12 is allowed to know about this connection.
 *
 * Everything on it is a state, a count or an instant. There is no field here
 * that could hold a token, a client secret or the Withings account identifier,
 * which is a stronger guarantee than remembering not to render one: the account
 * id is not even in a column, it is inside the sealed bundle.
 */
export type WithingsView = {
  mode: WithingsMode;
  state: WithingsState;
  configured: boolean;
  scope: string;
  lastSuccessfulSyncAt: string | null;
  lastSyncStartedAt: string | null;
  connectedAt: string | null;
  cursorAt: string | null;
  refreshExpiresAt: string | null;
  rowsStored: number;
  rowsSeen: number;
  groupsDropped: number;
  questionsRaised: number;
  storedRows: number;
  lastBatchId: string | null;
  cause: WithingsCause | null;
};

/**
 * `expiring` is derived rather than stored, because it is a fact about the
 * clock and not about anything that happened.
 *
 * The refresh token lives a year and rotates on every use, so an installation
 * that syncs weekly never approaches the end of one. An installation whose
 * owner turned the Mac mini off for eleven months does, and this is the month
 * of warning he gets before the only way back is consenting again by hand.
 */
export function stateOf(row: ConnectionRow | null, mode: WithingsMode, now: Date): WithingsState {
  if (!row) return 'disconnected';
  if (row.state === 'disconnected' || row.state === 'connecting' || row.state === 'revoked') {
    return row.state;
  }
  if (mode === 'demo') return 'demo';
  if (row.refreshRotatedAt) {
    const endsAt = row.refreshRotatedAt.getTime() + REFRESH_TOKEN_LIFE_DAYS * 86_400_000;
    if (endsAt - now.getTime() <= EXPIRING_WITHIN_DAYS * 86_400_000) return 'expiring';
  }
  return 'connected';
}

export function refreshExpiryOf(row: ConnectionRow | null): Date | null {
  if (!row?.refreshRotatedAt) return null;
  return new Date(row.refreshRotatedAt.getTime() + REFRESH_TOKEN_LIFE_DAYS * 86_400_000);
}

export async function describeWithings(
  mode: WithingsMode,
  configured: boolean,
  now: Date,
): Promise<WithingsView> {
  const row = await readConnection();
  const source: Source = mode === 'demo' ? 'demo' : 'withings';
  const storedRows = await countStoredRows(source);
  const refreshExpiresAt = refreshExpiryOf(row);
  return {
    mode,
    state: stateOf(row, mode, now),
    configured,
    scope: WITHINGS_SCOPE,
    lastSuccessfulSyncAt: row?.lastSuccessfulSyncAt?.toISOString() ?? null,
    lastSyncStartedAt: row?.lastSyncStartedAt?.toISOString() ?? null,
    connectedAt: row?.connectedAt?.toISOString() ?? null,
    cursorAt: row?.cursor ? new Date(row.cursor * 1000).toISOString() : null,
    refreshExpiresAt: refreshExpiresAt?.toISOString() ?? null,
    rowsStored: row?.rowsStored ?? 0,
    rowsSeen: row?.rowsSeen ?? 0,
    groupsDropped: row?.groupsDropped ?? 0,
    questionsRaised: row?.questionsRaised ?? 0,
    storedRows,
    lastBatchId: row?.lastBatchId ?? null,
    cause: (row?.lastFailureKind as WithingsCause | null) ?? null,
  };
}
