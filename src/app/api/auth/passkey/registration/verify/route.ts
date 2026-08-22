import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { readOwner, recordAuthAttempt, saveCredential, takeChallenge } from '@/db/auth';
import { recordPasskeyRegistered } from '@/db/diagnostics';
import { csrfFailure } from '@/lib/csrf';
import { ok, peerOf, refuse, sessionOrRefusal } from '@/lib/gate';
import { strings } from '@/lib/strings';
import { checkRegistration, counterToStore } from '@/lib/webauthn';

export const dynamic = 'force-dynamic';

/**
 * Stores the credential: identifier, public key, counter, transports, device
 * type and backed-up flag. All six, because all six are what a later assertion
 * is checked against, and the last two are how the app knows a passkey is
 * synced through iCloud Keychain rather than living on one device.
 *
 * The counter is stored verbatim. A synced passkey arrives reporting 0 and will
 * report 0 forever.
 */
export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { session, refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  const peer = peerOf(request);
  const owner = await readOwner();
  if (!owner || owner.id !== session.ownerId) {
    return refuse(409, strings.api.password.noOwner, strings.api.password.createOwnerFirst);
  }

  let body: { ceremonyId?: unknown; response?: unknown; label?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.passkey.bodyDetail);
  }

  const ceremonyId = typeof body.ceremonyId === 'string' ? body.ceremonyId : '';
  const response = body.response as RegistrationResponseJSON | undefined;
  const label =
    typeof body.label === 'string' && body.label.trim() !== ''
      ? body.label.trim().slice(0, 64)
      : 'This device';
  if (!ceremonyId || !response || typeof response.id !== 'string') {
    return refuse(400, strings.api.passkey.notARegistration, strings.api.passkey.bodyDetail);
  }

  const expectedChallenge = await takeChallenge(ceremonyId, 'registration');
  if (!expectedChallenge) {
    return refuse(
      400,
      strings.api.passkey.registrationExpired,
      strings.api.passkey.registrationExpiredDetail,
    );
  }

  let verification;
  try {
    verification = await checkRegistration({ response, expectedChallenge });
  } catch (error) {
    return refuse(400, strings.api.passkey.notVerified, (error as Error).message);
  }

  if (!verification.verified || !verification.registrationInfo) {
    return refuse(400, strings.api.passkey.notVerified, strings.api.passkey.notVerifiedDetail);
  }

  const { credential, credentialDeviceType, credentialBackedUp, aaguid } = verification.registrationInfo;

  await saveCredential({
    id: credential.id,
    ownerId: owner.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: counterToStore(credential.counter),
    transports: credential.transports ?? response.response.transports ?? [],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    aaguid,
    label,
  });

  // The signal the preflight greps. Sticky true, timestamped, and this is the
  // first slice that has anything to write to it.
  await recordPasskeyRegistered();

  await recordAuthAttempt({
    method: 'passkey',
    outcome: 'success',
    reason: `a passkey was registered, device type ${credentialDeviceType}`,
    peer,
  });

  return ok(
    {
      registered: true,
      credentialId: credential.id,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      counter: credential.counter,
      transports: credential.transports ?? [],
    },
    201,
  );
}
