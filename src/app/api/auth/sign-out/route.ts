import { recordAuthAttempt } from '@/db/auth';
import { csrfFailure } from '@/lib/csrf';
import { ok, peerOf, sessionOrRefusal } from '@/lib/gate';
import { endSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Signing out deletes the row, not just the cookie. A copy of the cookie taken
 * beforehand is worthless a moment later, which is the difference between
 * signing out and hiding the key.
 */
export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { session, refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  await endSession();
  await recordAuthAttempt({
    method: 'sign-out',
    outcome: 'success',
    reason: `the ${session.method} session was ended by the owner`,
    peer: peerOf(request),
  });

  return ok({ signedOut: true });
}
