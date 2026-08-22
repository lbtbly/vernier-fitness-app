import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ARGON2ID_PARAMETERS } from '@/lib/password';

/**
 * The Argon2id cost is written down twice.
 *
 * `src/lib/password.ts` holds it for the app. `scripts/recovery.sh` restates it,
 * because the script runs inside the container against a runtime image that has
 * no importable module to reach for. Two copies of a number is how two numbers
 * start. Verification reads the cost off the stored row, so a divergence would
 * not lock the owner out, it would quietly write a row costed differently from
 * every other one and nothing would ever say so.
 *
 * So this says so. It reads the numbers out of the shell script and compares
 * them with the constants the app hashes under. A regex that stops matching
 * fails the test rather than passing on an empty search, because a test that
 * cannot find what it grades is not a passing test.
 */

const scriptPath = fileURLToPath(new URL('../../scripts/recovery.sh', import.meta.url));
const script = readFileSync(scriptPath, 'utf8');

/** One heredoc-style block of the script, by the shell variable that holds it. */
function block(name: string): string {
  const match = script.match(new RegExp(`${name}='([\\s\\S]*?)\\n'\\n`));
  expect(match, `scripts/recovery.sh no longer defines ${name}`).not.toBeNull();
  return match![1];
}

function digits(source: string, pattern: RegExp, what: string): number[] {
  const match = source.match(pattern);
  expect(match, `scripts/recovery.sh no longer states ${what}`).not.toBeNull();
  return match!.slice(1).map(Number);
}

const passwordScript = block('PASSWORD_SCRIPT');

describe('the Argon2id parameters, in both places that hold them', () => {
  it('hashes a recovery password at exactly the cost the app hashes at', () => {
    const [memory] = digits(passwordScript, /memory:\s*(\d+)/, 'a memory');
    const [passes] = digits(passwordScript, /passes:\s*(\d+)/, 'a pass count');
    const [parallelism] = digits(passwordScript, /parallelism:\s*(\d+)/, 'a parallelism');
    const [tagLength] = digits(passwordScript, /tagLength:\s*(\d+)/, 'a tag length');
    const [nonceBytes] = digits(passwordScript, /randomBytes\((\d+)\)/, 'a nonce size');

    expect(memory).toBe(ARGON2ID_PARAMETERS.memory);
    expect(passes).toBe(ARGON2ID_PARAMETERS.passes);
    expect(parallelism).toBe(ARGON2ID_PARAMETERS.parallelism);
    expect(tagLength).toBe(ARGON2ID_PARAMETERS.tagLength);
    expect(nonceBytes).toBe(ARGON2ID_PARAMETERS.nonceBytes);
    expect(passwordScript).toContain(`"${ARGON2ID_PARAMETERS.algorithm}"`);
  });

  it('stores on the owner row the same numbers it hashed with', () => {
    // update owner set ... values ["argon2id", memory, passes, parallelism, tag]
    const [memory, passes, parallelism, tagLength] = digits(
      passwordScript,
      /"argon2id",\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),/,
      'the parameter columns it writes',
    );

    expect(memory).toBe(ARGON2ID_PARAMETERS.memory);
    expect(passes).toBe(ARGON2ID_PARAMETERS.passes);
    expect(parallelism).toBe(ARGON2ID_PARAMETERS.parallelism);
    expect(tagLength).toBe(ARGON2ID_PARAMETERS.tagLength);
  });

  it('tells the operator the cost it actually used', () => {
    const [memory, passes, parallelism, nonceBytes] = digits(
      passwordScript,
      /Argon2id m=(\d+) t=(\d+) p=(\d+), (\d+)-byte nonce/,
      'the line it prints when the password is set',
    );

    expect(memory).toBe(ARGON2ID_PARAMETERS.memory);
    expect(passes).toBe(ARGON2ID_PARAMETERS.passes);
    expect(parallelism).toBe(ARGON2ID_PARAMETERS.parallelism);
    expect(nonceBytes).toBe(ARGON2ID_PARAMETERS.nonceBytes);
  });

  it('holds the app to the floor F10 names, so agreeing on a weaker cost is not a pass', () => {
    expect(ARGON2ID_PARAMETERS.memory).toBeGreaterThanOrEqual(19456);
    expect(ARGON2ID_PARAMETERS.passes).toBeGreaterThanOrEqual(2);
    expect(ARGON2ID_PARAMETERS.parallelism).toBe(1);
    expect(ARGON2ID_PARAMETERS.tagLength).toBe(32);
    expect(ARGON2ID_PARAMETERS.nonceBytes).toBe(16);
  });
});
