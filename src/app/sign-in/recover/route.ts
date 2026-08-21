import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { consumeRecoveryGrant, readOwner, recordAuthAttempt } from '@/db/auth';
import { getConfig } from '@/lib/config';
import { NO_STORE, peerOf } from '@/lib/gate';
import { startSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Local recovery, second half: a one-time link minted on the Mac mini's own
 * shell by `scripts/recovery.sh link`.
 *
 * This is how the owner gets back in on a machine holding no passkey without
 * changing a password he may still remember. It asks no secret question and
 * sends nothing by email, because the only way to obtain the link is to be
 * sitting at the machine, or on its shell, which already outranks any password.
 *
 * The database holds the SHA-256 of the token. The grant is single use, it
 * expires in minutes, and spending it writes an audit row like every other way
 * in.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  const peer = peerOf(request);

  const failed = (reason: string) =>
    NextResponse.json(
      {
        error: 'That recovery link is not usable.',
        detail: reason,
      },
      { status: 401, headers: { ...NO_STORE } },
    );

  if (!token) {
    return failed('The link carried no token. Mint one on the Mac mini with scripts/recovery.sh link.');
  }

  const owner = await readOwner();
  if (!owner) {
    return failed('No owner account exists on this machine yet, so there is nothing to recover.');
  }

  const id = createHash('sha256').update(token).digest('base64url');
  const spent = await consumeRecoveryGrant(id);
  if (!spent) {
    await recordAuthAttempt({
      method: 'recovery',
      outcome: 'failure',
      reason: 'the recovery grant was expired, already spent or unknown',
      peer,
    });
    return failed('It has expired or has already been used. Mint a new one on the Mac mini.');
  }

  await startSession(owner.id, 'recovery');
  await recordAuthAttempt({
    method: 'recovery',
    outcome: 'success',
    reason: 'signed in with a one-time grant minted on the host shell',
    peer,
  });

  // The configured origin, not the request's own. Inside the container the
  // request arrives addressed to the bind address, and a Location built from it
  // sends the browser to https://0.0.0.0:3000, which no browser will follow.
  const target = new URL('/', getConfig().appUrl);
  return NextResponse.redirect(target, { status: 303, headers: { ...NO_STORE } });
}
