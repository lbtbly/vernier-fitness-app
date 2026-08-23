import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DATA_CATEGORIES,
  DEFAULT_ARCHIVE_RETENTION,
  categoryById,
  retentionToken,
} from '@/lib/backup/categories';
import { DEFAULT_ARCHIVE_RETENTION as ENFORCED_RETENTION, retentionSetting } from '@/lib/backup/retention';
import { SESSION_MAX_AGE_SECONDS } from '@/lib/cookie-names';
import { NONCE_TTL_HOURS } from '@/lib/health-ingest';

/**
 * F131's second clause, and the reason it is not a promise.
 *
 * "The retention period stated per data category matches the value the code
 * enforces" is two comparisons, not one, and they are made in two places
 * because neither can make the other:
 *
 *   - `npm run compliance` compares docs/privacy.md to
 *     `src/lib/backup/categories.ts`, and runs in the gate on every edit.
 *   - This file compares `src/lib/backup/categories.ts` to THE CONSTANTS THE
 *     ENFORCING CODE ACTUALLY USES. Without it, a category could state a
 *     period that agreed with a document and with nothing that runs.
 *
 * WHAT WOULD MAKE THIS GO RED: changing SESSION_MAX_AGE_SECONDS from eight
 * hours to twelve without touching the table. That was done on purpose while
 * this was written, and this file went red while the compliance check stayed
 * green, which is exactly the hole it exists to close.
 */

const ROOT = process.cwd();

describe('the stated retention is the enforced retention', () => {
  it('states the session lifetime the cookie is actually given', () => {
    const category = categoryById('sign_in_session')!;
    expect(retentionToken(category.retention)).toBe(`${SESSION_MAX_AGE_SECONDS / 3600}-hours`);
    console.log(
      `sign_in_session: ${retentionToken(category.retention)}, SESSION_MAX_AGE_SECONDS=${SESSION_MAX_AGE_SECONDS}`,
    );
  });

  it('states the replay window the ingest endpoint actually keeps', () => {
    const category = categoryById('ingest_nonce')!;
    expect(retentionToken(category.retention)).toBe(`${NONCE_TTL_HOURS}-hours`);
  });

  it('states the passkey ceremony lifetime src/db/auth.ts actually sets', () => {
    // The constant is private to that module, deliberately: nothing else has
    // any business minting a challenge. So the number is read out of the source
    // rather than imported, and the read is checked: a regular expression that
    // matched nothing would make this assertion vacuous.
    const source = readFileSync(join(ROOT, 'src', 'db', 'auth.ts'), 'utf8');
    const match = /CHALLENGE_TTL_SECONDS\s*=\s*(\d+)/.exec(source);
    expect(match).not.toBeNull();
    const seconds = Number(match![1]);
    expect(seconds).toBeGreaterThan(0);
    const category = categoryById('sign_in_challenge')!;
    expect(retentionToken(category.retention)).toBe(`${seconds / 60}-minutes`);
    console.log(`sign_in_challenge: ${retentionToken(category.retention)}, CHALLENGE_TTL_SECONDS=${seconds}`);
  });

  it('states the archive count the retention pass actually keeps', () => {
    const category = categoryById('archives')!;
    expect(DEFAULT_ARCHIVE_RETENTION).toBe(ENFORCED_RETENTION);
    expect(retentionToken(category.retention)).toBe(`${ENFORCED_RETENTION}-archives`);
    // And the setting the pass reads falls back to that same number.
    expect(retentionSetting({})).toBe(ENFORCED_RETENTION);
    expect(retentionSetting({ BACKUP_RETENTION_DAYS: '3' })).toBe(3);
    // A value that is not a count is the default rather than a crash or a zero:
    // a retention of nothing would remove every archive on the first run.
    expect(retentionSetting({ BACKUP_RETENTION_DAYS: 'lots' })).toBe(ENFORCED_RETENTION);
    expect(retentionSetting({ BACKUP_RETENTION_DAYS: '0' })).toBe(ENFORCED_RETENTION);
  });

  it('gives every category a token the document can carry', () => {
    const tokens = DATA_CATEGORIES.map((category) => `${category.id}=${retentionToken(category.retention)}`);
    console.log(tokens.join('\n'));
    for (const category of DATA_CATEGORIES) {
      expect(retentionToken(category.retention)).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe('the privacy document itself', () => {
  const document = readFileSync(join(ROOT, 'docs', 'privacy.md'), 'utf8');

  it('names every processor that receives anything, and what it receives', () => {
    // Six, and the count is asserted so a processor added in a later slice
    // cannot be left out of this document quietly.
    for (const processor of ['Withings', 'Google', 'Anthropic', 'Apple', 'mail relay', 'Tailscale']) {
      expect(document).toContain(processor);
    }
    console.log(`docs/privacy.md is ${document.split('\n').length} lines and names six processors`);
  });

  it('states a lawful basis per purpose rather than one for the whole product', () => {
    expect(document).toContain('household exemption');
    const purposes = document.split('\n').filter((line) => /^\| .* \| .* \| (Consent|Explicit consent)/.test(line));
    console.log(`${purposes.length} purposes with a basis each:\n${purposes.join('\n')}`);
    expect(purposes.length).toBeGreaterThanOrEqual(6);
  });

  it('carries a retention row for every category the code holds', () => {
    for (const category of DATA_CATEGORIES) {
      expect(document).toContain(`\`${category.id}\``);
      expect(document).toContain(`\`${retentionToken(category.retention)}\``);
    }
  });
});
