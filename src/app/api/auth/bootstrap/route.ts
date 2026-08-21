import {
  OwnerExistsError,
  countOwners,
  createOwner,
  recordAuthAttempt,
} from '@/db/auth';
import { csrfFailure } from '@/lib/csrf';
import { ok, peerOf, refuse } from '@/lib/gate';
import { passwordProblems } from '@/lib/password';
import { startSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * First run, once.
 *
 * Vernier holds exactly one account. This route creates it and then closes: the
 * second request gets 409 and the owner table still holds one row, which is F8.
 * The refusal is the unique index inside Postgres, not a count read a moment
 * earlier, so two simultaneous first runs cannot both pass.
 *
 * A successful creation signs the owner in, because the next thing the screen
 * does is enrol a passkey and that needs a session.
 */
export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const peer = peerOf(request);

  let body: { password?: unknown; repeat?: unknown; displayName?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, 'Expected a JSON body.', 'Send password and repeat as strings.');
  }

  const password = typeof body.password === 'string' ? body.password : '';
  const repeat = typeof body.repeat === 'string' ? body.repeat : '';
  const displayName =
    typeof body.displayName === 'string' && body.displayName.trim() !== ''
      ? body.displayName.trim().slice(0, 64)
      : 'Owner';

  if (await countOwners() > 0) {
    await recordAuthAttempt({
      method: 'bootstrap',
      outcome: 'refused',
      reason: 'the owner account already exists',
      peer,
    });
    return refuse(
      409,
      'The owner account already exists.',
      'Vernier holds exactly one account and it is created once. Sign in with your passkey or the backup password.',
    );
  }

  if (password !== repeat) {
    return refuse(422, 'The two passwords do not match.', 'Type the same password in both fields.');
  }

  const problems = passwordProblems(password);
  if (problems.length > 0) {
    return refuse(422, 'That password is not strong enough.', problems.join(' '), { problems });
  }

  try {
    const owner = await createOwner({ displayName, password });
    await startSession(owner.id, 'bootstrap');
    await recordAuthAttempt({
      method: 'bootstrap',
      outcome: 'success',
      reason: 'the owner account was created',
      peer,
    });
    return ok({ ownerId: owner.id, displayName: owner.displayName, created: true }, 201);
  } catch (error) {
    if (error instanceof OwnerExistsError) {
      await recordAuthAttempt({
        method: 'bootstrap',
        outcome: 'refused',
        reason: 'the owner account already exists',
        peer,
      });
      return refuse(
        409,
        'The owner account already exists.',
        'Vernier holds exactly one account and it is created once. Sign in with your passkey or the backup password.',
      );
    }
    throw error;
  }
}
