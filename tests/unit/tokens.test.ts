import { describe, expect, it } from 'vitest';
import { hashSessionToken, mintToken, tokensMatch } from '@/lib/tokens';

describe('session and anti-forgery tokens', () => {
  it('mints 32 bytes and never the same value twice', () => {
    const first = mintToken();
    const second = mintToken();
    expect(Buffer.from(first, 'base64url')).toHaveLength(32);
    expect(first).not.toBe(second);
  });

  it('stores a hash, not the token', () => {
    const token = mintToken();
    const stored = hashSessionToken(token);
    expect(stored).not.toBe(token);
    expect(hashSessionToken(token)).toBe(stored);
    expect(Buffer.from(stored, 'base64url')).toHaveLength(32);
  });

  it('matches only an identical token, and survives a length mismatch', () => {
    const token = mintToken();
    expect(tokensMatch(token, token)).toBe(true);
    expect(tokensMatch(token, mintToken())).toBe(false);
    expect(tokensMatch(token, token.slice(0, 10))).toBe(false);
    expect(tokensMatch(token, '')).toBe(false);
    expect(tokensMatch(undefined, token)).toBe(false);
    expect(tokensMatch(null, null)).toBe(false);
  });
});
