import { storeRollups } from '@/db/health-rollup';
import { once } from '@/db/idempotency';
import {
  claimNonce,
  markIngestSucceeded,
  readSigningSecret,
  recordBatch,
  recordBatchCounts,
  storeSamples,
  sweepNonces,
  touchCredential,
  verifyIngestToken,
} from '@/db/ingest';
import { getConfig } from '@/lib/config';
import { NO_STORE } from '@/lib/gate';
import {
  CAPS,
  type IncomingBatch,
  type IngestError,
  type IngestErrorCode,
  NONCE_TTL_HOURS,
  SKEW_SECONDS,
  canonicalString,
  digestMatches,
  expandBatch,
  parseBatch,
  readSampleTimestamp,
  readTimestamp,
  rollupDays,
  skewSeconds,
  twoPassDigest,
} from '@/lib/health-ingest';
import { shortDateTime } from '@/lib/format';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ingest/health. The one door Apple Health comes through.
 *
 * A PWA cannot read HealthKit and nothing will change that, so the owner builds
 * a shortcut on the iPhone and the shortcut posts here three times a day. This
 * endpoint answers a program with no eyes: `Get Contents of URL` has no status
 * output, so the Shortcut cannot tell 200 from 401 and the only thing it can do
 * is read one field out of the body and put it in a notification.
 *
 * EVERY ANSWER CARRIES A MESSAGE. That is not a nicety and it is not
 * decoration: it is the entire feedback channel between this machine and the
 * person holding the phone, and a response without one is indistinguishable
 * from the shortcut never having run.
 *
 * THE ORDER OF THE CHECKS IS THE DESIGN.
 *
 *   1. Size, before anything is parsed.
 *   2. The bearer token, before the body is even read as JSON. An
 *      unauthenticated caller learns nothing about what this endpoint accepts.
 *   3. The envelope, because the digest is recomputed from parsed fields and
 *      there is nothing to recompute from until it parses.
 *   4. Idempotency, keyed by the header or by the nonce, wrapping everything
 *      with a side effect. A repeat gets the first answer back verbatim.
 *   5. The clock, then the digest, then the nonce. Three refusals, three names,
 *      so the owner is told which one it was.
 *   6. Blood pressure and array lengths, before a single row is written.
 *
 * THERE IS NO SYNC CURSOR HERE and there is not going to be one. A failed run
 * on a locked phone that advanced a checkpoint is a documented way to lose a
 * day permanently: every run re-reads a fixed 48-hour window and the dedup key
 * makes the overlap cost nothing.
 */

const HEADERS = {
  authorization: 'authorization',
  keyId: 'x-ingest-key-id',
  timestamp: 'x-ingest-timestamp',
  nonce: 'x-ingest-nonce',
  digest: 'x-ingest-digest',
  idempotency: 'idempotency-key',
} as const;

type Answer = { status: number; body: Record<string, unknown> };

function ok(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: { ...NO_STORE } });
}

/** The plain-English sentence for a refusal, from the catalogue and nowhere else. */
function messageFor(error: IngestError): string {
  const copy = strings.api.ingest;
  const at = error.params;
  switch (error.code) {
    case 'bad_schema':
      return at.field === 'schema' ? copy.badVersion(at.found ?? '') : copy.badSchema(at.field ?? '');
    case 'bad_token':
      return at.reason === 'revoked'
        ? copy.badTokenRevoked
        : at.reason === 'none'
          ? copy.noCredential
          : copy.badToken;
    case 'bad_digest':
      return copy.badDigest(at.keyId ?? '');
    case 'stale_timestamp':
      return at.direction === 'future'
        ? copy.staleTimestampFuture(Number(at.minutes ?? 0))
        : copy.staleTimestamp(Number(at.minutes ?? 0));
    case 'replayed_nonce':
      return copy.replayedNonce;
    case 'forbidden_type':
      return copy.forbiddenType(at.series ?? '');
    case 'length_mismatch':
      return copy.lengthMismatch(at.series ?? '', at.column ?? '', at.expected ?? '', at.found ?? '');
    case 'too_large':
      return copy.tooLarge(at.found ?? '', at.limit ?? '');
    case 'bad_timestamp_format':
      return at.where === 'envelope'
        ? copy.badEnvelopeTimestamp(at.field ?? '', at.found ?? '')
        : copy.badTimestampFormat(at.series ?? '', at.field ?? '', at.found ?? '');
  }
}

