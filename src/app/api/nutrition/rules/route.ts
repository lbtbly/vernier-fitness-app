import { addRule, removeRule } from '@/db/nutrition';
import { RULE_KINDS, RULE_SUBJECTS, type RuleKind, type RuleSubject } from '@/lib/dietary-rules';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * A dietary rule, added or removed, and the kind is never optional.
 *
 * There is no endpoint here that takes a subject on its own. Adding "nuts"
 * without saying which of the four rules it is would be exactly the collapse
 * F83 forbids, so the kind is required, it is checked against the four, and the
 * check constraint in 0009 refuses a fifth at the database as well.
 */
export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  let body: { action?: unknown; kind?: unknown; subject?: unknown; id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.nutrition.bodyDetail);
  }

  if (body.action === 'remove') {
    const id = typeof body.id === 'string' ? body.id : '';
    const removed = await removeRule(id);
    if (!removed) return refuse(404, strings.api.nutrition.noMeal, strings.api.nutrition.bodyDetail);
    return ok({ removed: id });
  }

  const kind = RULE_KINDS.find((entry) => entry === body.kind) ?? null;
  const subject = RULE_SUBJECTS.find((entry) => entry === body.subject) ?? null;
  if (!kind || !subject) {
    return refuse(422, strings.api.nutrition.badState, strings.api.nutrition.badStateDetail);
  }

  const written = await addRule(kind as RuleKind, subject as RuleSubject);
  return ok({ rule: { id: `${kind}:${subject}`, kind, subject, written } });
}
