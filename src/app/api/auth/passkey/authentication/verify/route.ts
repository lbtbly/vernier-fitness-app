import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import {
  readCredential,
  recentFailures,
  recordAuthAttempt,
  recordCredentialUse,
  takeChallenge,
} from '@/db/auth';
import { csrfFailure } from '@/lib/csrf';
import { ok, peerOf, refuse } from '@/lib/gate';
import { SIGN_IN_WINDOW_SECONDS, lockoutState } from '@/lib/rate-limit';
import { startSession } from '@/lib/session';
import { strings } from '@/lib/strings';
import { checkAuthentication, counterToStore } from '@/lib/webauthn';

export const dynamic = 'force-dynamic';

/**
 * Step two. The assertion is checked against the challenge the server kept, the
 * origin from APP_URL and the relying party from WEBAUTHN_RP_ID.
 *
 * The counter is then written back exactly as the authenticator reported it. A
 * passkey synced through iCloud Keychain reports 0 for the rest of its life, so
 * the moment this code invents an increment, the owner's iPhone stops working
 * on its second use while the Mac keeps working. That bug ships silently. This
 * one line is the whole defence against it.
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

  let body: { ceremonyId?: unknown; response?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.passkey.bodyDetail);
  }

  const ceremonyId = typeof body.ceremonyId === 'string' ? body.ceremonyId : '';
  const response = body.response as AuthenticationResponseJSON | undefined;
  if (!ceremonyId || !response || typeof response.id !== 'string') {
    return refuse(400, strings.api.passkey.notAnAssertion, strings.api.passkey.bodyDetail);
  }

  const expectedChallenge = await takeChallenge(ceremonyId, 'authentication');
  if (!expectedChallenge) {
    await recordAuthAttempt({
      method: 'passkey',
      outcome: 'failure',
      reason: 'the ceremony had expired or was already spent',
      peer,
    });
    return refuse(
      400,
      strings.api.passkey.ceremonyExpired,
      strings.api.passkey.ceremonyExpiredDetail,
    );
  }

  const credential = await readCredential(response.id);
  if (!credential) {
    await recordAuthAttempt({
      method: 'passkey',
      outcome: 'failure',
      reason: 'no stored passkey matched the credential offered',
      peer,
    });
    const after = lockoutState(await recentFailures());
    return refuse(
      401,
      strings.api.passkey.noMatch,
      after.locked
        ? strings.api.rateLimit.paused(after.retryAfterSeconds)
        : strings.api.rateLimit.attemptsLeft(after.attemptsLeft, SIGN_IN_WINDOW_SECONDS),
      { attemptsLeft: after.attemptsLeft },
    );
  }

  let verified = false;
  let newCounter = credential.counter;
  try {
    const result = await checkAuthentication({ response, expectedChallenge, credential });
    verified = result.verified;
    newCounter = result.authenticationInfo.newCounter;
  } catch (error) {
    await recordAuthAttempt({
      method: 'passkey',
      outcome: 'failure',
      reason: `the assertion did not verify: ${(error as Error).message}`.slice(0, 200),
      peer,
    });
    return refuse(401, strings.api.passkey.notVerified, (error as Error).message);
  }

  if (!verified) {
    await recordAuthAttempt({
      method: 'passkey',
      outcome: 'failure',
      reason: 'the assertion did not verify',
      peer,
    });
    const after = lockoutState(await recentFailures());
    return refuse(
      401,
      strings.api.passkey.notVerified,
      strings.api.rateLimit.attemptsLeftShort(after.attemptsLeft),
      { attemptsLeft: after.attemptsLeft },
    );
  }

  await recordCredentialUse(credential.id, counterToStore(newCounter));
  await startSession(credential.ownerId, 'passkey');
  await recordAuthAttempt({
    method: 'passkey',
    outcome: 'success',
    reason: `signed in with the passkey reporting counter ${newCounter}`,
    peer,
  });

  return ok({ signedIn: true, method: 'passkey', counter: newCounter });
}
