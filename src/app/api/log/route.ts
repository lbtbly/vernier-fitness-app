import { once } from '@/db/idempotency';
import {
  appendCorrection,
  readChain,
  readLogSnapshot,
  readMeasurement,
  storeMeasurement,
  toView,
} from '@/db/measurements';
import { getConfig } from '@/lib/config';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { METRICS } from '@/lib/provenance';
import { strings } from '@/lib/strings';
import { validateValue } from '@/lib/value-refusal';

export const dynamic = 'force-dynamic';

/**
 * The quick log's one endpoint.
 *
 * Every write arrives with an `Idempotency-Key` header, which is the client
 * UUID the outbox keyed the entry by, and it is the only reason a queue that
 * retries does not double-log a set. There is no unkeyed path: a write with no
 * key is refused rather than quietly applied, because the write that gets
 * replayed is exactly the one whose response was lost.
 *
 * Anti-forgery first, session second, work third. Same order as every other
 * mutating route in this app and there is no exemption list.
 */

const HEADER = 'idempotency-key';

type Incoming = { id: string; metric: string; rawValue: string };

/**
 * The one gate every write passes, corrections included.
 *
 * There is deliberately one of these and it takes a metric and a raw string,
 * because that is all any writer has. The rule it applies lives in
 * `src/lib/provenance.ts` beside the metric table, so the range a rating is
 * allowed and the range a waist measurement is allowed are stated once, next
 * to the unit, rather than in whichever handler happens to be writing.
 *
 * It matters more here than anywhere else in the app: `measurement` refuses
 * DELETE at the database and it is right to, so a value this function lets
 * past is permanent. A validation gap in an append-only store is not a bug you
 * can clean up afterwards.
 *
 * The rendering of a refusal moved to `src/lib/value-refusal.ts` so the quick
 * log's outbox can ask the same question before it accepts a write and give the
 * same answer. It used to accept anything and let this route refuse it later,
 * which told the owner an entry was safe when it was certain to be rejected.
 */
const validate = validateValue;

function usableTimeZone(candidate: unknown, fallback: string): string {
  if (typeof candidate !== 'string' || candidate === '') return fallback;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: candidate });
    return candidate;
  } catch {
    return fallback;
  }
}

export async function GET() {
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;
  const { timeZone } = getConfig();
  return ok({ ...(await readLogSnapshot(timeZone)) });
}

/**
 * Nothing leaves this route without a cause and a next step, including the
 * failure nobody predicted.
 *
 * An unhandled throw in a route handler is answered by the framework with a
 * bare 500 and an empty body, and an empty body renders on screen as the two
 * words "HTTP 500", which names no cause and offers no action. Screen 00
 * defines what an error looks like and that is not it, so the last resort is
 * written here rather than left to the framework.
 */
export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    console.error(`[vernier] /api/log failed: ${(error as Error).message}`);
    return refuse(500, strings.api.log.failed, strings.api.log.failedDetail);
  }
}