/** Which status each refusal answers with. The Shortcut cannot read it; curl can. */
const STATUS: Record<IngestErrorCode, number> = {
  bad_schema: 422,
  bad_token: 401,
  bad_digest: 401,
  stale_timestamp: 401,
  replayed_nonce: 409,
  forbidden_type: 422,
  length_mismatch: 422,
  too_large: 413,
  bad_timestamp_format: 422,
};

function refusal(error: IngestError): Answer {
  return {
    status: STATUS[error.code],
    body: { ok: false, error: error.code, message: messageFor(error) },
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const answer = await handle(request);
    return ok(answer.body, answer.status);
  } catch (error) {
    // Never the token, never the secret, never the digest. The batch id is the
    // handle for everything else and it is written to the arrivals log too.
    console.error(`[vernier] /api/ingest/health failed: ${(error as Error).message}`);
    return ok({ ok: false, error: 'server_error', message: strings.api.ingest.failed }, 500);
  }
}

/**
 * GET is here so a browser that finds this URL is told what it is rather than
 * being handed a framework 405 with an empty body. It authenticates nothing and
 * reads nothing.
 */
export async function GET(): Promise<Response> {
  return ok(
    { ok: false, error: 'bad_token', message: strings.api.ingest.badToken },
    401,
  );
}

async function handle(request: Request): Promise<Answer> {
  const config = getConfig();
  const now = new Date();

  const headerTimestamp = request.headers.get(HEADERS.timestamp)?.trim() ?? '';
  const headerDigest = request.headers.get(HEADERS.digest)?.trim() ?? '';

  /**
   * One arrival, logged, whatever became of it.
   *
   * The diagnostics screen has to be able to tell "the phone is reaching this
   * machine and being turned away" from "the phone is not reaching this
   * machine". Those are different failures with different fixes and from the
   * phone they look identical, so a refusal is written down too.
   *
   * A caller with no credential at all writes nothing. That is deliberate:
   * anything on the tailnet could otherwise fill the owner's arrivals log with
   * noise, and a request that presented nothing is not an arrival from his
   * phone. A wrong or revoked token IS logged, because that is the owner's own
   * phone carrying a credential he has to fix.
   */
  const logArrival = async (code: string) => {
    await recordBatch({
      id: crypto.randomUUID(),
      keyId: request.headers.get(HEADERS.keyId)?.trim() ?? '',
      device: '',
      nonce: request.headers.get(HEADERS.nonce)?.trim() ?? '',
      windowStart: null,
      windowEnd: null,
      generatedAt: null,
      outcome: code,
    });
  };

  // 1. Size, from the header, before a byte of the body is read. `text()` on an
  // 80 MB request buffers 80 MB first, and this endpoint will not read one.
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > CAPS.bodyBytes) {
    return refusal({
      code: 'too_large',
      params: { found: String(declared), limit: String(CAPS.bodyBytes) },
    });
  }

  // 2. The bearer token. Before the JSON, before the schema, before anything
  // that would tell a caller with no credential what this endpoint expects.
  //
  // F51's second direction lives here too: a browser session is not a bearer
  // token and never becomes one. There is no cookie read on this route at all,
  // so a signed-in owner with no token is refused exactly like a stranger.
  const bearer = request.headers.get(HEADERS.authorization) ?? '';
  const token = /^Bearer\s+(.+)$/i.exec(bearer.trim())?.[1] ?? '';
  const verdict = await verifyIngestToken(token);
  if (!verdict.ok) {
    const reason = verdict.reason === 'no_credential' ? 'none' : 'refused';
    if (token !== '') await logArrival('bad_token');
    return refusal({ code: 'bad_token', params: { reason } });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > CAPS.bodyBytes) {
    await logArrival('too_large');
    return refusal({
      code: 'too_large',
      params: { found: String(Buffer.byteLength(raw, 'utf8')), limit: String(CAPS.bodyBytes) },
    });
  }

  // 3. The envelope. The digest is recomputed from these fields, so they have
  // to be read before it can be checked.
  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    await logArrival('bad_schema');
    return refusal({ code: 'bad_schema', params: { field: 'body' } });
  }
  const parsed = parseBatch(body);
  if (!parsed.ok) {
    await logArrival(parsed.error.code);
    return refusal(parsed.error);
  }
  const batch = parsed.value;

  const headerNonce = request.headers.get(HEADERS.nonce)?.trim() ?? batch.nonce;
  const headerKeyId = request.headers.get(HEADERS.keyId)?.trim() ?? batch.keyId;
  // The research has the Shortcut send the nonce as the idempotency key. When
  // it is absent the nonce is the key anyway, so there is no unkeyed path.
  const idempotencyKey = request.headers.get(HEADERS.idempotency)?.trim() || headerNonce;

  const { handled } = await once(idempotencyKey, '/api/ingest/health', async () => {
    const answer = await store({
      batch,
      headerTimestamp,
      headerNonce,
      headerDigest,
      headerKeyId,
      keyId: verdict.credential.keyId,
      timeZone: config.timeZone,
      now,
    });
    const outcome = answer.body.ok !== true
      ? ('refused' as const)
      : Number(answer.body.accepted ?? 0) > 0
        ? ('applied' as const)
        : ('deduplicated' as const);
    return { outcome, handled: { status: answer.status, body: answer.body } };
  });

  // A replay of a request whose first arrival is still in flight comes back
  // from the idempotency layer with the shape every other route uses, and that
  // shape has a `detail` and no `message`. The Shortcut reads `message` and
  // nothing else, so it gets one here rather than a silent notification.
  if (handled.body.message === undefined) {
    return {
      status: handled.status,
      body: { ...handled.body, ok: false, error: 'in_flight', message: strings.api.log.alreadyApplying },
    };
  }
  return { status: handled.status, body: handled.body };
}

