import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { getDb } from './client';
import { markIntegrationSynced, readIntegrationSecret, storeIntegrationSecret } from './integrations';
import { healthSample, ingestBatch, ingestCredential, ingestNonce } from './schema';

/**
 * Everything the ingest endpoint keeps: the credential the phone presents, the
 * nonces it has already spent, the arrivals it has answered, and the samples it
 * accepted.
 *
 * The rules are next door in `src/lib/health-ingest.ts` and they are pure. This
 * file is the only place any of them touches Postgres, so a test that wants to
 * grade a rule does not need a container to do it.
 */

/** What the credential is called when the owner has not named it. */
export const DEFAULT_KEY_ID = 'k1';

/** The provider row that carries the signing secret and the last successful sync. */
export const INGEST_PROVIDER = 'apple_health';

export const INGEST_SCOPE = 'ingest.write';

export type IngestCredentialRow = typeof ingestCredential.$inferSelect;

/**
 * A minted credential, and the only moment either half is legible.
 *
 * The caller shows both to the owner once and then forgets them. The token is
 * hashed on the way into the database and the secret is sealed with the master
 * key, so nothing that runs later can print either back.
 */
export type MintedCredential = { keyId: string; token: string; secret: string };

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * 32 bytes, base64url. The same width and the same alphabet as a session token,
 * because there is no reason for two of this app's secrets to be different
 * shapes and every reason for the one a person copies to be one line.
 */
function mintSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** The live credential, or nothing. At most one exists: a partial unique index says so. */
export async function readLiveCredential(): Promise<IngestCredentialRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(ingestCredential)
    .where(isNull(ingestCredential.revokedAt))
    .limit(1);
  return row ?? null;
}

/** Every credential this installation has ever had, newest first. */
export async function readCredentialHistory(): Promise<IngestCredentialRow[]> {
  const db = getDb();
  return db.select().from(ingestCredential).orderBy(desc(ingestCredential.createdAt));
}

/**
 * A new token and a new signing secret, with whatever came before revoked in
 * the same call.
 *
 * Revoke first, then insert. The other order trips the partial unique index
 * that keeps exactly one credential live, which is the index doing its job:
 * two live tokens and the owner has no way to know which one his phone holds.
 *
 * The signing secret goes to `integration_credential` under `apple_health`,
 * sealed with the master key, because the server has to recompute a digest from
 * it on every request and F54 has to print the digest it computes. That is also
 * what puts Apple Health on the integrations list as connected, with a last
 * successful sync that moves when a batch lands.
 */
export async function mintIngestCredential(input: {
  keyId?: string;
  label: string;
}): Promise<MintedCredential> {
  const db = getDb();
  const keyId = (input.keyId ?? DEFAULT_KEY_ID).trim() || DEFAULT_KEY_ID;
  const token = mintSecret();
  const secret = mintSecret();

  await db
    .update(ingestCredential)
    .set({ revokedAt: new Date() })
    .where(isNull(ingestCredential.revokedAt));

  await db
    .insert(ingestCredential)
    .values({ keyId, tokenHash: hashToken(token), label: input.label })
    .onConflictDoUpdate({
      target: ingestCredential.keyId,
      set: { tokenHash: hashToken(token), label: input.label, revokedAt: null, lastUsedAt: null },
    });

  await storeIntegrationSecret({ provider: INGEST_PROVIDER, secret, scope: INGEST_SCOPE });

  return { keyId, token, secret };
}

/**
 * Revoke the live credential, and take the signing secret with it.
 *
 * Both halves go, because half a credential is a machine that answers every
 * batch with a digest failure and tells the owner his secret is wrong when what
 * actually happened is that he revoked it. The row stays, carrying the time it
 * stopped.
 */
export async function revokeIngestCredential(): Promise<boolean> {
  const db = getDb();
  const revoked = await db
    .update(ingestCredential)
    .set({ revokedAt: new Date() })
    .where(isNull(ingestCredential.revokedAt))
    .returning();
  if (revoked.length === 0) return false;
  await db.execute(
    sql`update integration_credential
        set state = 'disconnected', secret_ciphertext = null, secret_nonce = null,
            secret_tag = null, key_fingerprint = null, updated_at = now()
        where provider = ${INGEST_PROVIDER}`,
  );
  return true;
}

