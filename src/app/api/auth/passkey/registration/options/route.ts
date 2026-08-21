import { listCredentials, putChallenge, readOwner } from '@/db/auth';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { buildRegistrationOptions } from '@/lib/webauthn';

export const dynamic = 'force-dynamic';

/**
 * Enrolling a passkey needs a session, because enrolling one is an act of the
 * owner and not a way to become him. Straight after first run the session comes
 * from the account that was just created; later it comes from Settings.
 */
export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { session, refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  const owner = await readOwner();
  if (!owner || owner.id !== session.ownerId) {
    return refuse(409, 'No owner account yet.', 'Create the owner account first.');
  }

  const existing = await listCredentials(owner.id);
  const options = await buildRegistrationOptions({
    ownerId: owner.id,
    displayName: owner.displayName,
    existing,
  });
  const ceremonyId = await putChallenge({
    challenge: options.challenge,
    ceremony: 'registration',
    ownerId: owner.id,
  });

  return ok({ ceremonyId, options });
}
