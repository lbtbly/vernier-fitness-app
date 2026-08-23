import type { TokenBundle } from '@/lib/withings/client';

/**
 * The rotated refresh token replaces the stored one INSIDE THE SAME
 * TRANSACTION as the access token it arrived with.
 *
 * Withings issues a new refresh token on every refresh and kills the old one
 * eight hours later, or the instant the new access token is used, whichever
 * comes first. There is no recovery path for a dead one on the Public API: the
 * owner would have to sign in to Withings and consent again by hand. So the two
 * writes that carry a refresh are one write or they are a bug. A crash between
 * a stored access token and a stored refresh token leaves an installation whose
 * access works for three hours and can never be renewed, and the failure
 * surfaces one sync after the machine that could have explained it rebooted.
 *
 * This file holds the ordering and nothing else, so the guarantee can be tested
 * without a database. `session` is whatever opens a transaction and hands back
 * the writer bound to it; src/db/withings.ts passes drizzle's own, and a test
 * passes one that records where each write landed.
 */

export type RotationWriter = {
  /** The sealed bundle: access token, refresh token, expiry, scope, account. */
  writeTokens(next: TokenBundle): Promise<void>;
  /** The connection row beside it: expiry, when the refresh rotated, the state. */
  writeConnection(next: { expiresAt: string; rotatedAt: Date; state: string }): Promise<void>;
};

/** Opens one transaction, hands the writer bound to it, commits or rolls back. */
export type RotationSession<W extends RotationWriter> = <T>(
  work: (writer: W) => Promise<T>,
) => Promise<T>;

export type RotationOutcome = {
  /** True when the refresh token that came back is not the one that went out. */
  rotated: boolean;
  supersededAt: Date;
};

export async function rotateTokens<W extends RotationWriter>(
  session: RotationSession<W>,
  previous: TokenBundle | null,
  next: TokenBundle,
  now: Date,
  state = 'connected',
): Promise<RotationOutcome> {
  const rotated = previous !== null && previous.refreshToken !== next.refreshToken;
  await session(async (writer) => {
    await writer.writeTokens(next);
    await writer.writeConnection({ expiresAt: next.expiresAt, rotatedAt: now, state });
  });
  return { rotated, supersededAt: now };
}
