import { readLatestWeight, writeTarget } from '@/db/nutrition';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { NUTRITION, type PalLevel, type Sex } from '@/lib/nutrition';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * The daily target, and the three floors that stand between a number and the
 * database.
 *
 * F81 IS ENFORCED HERE AND IN THE SCHEMA, NOT IN THE COMPONENT. The verdict
 * comes from `planTarget`, which owns all three thresholds, and only an
 * `allowed` verdict reaches a write. A refused rate and a blocked floor both
 * answer 422 with the verdict attached, so the screen renders the same object
 * the server decided on rather than re-deriving the refusal and possibly
 * disagreeing with it.
 *
 *   RATE     above one percent of body weight a week, or above one kilogram, is
 *            REFUSED. There is no confirmation that unlocks it; the answer is a
 *            slower rate and the nearest compliant one is in the response.
 *   FLOOR    under 1500 kcal for a man is BLOCKED until `hardFloorConfirmed`
 *            arrives from a screen that recommends a professional. The check
 *            constraint in 0009 refuses the row as well, so a future handler
 *            that forgets to ask cannot write one.
 *   RESTING  under the estimated resting figure is ALLOWED and warned, and the
 *            warning names the figure it is under.
 */
const LEVELS: PalLevel[] = ['sedentary', 'light', 'active', 'veryActive'];
const MIN_AGE = 16;
const MAX_AGE = 100;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 230;
const MIN_WEIGHT = 35;
const MAX_WEIGHT = 300;

function numberOf(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value.replace(',', '.'));
  return NaN;
}

export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  let body: {
    sex?: unknown;
    ageYears?: unknown;
    heightCm?: unknown;
    weightKg?: unknown;
    level?: unknown;
    rateKgPerWeek?: unknown;
    hardFloorConfirmed?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.targets.bodyDetail);
  }

  const sex = body.sex === 'female' ? 'female' : body.sex === 'male' ? 'male' : null;
  const level = LEVELS.find((entry) => entry === body.level) ?? null;
  if (!sex || !level) {
    return refuse(422, strings.api.targets.badLevel, strings.api.targets.badLevelDetail);
  }

  const ageYears = Math.round(numberOf(body.ageYears));
  const heightCm = numberOf(body.heightCm);
  let weightKg = numberOf(body.weightKg);
  if (!Number.isFinite(weightKg)) {
    const latest = await readLatestWeight();
    if (!latest) return refuse(409, strings.api.targets.noBody, strings.api.targets.noBodyDetail);
    weightKg = latest.kg;
  }

  const inRange =
    Number.isFinite(ageYears) &&
    ageYears >= MIN_AGE &&
    ageYears <= MAX_AGE &&
    Number.isFinite(heightCm) &&
    heightCm >= MIN_HEIGHT &&
    heightCm <= MAX_HEIGHT &&
    weightKg >= MIN_WEIGHT &&
    weightKg <= MAX_WEIGHT;
  if (!inRange) {
    return refuse(422, strings.api.targets.noBody, strings.api.targets.noBodyDetail);
  }

  const rateKgPerWeek = numberOf(body.rateKgPerWeek);
  if (!Number.isFinite(rateKgPerWeek)) {
    return refuse(422, strings.api.targets.badRate, strings.api.targets.badRateDetail);
  }

  const { verdict, row } = await writeTarget({
    sex: sex as Sex,
    ageYears,
    heightCm,
    weightKg,
    level,
    rateKgPerWeek,
    hardFloorConfirmed: body.hardFloorConfirmed === true,
  });

  if (verdict.outcome === 'rate_refused') {
    return refuse(422, strings.api.targets.refused, strings.api.targets.badRateDetail, { verdict });
  }
  if (verdict.outcome === 'blocked_below_floor') {
    return refuse(422, strings.api.targets.refused, strings.api.targets.bodyDetail, { verdict });
  }

  return ok({
    verdict,
    hardFloor:
      sex === 'male' ? NUTRITION.hardFloorKcalMale : NUTRITION.hardFloorKcalFemale,
    target: row
      ? {
          kcalTarget: row.kcalTarget,
          proteinG: row.proteinG,
          carbG: row.carbG,
          fatG: row.fatG,
          fibreG: row.fibreG,
          rmrKcal: row.rmrKcal,
          tdeeKcal: row.tdeeKcal,
          pal: row.pal,
        }
      : null,
  });
}
