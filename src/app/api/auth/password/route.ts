import { readOwner, recentFailures, recordAuthAttempt } from '@/db/auth';
import { csrfFailure } from '@/lib/csrf';
import { ok, peerOf, refuse } from '@/lib/gate';
import { verifyPassword } from '@/lib/password';
import { SIGN_IN_WINDOW_SECONDS, lockoutState } from '@/lib/rate-limit';
import { startSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * The backup password, which is the way in when the phone is lost and the way
 * back after a recovery on the host shell.
 *
 * Every path through here writes exactly one audit row: the refusal, the wrong
 * password, and the successful sign-in. The Argon2id parameters come off the
 * owner row, never from a constant in this file.
 */
export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const peer = peerOf(request);

  const lockout = lockoutState(await recentFailures());
  if (lockout.locked) {
    await recordAuthAttempt({
      method: 'password',
      outcome: 'rate-limited',
      reason: `refused by the rate limiter, ${lockout.retryAfterSeconds} seconds left in the window`,
      peer,
    });
    return refuse(
      429,
      'Too many attempts.',
      `Five failures inside ${SIGN_IN_WINDOW_SECONDS} seconds pauses sign-in. Wait ${lockout.retryAfterSeconds} seconds and try again. A correct password will not open it any sooner.`,
      { retryAfterSeconds: lockout.retryAfterSeconds, attemptsLeft: 0 },
    );
  }

  let body: { password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, 'Expected a JSON body.', 'Send the password as a string.');
  }
  const password = typeof body.password === 'string' ? body.password : '';

  const owner = await readOwner();
  if (!owner) {
    await recordAuthAttempt({
      method: 'password',
      outcome: 'refused',
      reason: 'no owner account exists yet',
      peer,
    });
    return refuse(
      404,
      'No owner account yet.',
      'Nothing has been created on this machine. Create the owner account first.',
    );
  }

  if (!password || !verifyPassword(password, owner)) {
    await recordAuthAttempt({
      method: 'password',
      outcome: 'failure',
      reason: 'the backup password did not match',
      peer,
    });
    const after = lockoutState(await recentFailures());
    return refuse(
      401,
      'That password does not match.',
      after.locked
        ? `Sign-in is paused for ${after.retryAfterSeconds} seconds.`
        : `${after.attemptsLeft} ${after.attemptsLeft === 1 ? 'attempt' : 'attempts'} left, then a ${SIGN_IN_WINDOW_SECONDS} second pause.`,
      { attemptsLeft: after.attemptsLeft, retryAfterSeconds: after.retryAfterSeconds },
    );
  }

  await startSession(owner.id, 'password');
  await recordAuthAttempt({
    method: 'password',
    outcome: 'success',
    reason: 'signed in with the backup password',
    peer,
  });
  return ok({ signedIn: true, method: 'password' });
}
