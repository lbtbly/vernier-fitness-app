import { listCredentials, putChallenge, readOwner, recentFailures, recordAuthAttempt } from '@/db/auth';
import { csrfFailure } from '@/lib/csrf';
import { ok, peerOf, refuse } from '@/lib/gate';
import { SIGN_IN_WINDOW_SECONDS, lockoutState } from '@/lib/rate-limit';
import { strings } from '@/lib/strings';
import { buildAuthenticationOptions } from '@/lib/webauthn';

export const dynamic = 'force-dynamic';

/**
 * Step one of signing in with a passkey. The challenge is minted here, kept by
 * the server, and handed to the browser as an opaque ceremony handle. The
 * browser never gets a say in what the challenge is and cannot spend one twice.
 *
 * The rate limiter is applied at this step as well as the next, so a lockout
 * cannot be walked around by collecting options first.
 */
export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const peer = peerOf(request);
  const lockout = lockoutState(await recentFailures());
  if (lockout.locked) {
    await recordAuthAttempt({
      method: 'passkey',
      outcome: 'rate-limited',
      reason: `refused by the rate limiter, ${lockout.retryAfterSeconds} seconds left in the window`,
      peer,
    });
    return refuse(
      429,
      strings.api.rateLimit.tooMany,
      strings.api.rateLimit.window(SIGN_IN_WINDOW_SECONDS, lockout.retryAfterSeconds),
      { retryAfterSeconds: lockout.retryAfterSeconds },
    );
  }

  const owner = await readOwner();
  if (!owner) {
    return refuse(404, strings.api.password.noOwner, strings.api.password.noOwnerDetail);
  }

  const credentials = await listCredentials(owner.id);
  if (credentials.length === 0) {
    return refuse(
      409,
      strings.api.passkey.noneRegistered,
      strings.api.passkey.noneRegisteredDetail,
    );
  }

  const options = await buildAuthenticationOptions(credentials);
  const ceremonyId = await putChallenge({
    challenge: options.challenge,
    ceremony: 'authentication',
    ownerId: owner.id,
  });

  return ok({ ceremonyId, options });
}
