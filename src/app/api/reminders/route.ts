import { readQuietHours, readSettings, writeQuietHours, writeSetting } from '@/db/reminders';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { MAX_LEAD_MINUTES, isReminderCategory, isWallTime } from '@/lib/reminders';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * The reminder settings: one category at a time, and the quiet window.
 *
 * ONE CATEGORY PER REQUEST. There is no control that turns three off at once,
 * for the same reason there is no control that accepts a whole training week:
 * a switch that decides more than the row it sits in is a switch that changes
 * things the owner did not read. Each request names one category, and the whole
 * settings list comes back so the screen renders what the database says rather
 * than what it hoped.
 */
export async function GET() {
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;
  const [settings, quiet] = await Promise.all([readSettings(), readQuietHours()]);
  return ok({ settings, quiet });
}

export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  let body: { category?: unknown; enabled?: unknown; leadMinutes?: unknown; quiet?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.push.bodyDetail);
  }

  if (body.quiet !== undefined) {
    const quiet = body.quiet as { from?: unknown; to?: unknown };
    const from = typeof quiet?.from === 'string' ? quiet.from : '';
    const to = typeof quiet?.to === 'string' ? quiet.to : '';
    if (!isWallTime(from) || !isWallTime(to)) {
      return refuse(422, strings.api.push.badQuietHours, strings.api.push.badQuietHoursDetail);
    }
    const written = await writeQuietHours({ from, to });
    return ok({ settings: await readSettings(), quiet: written });
  }

  const category = typeof body.category === 'string' ? body.category : '';
  if (!isReminderCategory(category)) {
    return refuse(422, strings.api.push.badCategory, strings.api.push.badCategoryDetail);
  }

  const change: { enabled?: boolean; leadMinutes?: number } = {};
  if (typeof body.enabled === 'boolean') change.enabled = body.enabled;
  if (body.leadMinutes !== undefined) {
    const lead = Number(body.leadMinutes);
    if (!Number.isInteger(lead) || lead < 0 || lead > MAX_LEAD_MINUTES) {
      return refuse(422, strings.api.push.badLead, strings.api.push.badLeadDetail);
    }
    change.leadMinutes = lead;
  }

  const settings = await writeSetting(category, change);
  return ok({ settings, quiet: await readQuietHours() });
}
