import { readGoal, updateGoalTarget } from '@/db/goal';
import { csrfFailure } from '@/lib/csrf';
import { longDate } from '@/lib/format';
import { getConfig } from '@/lib/config';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { checkValue } from '@/lib/provenance';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * The weight goal, edited.
 *
 * Two fields and no more: the target weight and the target date. Where the goal
 * started is a fact about the past and is not on offer, because a start that
 * moves with every edit is a goal that can be made to look met without anything
 * happening to the owner's body.
 *
 * Anti-forgery first, then the session, then the values, and a refusal at any
 * of those writes nothing. The band the target weight is checked against is the
 * same one `checkValue` applies to a stored weight, so the goal and the
 * readings cannot disagree about what a plausible weight is.
 */
export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  let body: { targetValue?: unknown; targetDate?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.goal.bodyDetail);
  }

  const existing = await readGoal();
  if (!existing) return refuse(409, strings.api.goal.noGoal, strings.api.goal.noGoalDetail);

  const { timeZone } = getConfig();
  const raw = typeof body.targetValue === 'string' ? body.targetValue : String(body.targetValue ?? '');
  const checked = checkValue(existing.metric, raw);
  if (!checked.ok || checked.value === null) {
    return refuse(
      422,
      strings.api.goal.badValue,
      checked.ok
        ? strings.api.log.blank
        : checked.problem === 'blank'
          ? strings.api.log.blank
          : checked.problem === 'notANumber'
            ? strings.api.log.notANumber(raw)
            : strings.api.log.outOfBand(
                existing.metric,
                String(checked.low),
                String(checked.high),
                existing.unit,
              ),
    );
  }

  const dateText = typeof body.targetDate === 'string' ? body.targetDate.trim() : '';
  // A bare calendar day from the date field, read at noon so no zone can move
  // it to the day before or the day after.
  const targetAt = /^\d{4}-\d{2}-\d{2}$/.test(dateText) ? new Date(`${dateText}T12:00:00Z`) : new Date(NaN);
  if (Number.isNaN(targetAt.getTime())) {
    return refuse(422, strings.api.goal.badDate, strings.api.goal.badDateDetail);
  }
  if (targetAt.getTime() <= existing.startAt.getTime()) {
    return refuse(
      422,
      strings.api.goal.badDate,
      strings.api.goal.dateBeforeStart(longDate(existing.startAt, timeZone)),
    );
  }
  if (targetAt.getTime() <= Date.now()) {
    return refuse(422, strings.api.goal.badDate, strings.api.goal.dateInThePast);
  }
  if (checked.value === existing.startValue) {
    return refuse(422, strings.api.goal.badValue, strings.api.goal.sameAsStart);
  }

  const saved = await updateGoalTarget(checked.value, targetAt);
  return ok({
    goal: saved
      ? {
          targetValue: saved.targetValue,
          targetAt: saved.targetAt.toISOString(),
          unit: saved.unit,
        }
      : null,
  });
}
