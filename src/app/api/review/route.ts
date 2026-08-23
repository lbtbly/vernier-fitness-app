import { decideBlock, readDecisions } from '@/db/weekly-review';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { strings } from '@/lib/strings';
import type { ProposalBlockId } from '@/lib/weekly-review';

export const dynamic = 'force-dynamic';

const BLOCKS: ProposalBlockId[] = ['training', 'nutrition', 'shopping'];

/**
 * One block of next week's proposal, decided on its own.
 *
 * THERE IS NO ENDPOINT THAT ACCEPTS THE WEEK. DESIGN.md section 5's first
 * decision and F121's "confirmable diff": declining the menu says nothing about
 * the sessions, and neither of them writes to a calendar. The answer carries
 * all three states, so the screen can prove that deciding one left the others
 * where they were rather than assuming it.
 */
export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  let body: { weekStart?: unknown; block?: unknown; state?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.review.bodyDetail);
  }

  const weekStart = typeof body.weekStart === 'string' ? body.weekStart : '';
  const block = typeof body.block === 'string' ? (body.block as ProposalBlockId) : null;
  const state = body.state === 'accepted' || body.state === 'rejected' ? body.state : null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !block || !BLOCKS.includes(block) || !state) {
    return refuse(422, strings.api.review.badBlock, strings.api.review.badBlockDetail);
  }

  const decisions = await decideBlock(weekStart, block, state);
  return ok({ weekStart, decisions });
}

export async function GET(request: Request) {
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;
  const weekStart = new URL(request.url).searchParams.get('weekStart') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return refuse(422, strings.api.review.badBlock, strings.api.review.badBlockDetail);
  }
  return ok({ weekStart, decisions: await readDecisions(weekStart) });
}
