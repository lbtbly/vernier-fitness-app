import { argon2Sync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ARGON2ID_PARAMETERS,
  hashPassword,
  passwordProblems,
  verifyPassword,
} from '@/lib/password';

describe('the backup password', () => {
  it('hashes with Argon2id at the parameters the rubric names', () => {
    const stored = hashPassword('correct horse battery staple 9!');
    expect(stored.passwordAlgorithm).toBe('argon2id');
    expect(stored.passwordMemory).toBeGreaterThanOrEqual(19456);
    expect(stored.passwordPasses).toBeGreaterThanOrEqual(2);
    expect(stored.passwordParallelism).toBe(1);
    expect(stored.passwordTagLength).toBe(32);
    expect(Buffer.from(stored.passwordNonce, 'base64')).toHaveLength(16);
    expect(Buffer.from(stored.passwordTag, 'base64')).toHaveLength(32);
  });

  it('gives every owner a different nonce, so two identical passwords do not share a tag', () => {
    const first = hashPassword('the same password twice 1!');
    const second = hashPassword('the same password twice 1!');
    expect(first.passwordNonce).not.toBe(second.passwordNonce);
    expect(first.passwordTag).not.toBe(second.passwordTag);
  });

  it('verifies the right password and refuses the wrong one', () => {
    const stored = hashPassword('a long enough password 7!');
    expect(verifyPassword('a long enough password 7!', stored)).toBe(true);
    expect(verifyPassword('a long enough password 7?', stored)).toBe(false);
    expect(verifyPassword('', stored)).toBe(false);
  });

  it('reads its parameters from the row and not from the constants', () => {
    // A row written under a lower cost still verifies, which is what lets the
    // cost be raised later without locking anyone out.
    const cheaper = {
      ...hashPassword('unused'),
    };
    const nonce = Buffer.from(cheaper.passwordNonce, 'base64');
    const tag = argon2Sync('argon2id', {
      message: Buffer.from('written under an older cost 3!', 'utf8'),
      nonce,
      parallelism: 1,
      tagLength: 32,
      memory: 8192,
      passes: 3,
    });
    const row = {
      passwordTag: tag.toString('base64'),
      passwordNonce: cheaper.passwordNonce,
      passwordAlgorithm: 'argon2id',
      passwordMemory: 8192,
      passwordPasses: 3,
      passwordParallelism: 1,
      passwordTagLength: 32,
    };
    expect(verifyPassword('written under an older cost 3!', row)).toBe(true);
    expect(verifyPassword('something else entirely 3!', row)).toBe(false);
    expect(row.passwordMemory).not.toBe(ARGON2ID_PARAMETERS.memory);
  });

  it('refuses an algorithm it does not verify, rather than returning false quietly', () => {
    const stored = { ...hashPassword('a long enough password 7!'), passwordAlgorithm: 'bcrypt' };
    expect(() => verifyPassword('a long enough password 7!', stored)).toThrow(/argon2id/);
  });

  it('states every reason a password is refused', () => {
    expect(passwordProblems('short1!')).toContainEqual(expect.stringContaining('At least 12'));
    expect(passwordProblems('alllowercaseletters')).toContainEqual(
      expect.stringContaining('Three of these four'),
    );
    expect(passwordProblems('aaaaaaaaaaaaaaaa')).toContainEqual(
      expect.stringContaining('One character repeated'),
    );
    expect(passwordProblems('A properly long one 42!')).toEqual([]);
  });
});
