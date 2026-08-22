import { readOwner, recentFailures, recordAuthAttempt } from '@/db/auth';
import { csrfFailure } from '@/lib/csrf';
import { ok, peerOf, refuse } from '@/lib/gate';
import { verifyPassword } from '@/lib/password';
import { SIGN_IN_WINDOW_SECONDS, lockoutState } from '@/lib/rate-limit';
import { startSession } from '@/lib/session';
import { strings } from '@/lib/strings';

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
      strings.api.rateLimit.tooMany,
      strings.api.rateLimit.windowPassword(SIGN_IN_WINDOW_SECONDS, lockout.retryAfterSeconds),
      { retryAfterSeconds: lockout.retryAfterSeconds, attemptsLeft: 0 },
    );
  }

  let body: { password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.password.bodyDetail);
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
    return refuse(404, strings.api.password.noOwner, strings.api.password.noOwnerDetail);
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
      'That password did not match anything here.',
      after.locked
        ? strings.api.rateLimit.paused(after.retryAfterSeconds)
        : strings.api.rateLimit.attemptsLeft(after.attemptsLeft, SIGN_IN_WINDOW_SECONDS),
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