export type TokenVerdict =
  | { ok: true; credential: IngestCredentialRow }
  | { ok: false; reason: 'no_credential' | 'no_token' | 'refused' };

/**
 * Is this bearer token the live ingest token.
 *
 * Constant time, and length safe: `timingSafeEqual` throws on a length mismatch
 * and an exception is itself a signal, so the widths are compared first. Same
 * shape as `tokensMatch` in src/lib/tokens.ts, which is the precedent.
 *
 * A revoked credential is not live, so it never reaches the comparison and the
 * next request after a revocation is refused. That is F52's second half and it
 * costs one predicate.
 */
export async function verifyIngestToken(token: string | null): Promise<TokenVerdict> {
  const credential = await readLiveCredential();
  if (!credential) return { ok: false, reason: 'no_credential' };
  if (!token || token.trim() === '') return { ok: false, reason: 'no_token' };
  const left = Buffer.from(hashToken(token.trim()), 'utf8');
  const right = Buffer.from(credential.tokenHash, 'utf8');
  if (left.length !== right.length) return { ok: false, reason: 'refused' };
  if (!timingSafeEqual(left, right)) return { ok: false, reason: 'refused' };
  return { ok: true, credential };
}

/** The signing secret in the clear, for the length of one digest computation. */
export async function readSigningSecret(): Promise<string | null> {
  return readIntegrationSecret(INGEST_PROVIDER);
}

export async function touchCredential(keyId: string): Promise<void> {
  const db = getDb();
  await db
    .update(ingestCredential)
    .set({ lastUsedAt: new Date() })
    .where(eq(ingestCredential.keyId, keyId));
}

// ---------------------------------------------------------------------------
// Nonces.

/**
 * Take this nonce, or report that somebody already did.
 *
 * The claim is the insert. Two arrivals of the same nonce race into the same
 * unique index and exactly one of them wins, which is a property of the index
 * and not of the order the handler happens to run in. A read-then-write would
 * let both through under load, and under load is exactly when a shortcut fires
 * twice.
 */
export async function claimNonce(nonce: string, expiresAt: Date): Promise<boolean> {
  const db = getDb();
  const claimed = await db
    .insert(ingestNonce)
    .values({ id: crypto.randomUUID(), nonce, expiresAt })
    .onConflictDoNothing({ target: ingestNonce.nonce })
    .returning();
  return claimed.length > 0;
}

/** Nonces older than their 24 hours, swept on arrival so nothing has to schedule it. */
export async function sweepNonces(now: Date): Promise<number> {
  const db = getDb();
  const gone = await db.delete(ingestNonce).where(lt(ingestNonce.expiresAt, now)).returning();
  return gone.length;
}

// ---------------------------------------------------------------------------
// Arrivals.

export type BatchRow = typeof ingestBatch.$inferSelect;

export type BatchInput = {
  id: string;
  keyId: string;
  device: string;
  nonce: string;
  windowStart: Date | null;
  windowEnd: Date | null;
  generatedAt: Date | null;
  outcome: string;
  seriesCount?: number;
  rowsReceived?: number;
};

/** One row per arrival, whatever became of it. Written before any sample is. */
export async function recordBatch(input: BatchInput): Promise<void> {
  const db = getDb();
  await db.insert(ingestBatch).values({
    id: input.id,
    keyId: input.keyId,
    device: input.device,
    nonce: input.nonce,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    generatedAt: input.generatedAt,
    outcome: input.outcome,
    seriesCount: input.seriesCount ?? 0,
    rowsReceived: input.rowsReceived ?? 0,
  });
}

export async function recordBatchCounts(
  id: string,
  counts: { rowsAccepted: number; rowsDuplicate: number; readingsStored: number },
): Promise<void> {
  const db = getDb();
  await db.update(ingestBatch).set(counts).where(eq(ingestBatch.id, id));
}

export type SampleInput = {
  batchId: string;
  metric: string;
  grouping: string;
  type: string;
  valueRaw: string;
  value: number | null;
  unit: string;
  startAt: Date;
  endAt: Date;
  offsetMinutes: number;
  sampleSource: string;
  dedupKey: string;
};

