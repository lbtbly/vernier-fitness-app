import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MasterKeyMismatchError,
  MasterKeyMissingError,
  assertMasterKey,
  masterKeyFingerprint,
  openSecret,
  sealSecret,
} from '@/lib/master-key';

const NAME = 'MASTER_KEY';
const keyA = randomBytes(32).toString('base64url');
const keyB = randomBytes(32).toString('base64url');
const original = process.env[NAME];

beforeEach(() => {
  process.env[NAME] = keyA;
});

afterEach(() => {
  if (original === undefined) delete process.env[NAME];
  else process.env[NAME] = original;
});

describe('the master key', () => {
  it('refuses to boot when it is absent, with a named error', () => {
    delete process.env[NAME];
    expect(() => assertMasterKey()).toThrow(MasterKeyMissingError);
    expect(() => assertMasterKey()).toThrow(/is not set/);
  });

  it('refuses a key that is not 32 bytes, naming what it read', () => {
    process.env[NAME] = 'too-short';
    expect(() => assertMasterKey()).toThrow(/not 32 bytes/);
  });

  it('passes its own encrypt and decrypt self test at boot', () => {
    expect(assertMasterKey()).toBe(masterKeyFingerprint());
  });

  it('round trips a credential', () => {
    const sealed = sealSecret('withings-refresh-token-value', 'withings');
    expect(openSecret(sealed, 'withings')).toBe('withings-refresh-token-value');
  });

  it('stores no plaintext anywhere in the sealed record', () => {
    const secret = 'a-credential-nobody-should-see';
    const sealed = sealSecret(secret, 'withings');
    expect(JSON.stringify(sealed)).not.toContain(secret);
    expect(Buffer.from(sealed.nonce, 'base64')).toHaveLength(12);
    expect(Buffer.from(sealed.tag, 'base64')).toHaveLength(16);
  });

  it('fails loudly under a different key, and never returns an empty value', () => {
    const sealed = sealSecret('withings-refresh-token-value', 'withings');
    process.env[NAME] = keyB;
    expect(() => openSecret(sealed, 'withings')).toThrow(MasterKeyMismatchError);
    try {
      openSecret(sealed, 'withings');
      expect.unreachable('opening under the wrong key must throw');
    } catch (error) {
      expect((error as Error).message).toContain('does not decrypt the stored withings credential');
      expect((error as Error).message).toContain(masterKeyFingerprint());
    }
  });

  it('refuses a ciphertext moved from one integration row into another', () => {
    const sealed = sealSecret('the google refresh token', 'google_calendar');
    expect(() => openSecret(sealed, 'withings')).toThrow(MasterKeyMismatchError);
  });

  it('refuses a tampered ciphertext rather than returning something', () => {
    const sealed = sealSecret('the mail relay password', 'mail_relay');
    const bytes = Buffer.from(sealed.ciphertext, 'base64');
    bytes[0] ^= 0xff;
    expect(() =>
      openSecret({ ...sealed, ciphertext: bytes.toString('base64') }, 'mail_relay'),
    ).toThrow(/authentication tag did not verify/);
  });

  it('fingerprints two keys differently, which is how a mismatch is named', () => {
    const first = masterKeyFingerprint();
    process.env[NAME] = keyB;
    expect(masterKeyFingerprint()).not.toBe(first);
  });
});
