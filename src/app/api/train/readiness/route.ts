import { answerReadiness, readLatestReadiness } from '@/db/training';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { SYMPTOM_KEYS, type SymptomKey } from '@/lib/readiness';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * The screening answer. Three inputs, stored together or not at all.
 *
 * The symptoms are checked against the published list rather than accepted as
 * free text, because the same nine items are read again by the stop rule and by
 * the deload rule, and a tenth item nobody defined would silently mean nothing
 * to either.
 */

export async function GET() {
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;
  return ok({ readiness: await readLatestReadiness() });
}

export async function POST(request: Request) {
  try {
    const csrf = await csrfFailure(request);
    if (csrf) return csrf.response;

    const { refusal } = await sessionOrRefusal();
    if (refusal) return refusal;

    let body: {
      activity?: unknown;
      knownDisease?: unknown;
      symptoms?: unknown;
      desiredIntensity?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return refuse(400, strings.api.jsonBody, strings.api.train.bodyDetail);
    }

    const activity = body.activity === 'active' ? 'active' : body.activity === 'inactive' ? 'inactive' : null;
    const desiredIntensity =
      body.desiredIntensity === 'vigorous'
        ? 'vigorous'
        : body.desiredIntensity === 'lightModerate'
          ? 'lightModerate'
          : null;
    const knownDisease = body.knownDisease === true || body.knownDisease === false ? body.knownDisease : null;
    if (activity === null || desiredIntensity === null || knownDisease === null) {
      return refuse(
        422,
        strings.api.train.readinessIncomplete,
        strings.api.train.readinessIncompleteDetail,
      );
    }

    const sent = Array.isArray(body.symptoms) ? body.symptoms : [];
    const symptoms = sent.filter((entry): entry is SymptomKey =>
      (SYMPTOM_KEYS as readonly string[]).includes(String(entry)),
    );

    const readiness = await answerReadiness({ activity, knownDisease, symptoms, desiredIntensity });
    return ok({ readiness }, 201);
  } catch (error) {
    console.error(`[vernier] /api/train/readiness failed: ${(error as Error).message}`);
    return refuse(500, strings.api.train.failed, strings.api.train.failedDetail);
  }
}
