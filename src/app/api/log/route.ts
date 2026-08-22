import { once } from '@/db/idempotency';
import { appendCorrection, readChain, readLogSnapshot, storeMeasurement, toView } from '@/db/measurements';
import { getConfig } from '@/lib/config';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { METRICS, RATING_MAX, RATING_MIN, isMetric } from '@/lib/provenance';

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

/** A value the sheet sent, checked before anything is stored. */
function validate(entry: Incoming): { ok: true; value: number | null } | { ok: false; detail: string } {
  if (!isMetric(entry.metric)) {
    return { ok: false, detail: `Vernier stores no metric called ${entry.metric}.` };
  }
  const metric = METRICS[entry.metric];
  const raw = entry.rawValue.trim();
  if (raw === '') {
    return { ok: false, detail: 'A blank field is not stored. Blank stays blank, never zero.' };
  }

  if (metric.kind === 'text') return { ok: true, value: null };

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { ok: false, detail: `${raw} is not a number, so it was not stored.` };
  }
  if (metric.kind === 'rating' && (value < RATING_MIN || value > RATING_MAX || !Number.isInteger(value))) {
    return { ok: false, detail: `A rating is a whole number from ${RATING_MIN} to ${RATING_MAX}.` };
  }
  return { ok: true, value };
}

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

export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  const key = request.headers.get(HEADER)?.trim();
  if (!key) {
    return refuse(
      400,
      'This write carried no idempotency key.',
      'Every quick-log write is keyed by the client UUID its outbox entry holds, so a retry applies once.',
    );
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
    return refuse(400, 'Expected a JSON body.', 'Send measuredAt, timeZone and one or more values.');
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
        'A correction needs the value it corrects and the new number.',
        'Send correctsId and rawValue. The original is kept either way.',
      );
    }

    const { handled: corrected } = await once(key, '/api/log#correct', async () => {
      const anchorChain = await readChain(correctsId);
      const head = anchorChain.at(-1);
      if (!head) {
        return {
          outcome: 'refused' as const,
          handled: {
            status: 404,
            body: { error: `No measurement ${correctsId} to correct.` } as Record<string, unknown>,
          },
        };
      }
      const parsed = Number(rawValue);
      const row = await appendCorrection({
        id: crypto.randomUUID(),
        correctsId,
        rawValue,
        value: head.unit === 'text' ? null : Number.isFinite(parsed) ? parsed : null,
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
    return refuse(422, 'Nothing was sent to store.', 'Fill at least one field before saving.');
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
        { key: 'source.field.enteredOn', value: 'Quick log' },
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

    const outcome =
      questions.length > 0
        ? ('held_for_question' as const)
        : saved.length > 0
          ? ('applied' as const)
          : ('deduplicated' as const);

    return {
      outcome,
      handled: {
        status: saved.length > 0 ? 201 : 200,
        body: {
          saved,
          dropped,
          questions,
          rejected,
          snapshot: await readLogSnapshot(timeZone),
        } as Record<string, unknown>,
      },
    };
  });

  return ok(handled.body, handled.status);
}
