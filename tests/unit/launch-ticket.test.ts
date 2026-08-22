import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LAUNCH_TICKET_SECONDS, mintLaunchTicket, readLaunchTicket } from '@/lib/launch-ticket';

/**
 * The one question about a launch report that a header cannot answer for the
 * caller: was this page served by this app, to this session, just now.
 *
 * It got asked after 2026-08-22, when the verifier set standalone_seen and
 * wake_lock_available true on an image byte for byte identical to the owner's
 * install with four lines of curl: an anti-forgery pair minted by one
 * unauthenticated GET of /sign-in, then a POST of three booleans with an iPhone
 * user agent. Every witness the route held asked who was calling, and nothing on
 * the wire answers that.
 */

const NAME = 'MASTER_KEY';
const keyA = randomBytes(32).toString('base64url');
const keyB = randomBytes(32).toString('base64url');
const original = process.env[NAME];

/** Two sessions, the way the session table holds them: hashes, never cookies. */
const owner = 'wSJ7mBFqR0cQ4iQ0G0Yb0cTLh1RmvFkZ0m4rE8oBw3g';
const other = 'A1cGmJ0f2Yq8bV5nX7pL9tR3wZ6dK4sH2jN8mQ0uC1E';

beforeEach(() => {
  process.env[NAME] = keyA;
});

afterEach(() => {
  if (original === undefined) delete process.env[NAME];
  else process.env[NAME] = original;
});

describe('the launch ticket', () => {
  it('accepts the ticket it just minted for the session it minted it for', () => {
    expect(readLaunchTicket(mintLaunchTicket(owner), owner)).toBe('ok');
  });

  it('refuses a ticket minted for another session', () => {
    // The session id is inside the keyed hash, so a ticket read off one
    // browser's page proves nothing about another's.
    expect(readLaunchTicket(mintLaunchTicket(other), owner)).toBe('forged');
  });

  it('refuses everything a caller could type instead of a ticket', () => {
    for (const attempt of [
      '',
      '.',
      'ticket',
      '1',
      '1.0',
      `1.${Math.floor(Date.now() / 1000)}`,
      `1.${Math.floor(Date.now() / 1000)}.`,
      `1.${Math.floor(Date.now() / 1000)}.not-the-hash`,
      `2.${Math.floor(Date.now() / 1000)}.${mintLaunchTicket(owner).split('.')[2]}`,
      `1.not-a-time.${mintLaunchTicket(owner).split('.')[2]}`,
      mintLaunchTicket(owner) + 'x',
      mintLaunchTicket(owner).slice(0, -1),
    ]) {
      expect(readLaunchTicket(attempt, owner), `${attempt} was believed`).not.toBe('ok');
    }
  });

  it('refuses a ticket the running key did not mint', () => {
    // The whole strength of this is that the key never leaves the container.
    // A hash computed under any other key is not a ticket.
    const elsewhere = mintLaunchTicket(owner);
    process.env[NAME] = keyB;
    expect(readLaunchTicket(elsewhere, owner)).toBe('forged');
  });

  it('refuses one older than its window, and one dated in the future', () => {
    const now = Date.now();
    const minted = mintLaunchTicket(owner, now);
    expect(readLaunchTicket(minted, owner, now + (LAUNCH_TICKET_SECONDS - 5) * 1000)).toBe('ok');
    expect(readLaunchTicket(minted, owner, now + (LAUNCH_TICKET_SECONDS + 5) * 1000)).toBe('stale');
    // A ticket dated ahead of the server is a ticket a clock somewhere else
    // wrote. One minute of tolerance, and no more.
    expect(readLaunchTicket(minted, owner, now - 30 * 1000)).toBe('ok');
    expect(readLaunchTicket(minted, owner, now - 120 * 1000)).toBe('stale');
  });

  it('mints a different value every minted second, so one is not the other', () => {
    const now = Date.now();
    expect(mintLaunchTicket(owner, now)).not.toBe(mintLaunchTicket(owner, now + 1000));
    expect(mintLaunchTicket(owner, now)).toBe(mintLaunchTicket(owner, now));
  });
});