async function handle(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  const key = request.headers.get(HEADER)?.trim();
  if (!key) {
    return refuse(400, strings.api.log.noKey, strings.api.log.noKeyDetail);
  }

  let body: {
    action?: unknown;
    measuredAt?: unknown;
    timeZone?: unknown;
    values?: unknown;
    correctsId?: unknown;
    rawValue?: unknown;
    reason?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.log.bodyDetail);
  }

  const config = getConfig();
  const timeZone = usableTimeZone(body.timeZone, config.timeZone);

  // An edit. It appends and it never overwrites, so the original and every
  // correction before this one stay exactly where they are and stay readable.
  // Same route, same key, same anti-forgery check, because a correction is a
  // write like any other and a second endpoint is a second thing to protect.
  if (body.action === 'correct') {
    const correctsId = typeof body.correctsId === 'string' ? body.correctsId : '';
    const rawValue = typeof body.rawValue === 'string' ? body.rawValue.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (correctsId === '' || rawValue === '') {
      return refuse(
        422,
        strings.api.log.correctionNeedsValue,
        strings.api.log.correctionNeedsValueDetail,
      );
    }

    const { handled: corrected } = await once(key, '/api/log#correct', async () => {
      // Two steps, and the second one is why the first exists. `readChain` keys
      // on `root_id`, and a correction row's own id is never any row's root, so
      // resolving the chain straight from `correctsId` worked once and then
      // 404ed forever. Through the screen that is one edit and then "this value
      // was never stored" about a row sitting in the table.
      //
      // `appendCorrection` in src/db/measurements.ts has always done it this
      // way: read the row, then read the chain its root anchors. This route
      // called the same function with the wrong argument twenty lines earlier
      // and contradicted it. Now they agree.
      const anchor = await readMeasurement(correctsId);
      const anchorChain = anchor ? await readChain(anchor.rootId) : [];
      const head = anchorChain.at(-1);
      if (!head) {
        return {
          outcome: 'refused' as const,
          handled: {
            status: 404,
            body: {
              error: strings.api.log.correctionTargetGone(correctsId),
              detail: strings.api.log.correctionTargetGoneDetail,
            } as Record<string, unknown>,
          },
        };
      }

      // The same gate the quick log's own values pass. It was not here once,
      // and the two rows that fact wrote into an append-only table could not
      // be taken back out: a correction is a write and it is checked like one.
      const checked = validate({ metric: head.metric, rawValue });
      if (!checked.ok) {
        return {
          outcome: 'refused' as const,
          handled: {
            status: 422,
            body: {
              error: strings.api.log.correctionRefused,
              detail: checked.detail,
            } as Record<string, unknown>,
          },
        };
      }

      const row = await appendCorrection({
        id: crypto.randomUUID(),
        correctsId,
        rawValue,
        value: checked.value,
        reason,
        timeZone,
      });
      const chain = await readChain(row.rootId);
      return {
        outcome: 'applied' as const,
        handled: {
          status: 201,
          body: {
            corrected: toView(row),
            chain: chain.map((entry) => toView(entry)),
          } as Record<string, unknown>,
        },
      };
    });
    return ok(corrected.body, corrected.status);
  }

  const measuredAt =
    typeof body.measuredAt === 'string' && !Number.isNaN(Date.parse(body.measuredAt))
      ? new Date(body.measuredAt)
      : new Date();

  const values = Array.isArray(body.values) ? (body.values as Incoming[]) : [];
  if (values.length === 0) {
    return refuse(422, strings.api.log.nothingSent, strings.api.log.nothingSentDetail);
  }

  const { handled } = await once(key, '/api/log', async () => {
    const saved: Array<{ id: string; metric: string; decision: string }> = [];
    const dropped: Array<{ metric: string; keptId: string; reason: string }> = [];
    const questions: Array<{ id: string; metric: string }> = [];
    const rejected: Array<{ metric: string; detail: string }> = [];

    // One source record per save. The manual entry really is one event: the
    // owner opened the sheet once and pressed Save once.
    const sourceRecordInput = {
      id: `src_${key}`,
      source: 'manual' as const,
      kind: 'manual_entry' as const,
      reference: key,
      occurredAt: measuredAt,
      detail: [
        { key: 'source.field.enteredOn', value: strings.quickLog.title },
        { key: 'source.field.rowsReceived', value: String(values.length) },
      ],
    };

    for (const entry of values) {
      const checked = validate(entry);
      if (!checked.ok) {
        rejected.push({ metric: entry.metric, detail: checked.detail });
        continue;
      }
      const metric = METRICS[entry.metric as keyof typeof METRICS];
      const result = await storeMeasurement({
        id: entry.id,
        metric: entry.metric,
        rawValue: entry.rawValue.trim(),
        rawUnit: metric.unit,
        value: checked.value,
        unit: metric.unit,
        timeZone,
        source: 'manual',
        measuredAt,
        // A tape measure is measured by hand. A rating out of five and a free
        // note are neither measured nor estimated: the owner reported them.
        confidence: metric.kind === 'number' ? 'measured_manual' : 'reported',
        sourceRecord: sourceRecordInput,
      });

      if (result.stored) {
        saved.push({ id: result.id, metric: entry.metric, decision: result.outcome.decision });
      } else if (result.outcome.decision === 'held_for_question') {
        questions.push({ id: result.questionId!, metric: entry.metric });
      } else {
        dropped.push({
          metric: entry.metric,
          keptId: result.keptId!,
          reason: result.outcome.decision,
        });
      }
    }

    // A write whose every value was refused is a refusal, and it answers like
    // one: 422, error and detail, the same shape a refused correction sends.
    // It used to answer 200 with a `rejected` array and no error at all, so
    // one outcome had two contracts, the queue read it as applied, and the
    // only sign anything had gone wrong was a field the caller had to think to
    // look at. The rejections still travel, per value, with their reasons.
    const refused = saved.length === 0 && questions.length === 0 && rejected.length > 0;

    const outcome = refused
      ? ('refused' as const)
      : questions.length > 0
        ? ('held_for_question' as const)
        : saved.length > 0
          ? ('applied' as const)
          : ('deduplicated' as const);

    const body: Record<string, unknown> = {
      saved,
      dropped,
      questions,
      rejected,
      snapshot: await readLogSnapshot(timeZone),
    };
    if (refused) {
      body.error = strings.api.log.allRejected;
      body.detail = strings.api.log.allRejectedDetail;
    }

    return {
      outcome,
      handled: {
        status: refused ? 422 : saved.length > 0 ? 201 : 200,
        body,
      },
    };
  });

  return ok(handled.body, handled.status);
}