/**
 * Everything with a side effect, run once per idempotency key.
 *
 * The clock, the digest and the nonce are checked in that order, and each one
 * has its own name in the answer, because "it did not work" is the message this
 * whole feature exists to avoid.
 */
async function store(input: {
  batch: IncomingBatch;
  headerTimestamp: string;
  headerNonce: string;
  headerDigest: string;
  headerKeyId: string;
  keyId: string;
  timeZone: string;
  now: Date;
}): Promise<Answer> {
  const { batch, now } = input;
  const batchId = crypto.randomUUID();

  const windowStart = readTimestamp(batch.windowStart);
  const windowEnd = readTimestamp(batch.windowEnd);
  const generatedAt = readTimestamp(batch.generatedAt);
  const rowsReceived = batch.series.reduce((total, series) => total + series.type.length, 0);

  const log = async (outcome: string) => {
    await recordBatch({
      id: batchId,
      keyId: input.headerKeyId,
      device: batch.device,
      nonce: input.headerNonce,
      windowStart: windowStart?.at ?? null,
      windowEnd: windowEnd?.at ?? null,
      generatedAt: generatedAt?.at ?? null,
      outcome,
      seriesCount: batch.series.length,
      rowsReceived,
    });
  };

  const refuse = async (error: IngestError): Promise<Answer> => {
    await log(error.code);
    return refusal(error);
  };

  // 5a. The clock. This is also the whole of the check that a bare `Z` on the
  // request timestamp is genuinely UTC: a phone in Paris labelling local time
  // `Z` is two hours out and lands here rather than two hours in the past.
  const stamped = readTimestamp(input.headerTimestamp);
  if (!stamped) {
    return refuse({
      code: 'bad_timestamp_format',
      params: { where: 'envelope', field: HEADERS.timestamp, found: input.headerTimestamp },
    });
  }
  const skew = skewSeconds(stamped.at, now);
  if (skew > SKEW_SECONDS) {
    return refuse({
      code: 'stale_timestamp',
      params: {
        minutes: String(Math.round(skew / 60)),
        direction: stamped.at.getTime() > now.getTime() ? 'future' : 'past',
      },
    });
  }

  // The envelope's own three timestamps, read against the offset the batch
  // declared, exactly as a sample's are.
  //
  // `parseBatch` only asks that they be non-empty strings, because the digest
  // covers whatever they say and does not care whether it is a date. This is
  // where they have to be legible: the window is what the arrivals log shows
  // and what the source record names, and a `Z` on the window inside a +02:00
  // batch is the same mis-wired Format Date the sample check catches, arriving
  // one field earlier.
  for (const [field, value] of [
    ['window_start', batch.windowStart],
    ['window_end', batch.windowEnd],
    ['generated_at', batch.generatedAt],
  ] as const) {
    if (!readSampleTimestamp(value, stamped.offsetMinutes)) {
      return refuse({
        code: 'bad_timestamp_format',
        params: { where: 'envelope', field, found: value },
      });
    }
  }

  // 5b. The digest, recomputed here from the PARSED body and the headers. The
  // canonical string is never taken from the request: a digest over a string
  // the caller wrote proves only that the caller can write a string.
  const secret = await readSigningSecret();
  if (!secret) return refuse({ code: 'bad_token', params: { reason: 'revoked' } });
  if (batch.keyId !== input.keyId || input.headerKeyId !== input.keyId) {
    return refuse({ code: 'bad_digest', params: { keyId: input.keyId } });
  }
  const canonical = canonicalString({
    keyId: batch.keyId,
    timestamp: input.headerTimestamp,
    nonce: input.headerNonce,
    windowStart: batch.windowStart,
    windowEnd: batch.windowEnd,
  });
  if (!digestMatches(twoPassDigest(secret, canonical), input.headerDigest)) {
    return refuse({ code: 'bad_digest', params: { keyId: input.keyId } });
  }

  // 5c. The nonce. Claimed by insert, so two arrivals of the same one race into
  // the unique index and exactly one wins.
  await sweepNonces(now);
  const fresh = await claimNonce(
    input.headerNonce,
    new Date(now.getTime() + NONCE_TTL_HOURS * 3_600_000),
  );
  if (!fresh) return refuse({ code: 'replayed_nonce', params: {} });

  // 6. Blood pressure and the six-array lengths, before a single row is
  // written. `parseBatch` has already refused a length mismatch; this refuses a
  // forbidden type and any timestamp the batch's own offset makes illegible.
  const expanded = expandBatch(batch, stamped.offsetMinutes);
  if (!expanded.ok) return refuse(expanded.error);
  const rows = expanded.value;

  await log('accepted');
  await touchCredential(input.keyId);

  const { accepted, duplicates } = await storeSamples(
    rows.map((row) => ({ ...row, batchId })),
  );

  const windowLabel =
    windowStart && windowEnd
      ? strings.ingest.windowRange(
          shortDateTime(windowStart.at, input.timeZone),
          shortDateTime(windowEnd.at, input.timeZone),
        )
      : batch.windowStart;

  const rollups = await storeRollups({
    batchId,
    device: batch.device,
    days: rollupDays(rows, input.timeZone, now),
    timeZone: input.timeZone,
    windowLabel,
    receivedAt: now,
  });

  await recordBatchCounts(batchId, {
    rowsAccepted: accepted,
    rowsDuplicate: duplicates,
    readingsStored: rollups.stored,
  });
  await markIngestSucceeded(now);

  const copy = strings.api.ingest;
  const message =
    rows.length === 0
      ? copy.noSamples
      : accepted === 0
        ? copy.nothingNew
        : rollups.stored > 0
          ? `${copy.samplesStored(accepted)} ${copy.alreadyHere(duplicates)} ${copy.readingsStored(rollups.stored)}`
          : `${copy.samplesStored(accepted)} ${copy.alreadyHere(duplicates)}`;

  const perSeries: Record<string, number> = {};
  for (const series of batch.series) perSeries[series.metric] = series.type.length;

  return {
    status: accepted > 0 ? 201 : 200,
    body: {
      ok: true,
      batch_id: batchId,
      accepted,
      duplicates,
      readings: rollups.stored,
      readings_already_stored: rollups.alreadyStored,
      refused: rollups.refused.map((one) => copy.readingRefused(one.metric, one.detail)),
      series: perSeries,
      message,
    },
  };
}
