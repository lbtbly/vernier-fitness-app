import { describe, expect, it } from 'vitest';
import { counterIsAcceptable, counterToStore } from '@/lib/webauthn';

/**
 * The single most likely way to ship a passkey implementation that works on the
 * Mac and bricks the iPhone.
 *
 * A passkey synced through iCloud Keychain reports a signature counter of 0 on
 * every assertion, forever. A strictly-increasing replay check accepts the
 * first one and refuses every one after it.
 */
describe('the signature counter', () => {
  it('accepts a synced passkey reporting zero, over and over', () => {
    let stored = 0;
    for (let use = 1; use <= 10; use += 1) {
      const reported = 0;
      expect(counterIsAcceptable(stored, reported)).toBe(true);
      stored = counterToStore(reported);
      expect(stored).toBe(0);
    }
  });

  it('stores what the authenticator reported and never synthesises an increment', () => {
    expect(counterToStore(0)).toBe(0);
    expect(counterToStore(1)).toBe(1);
    expect(counterToStore(41)).toBe(41);
  });

  it('still refuses a replay from an authenticator that does count', () => {
    expect(counterIsAcceptable(5, 6)).toBe(true);
    expect(counterIsAcceptable(5, 5)).toBe(false);
    expect(counterIsAcceptable(5, 4)).toBe(false);
  });

  it('refuses a counter that goes back to zero after counting', () => {
    expect(counterIsAcceptable(5, 0)).toBe(false);
  });

  it('accepts the first assertion from a counting authenticator', () => {
    expect(counterIsAcceptable(0, 1)).toBe(true);
  });
});