/**
 * Store the rows this batch carried, and count what was already here.
 *
 * `on conflict do nothing` against the unique index on the synthesised dedup
 * key is the whole of it. An overlapping 48-hour window costs one insert
 * attempt per row and stores nothing, so the shortcut can run three times a day
 * over the same two days, and a nervous owner can run it ten times in a row,
 * and the row count does not move after the first.
 *
 * Chunked, because a 20,000-row batch in one statement is 20,000 parameters
 * times twelve columns, which is past what the protocol carries.
 */
export async function storeSamples(
  rows: SampleInput[],
): Promise<{ accepted: number; duplicates: number }> {
  if (rows.length === 0) return { accepted: 0, duplicates: 0 };
  const db = getDb();
  const CHUNK = 500;
  let accepted = 0;
  for (let at = 0; at < rows.length; at += CHUNK) {
    const chunk = rows.slice(at, at + CHUNK).map((row) => ({
      id: crypto.randomUUID(),
      batchId: row.batchId,
      origin: 'apple_health_shortcut',
      metric: row.metric,
      grouping: row.grouping,
      type: row.type,
      valueRaw: row.valueRaw,
      value: row.value,
      unit: row.unit,
      startAt: row.startAt,
      endAt: row.endAt,
      offsetMinutes: row.offsetMinutes,
      sampleSource: row.sampleSource,
      dedupKey: row.dedupKey,
    }));
    const stored = await db
      .insert(healthSample)
      .values(chunk)
      .onConflictDoNothing({ target: healthSample.dedupKey })
      .returning({ id: healthSample.id });
    accepted += stored.length;
  }
  return { accepted, duplicates: rows.length - accepted };
}

/** How many samples this installation holds, which is the number F47 watches. */
export async function countSamples(): Promise<number> {
  const db = getDb();
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(healthSample);
  return Number(row?.n ?? 0);
}

/** The last batch this machine accepted, which is what Today shows and F55 reads. */
export async function readLastAcceptedBatch(): Promise<BatchRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(ingestBatch)
    .where(eq(ingestBatch.outcome, 'accepted'))
    .orderBy(desc(ingestBatch.receivedAt))
    .limit(1);
  return row ?? null;
}

/** The recent arrivals, refusals included, for the diagnostics screen. */
export async function readRecentBatches(limit = 8): Promise<BatchRow[]> {
  const db = getDb();
  return db.select().from(ingestBatch).orderBy(desc(ingestBatch.receivedAt)).limit(limit);
}

/**
 * Mark the integration as having synced, which is what the staleness
 * calculation on Today and Health already reads.
 *
 * Only on an accepted batch. A refused one proves the phone reached the machine
 * and nothing else, and moving the last-successful-sync time on a refusal would
 * be the app reporting a green light for a run that stored nothing.
 */
export async function markIngestSucceeded(at: Date): Promise<void> {
  await markIntegrationSynced(INGEST_PROVIDER, at);
}

/** Whether a batch already stored a given day and metric, keyed by the roll-up id. */
export async function readExistingRollupIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const db = getDb();
  const rows = await db.execute(
    sql`select id from measurement where id in (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )})`,
  );
  return new Set((rows.rows as Array<{ id: string }>).map((row) => row.id));
}

/** How many samples of each metric this installation holds, for the diagnostics screen. */
export async function readSampleCensus(): Promise<Array<{ metric: string; rows: number; newest: Date | null }>> {
  const db = getDb();
  const rows = await db
    .select({
      metric: healthSample.metric,
      rows: sql<number>`count(*)::int`,
      newest: sql<string | null>`max(${healthSample.startAt})`,
    })
    .from(healthSample)
    .groupBy(healthSample.metric)
    .orderBy(healthSample.metric);
  return rows.map((row) => ({
    metric: row.metric,
    rows: Number(row.rows),
    newest: row.newest ? new Date(row.newest) : null,
  }));
}

/** Kept beside the rest so a caller never reaches for two modules to answer one question. */
export async function readLiveAndSecret(): Promise<{
  credential: IngestCredentialRow | null;
  secret: string | null;
}> {
  const credential = await readLiveCredential();
  if (!credential) return { credential: null, secret: null };
  return { credential, secret: await readSigningSecret() };
}
