import { describe, expect, it } from 'vitest';
import {
  AUTH_STATE_LIFE_MS,
  checkAuthState,
  hashAuthState,
  mintAuthState,
} from '@/lib/withings/auth-state';

/**
 * F37's callback clause: a callback whose state does not match is refused.
 *
 * The state parameter is the whole of the cross-site protection this flow has,
 * because Withings documents no PKCE parameter of any kind and sending one
 * would be inventing a protocol. So this is the check, and it is graded on its
 * own rather than through a database round trip that happens to contain it.
 */

const NOW = new Date('2026-08-23T10:00:00Z');

describe('the state a callback has to carry', () => {
  it('accepts the state this app minted, and nothing else', () => {
    const minted = mintAuthState();
    expect(checkAuthState(minted.state, minted.hash, NOW, NOW)).toBe('matched');

    // Every near miss. A different value, the hash offered as the value, an
    // empty string, and the value with one character changed.
    const bent = `${minted.state.slice(0, -1)}${minted.state.endsWith('a') ? 'b' : 'a'}`;
    for (const offered of [mintAuthState().state, minted.hash, '', bent]) {
      expect(checkAuthState(offered, minted.hash, NOW, NOW)).toBe('mismatch');
    }
  });

  it('refuses a callback when this app never sent a state at all', () => {
    // A caller who arrived with a state of his own, at an installation that has
    // not started a connection. Nothing is stored and nothing is compared.
    expect(checkAuthState('anything', null, null, NOW)).toBe('no_state_issued');
    expect(checkAuthState('anything', hashAuthState('anything'), null, NOW)).toBe('no_state_issued');
    expect(checkAuthState('anything', null, NOW, NOW)).toBe('no_state_issued');
  });

  it('refuses one that arrives after the consent page went stale', () => {
    const minted = mintAuthState();
    const late = new Date(NOW.getTime() + AUTH_STATE_LIFE_MS + 1_000);
    expect(checkAuthState(minted.state, minted.hash, NOW, late)).toBe('expired');
    const inTime = new Date(NOW.getTime() + AUTH_STATE_LIFE_MS - 1_000);
    expect(checkAuthState(minted.state, minted.hash, NOW, inTime)).toBe('matched');
  });

  it('stores the hash and never the value, so a backup carries nothing replayable', () => {
    const minted = mintAuthState();
    expect(minted.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(minted.hash).not.toContain(minted.state);
    // Thirty-two bytes of randomness, and two mints never agree.
    expect(minted.state).not.toBe(mintAuthState().state);
    expect(Buffer.from(minted.state, 'base64url')).toHaveLength(32);
  });
});
