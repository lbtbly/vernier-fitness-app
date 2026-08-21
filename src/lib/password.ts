import { argon2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The backup password. Argon2id through Node's own crypto, which has carried it
 * since 24.7 and needs no package, no install script and no prebuilt binary on
 * arm64.
 *
 * The parameters below are what a new hash is written with. A verification
 * never reads them: it reads the numbers stored on the owner row, so raising
 * the cost later re-hashes on the next sign-in instead of locking out the
 * password that was set under the old cost.
 */
export const ARGON2ID_PARAMETERS = {
  algorithm: 'argon2id',
  /** OWASP's stated minimum, 19 MiB. */
  memory: 19456,
  passes: 2,
  parallelism: 1,
  tagLength: 32,
  nonceBytes: 16,
} as const;

export type StoredPassword = {
  passwordTag: string;
  passwordNonce: string;
  passwordAlgorithm: string;
  passwordMemory: number;
  passwordPasses: number;
  passwordParallelism: number;
  passwordTagLength: number;
};

export const PASSWORD_MINIMUM_LENGTH = 12;
const PASSWORD_MAXIMUM_LENGTH = 256;

/**
 * Complexity, stated as the reasons a password is refused. The list is the copy
 * the screen renders, so the rule and the sentence the owner reads cannot drift
 * apart.
 */
export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MINIMUM_LENGTH) {
    problems.push(`At least ${PASSWORD_MINIMUM_LENGTH} characters. You typed ${password.length}.`);
  }
  if (password.length > PASSWORD_MAXIMUM_LENGTH) {
    problems.push(`At most ${PASSWORD_MAXIMUM_LENGTH} characters.`);
  }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(password),
  ).length;
  if (classes < 3) {
    problems.push('Three of these four: a lower case letter, a capital, a digit, a symbol.');
  }
  if (password.length > 0 && /^(.)\1+$/.test(password)) {
    problems.push('One character repeated is not a password.');
  }
  return problems;
}

export function hashPassword(password: string): StoredPassword {
  const nonce = randomBytes(ARGON2ID_PARAMETERS.nonceBytes);
  const tag = argon2Sync('argon2id', {
    message: Buffer.from(password, 'utf8'),
    nonce,
    parallelism: ARGON2ID_PARAMETERS.parallelism,
    tagLength: ARGON2ID_PARAMETERS.tagLength,
    memory: ARGON2ID_PARAMETERS.memory,
    passes: ARGON2ID_PARAMETERS.passes,
  });
  return {
    passwordTag: tag.toString('base64'),
    passwordNonce: nonce.toString('base64'),
    passwordAlgorithm: ARGON2ID_PARAMETERS.algorithm,
    passwordMemory: ARGON2ID_PARAMETERS.memory,
    passwordPasses: ARGON2ID_PARAMETERS.passes,
    passwordParallelism: ARGON2ID_PARAMETERS.parallelism,
    passwordTagLength: ARGON2ID_PARAMETERS.tagLength,
  };
}

/**
 * Every parameter comes off the row. Nothing here reads the constants above,
 * which is the point: the cost that verifies a password is the cost it was
 * written with, and F10 grades the numbers it can see in the row.
 */
export function verifyPassword(password: string, stored: StoredPassword): boolean {
  if (stored.passwordAlgorithm !== 'argon2id') {
    throw new Error(
      `The stored password names algorithm ${stored.passwordAlgorithm}, and this build verifies argon2id only.`,
    );
  }
  const expected = Buffer.from(stored.passwordTag, 'base64');
  const candidate = argon2Sync('argon2id', {
    message: Buffer.from(password, 'utf8'),
    nonce: Buffer.from(stored.passwordNonce, 'base64'),
    parallelism: stored.passwordParallelism,
    tagLength: stored.passwordTagLength,
    memory: stored.passwordMemory,
    passes: stored.passwordPasses,
  });
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
