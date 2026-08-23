import { describe, expect, it } from 'vitest';
import type { TokenBundle } from '@/lib/withings/client';
import { CALLBACK_PATH, liveModeIsUnusable, readWithingsSettings } from '@/lib/withings/mode';
import { type RotationWriter, rotateTokens } from '@/lib/withings/rotation';

/**
 * The rotated refresh token replaces the stored one INSIDE THE SAME
 * TRANSACTION as the access token it arrived with.
 *
 * Withings issues a new refresh token on every refresh and kills the old one
 * eight hours later, or the instant the new access token is used, whichever
 * comes first. There is no recovery path for a dead one on the public API: the
 * owner has to sign in to Withings and consent again by hand. A crash between
 * a stored access token and a stored refresh token leaves an installation whose
 * access works for three hours and can never be renewed, and that failure
 * surfaces one sync after the machine that could have explained it rebooted.
 */

function bundle(generation: number): TokenBundle {
  return {
    userId: '12345',
    accessToken: `access-${generation}`,
    refreshToken: `refresh-${generation}`,
    expiresAt: new Date(`2026-08-23T1${generation}:00:00Z`).toISOString(),
    scope: 'user.metrics',
    tokenType: 'a-scheme',
  };
}

type Journal = { log: string[]; written: TokenBundle[] };

function session(journal: Journal, options: { failOnConnection?: boolean } = {}) {
  const writer: RotationWriter = {
    async writeTokens(next) {
      journal.log.push('writeTokens');
      journal.written.push(next);
    },
    async writeConnection() {
      journal.log.push('writeConnection');
      if (options.failOnConnection) throw new Error('the second write failed');
    },
  };
  return async <T>(work: (bound: RotationWriter) => Promise<T>): Promise<T> => {
    journal.log.push('begin');
    try {
      const answer = await work(writer);
      journal.log.push('commit');
      return answer;
    } catch (error) {
      journal.log.push('rollback');
      throw error;
    }
  };
}

describe('rotating the refresh token', () => {
  it('puts both writes inside one transaction and commits them together', async () => {
    const journal: Journal = { log: [], written: [] };
    const outcome = await rotateTokens(
      session(journal),
      bundle(1),
      bundle(2),
      new Date('2026-08-23T10:00:00Z'),
    );

    console.log(`rotation journal: ${journal.log.join(' -> ')}`);
    // WHAT WOULD MAKE THIS GO RED: writing either half outside the session, or
    // opening two sessions. Both look identical from the outside on a machine
    // that never crashes.
    expect(journal.log).toEqual(['begin', 'writeTokens', 'writeConnection', 'commit']);
    expect(journal.log.indexOf('writeTokens')).toBeGreaterThan(journal.log.indexOf('begin'));
    expect(journal.log.indexOf('writeConnection')).toBeLessThan(journal.log.indexOf('commit'));
    expect(outcome.rotated).toBe(true);
  });

  it('replaces the previous refresh token rather than keeping it beside the new one', async () => {
    const journal: Journal = { log: [], written: [] };
    await rotateTokens(session(journal), bundle(1), bundle(2), new Date());
    expect(journal.written).toHaveLength(1);
    expect(journal.written[0].refreshToken).toBe('refresh-2');
    expect(journal.written[0].accessToken).toBe('access-2');
    // The superseded value appears in nothing that was written.
    expect(JSON.stringify(journal.written)).not.toContain('refresh-1');
  });

  it('rolls back the whole rotation when the second write fails', async () => {
    // The half-written state this exists to prevent: a new access token stored
    // beside a refresh token that Withings has already killed.
    const journal: Journal = { log: [], written: [] };
    await expect(
      rotateTokens(session(journal, { failOnConnection: true }), bundle(1), bundle(2), new Date()),
    ).rejects.toThrow('the second write failed');
    expect(journal.log).toEqual(['begin', 'writeTokens', 'writeConnection', 'rollback']);
    expect(journal.log).not.toContain('commit');
  });

  it('reports a first connection as no rotation at all', async () => {
    const journal: Journal = { log: [], written: [] };
    const outcome = await rotateTokens(session(journal), null, bundle(1), new Date());
    expect(outcome.rotated).toBe(false);
    expect(journal.log).toEqual(['begin', 'writeTokens', 'writeConnection', 'commit']);
  });

  it('reports an unchanged refresh token as no rotation', async () => {
    const journal: Journal = { log: [], written: [] };
    const same = bundle(1);
    const outcome = await rotateTokens(session(journal), same, { ...same, accessToken: 'access-9' }, new Date());
    expect(outcome.rotated).toBe(false);
  });
});

describe('which Withings this installation talks to', () => {
  const KEYS = [
    'WITHINGS_MODE',
    'WITHINGS_CLIENT_ID',
    'WITHINGS_CLIENT_SECRET',
    'WITHINGS_REDIRECT_URI',
  ];

  function withEnv<T>(values: Record<string, string | undefined>, work: () => T): T {
    const before = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
    try {
      for (const key of KEYS) delete process.env[key];
      for (const [key, value] of Object.entries(values)) {
        if (value !== undefined) process.env[key] = value;
      }
      return work();
    } finally {
      for (const key of KEYS) {
        if (before[key] === undefined) delete process.env[key];
        else process.env[key] = before[key];
      }
    }
  }

  it('runs the demonstration account when nothing is configured', () => {
    // An installation with no credential must not sit in a live mode that fails
    // every call. "Not connected" and "connected and broken" are different
    // sentences on the status screen and the owner acts differently on each.
    const settings = withEnv({}, () => readWithingsSettings('https://host.tailnet.ts.net'));
    expect(settings.mode).toBe('demo');
    expect(settings.declared).toBe(false);
    expect(liveModeIsUnusable(settings)).toBe(false);
  });

  it('goes live when a complete pair is present, and demo when half of one is', () => {
    expect(
      withEnv({ WITHINGS_CLIENT_ID: 'id', WITHINGS_CLIENT_SECRET: 'secret' }, () =>
        readWithingsSettings('https://host.tailnet.ts.net'),
      ).mode,
    ).toBe('live');
    expect(withEnv({ WITHINGS_CLIENT_ID: 'id' }, () => readWithingsSettings('x')).mode).toBe('demo');
    expect(withEnv({ WITHINGS_CLIENT_SECRET: 's' }, () => readWithingsSettings('x')).mode).toBe('demo');
  });

  it('lets the environment declare the mode outright, either way', () => {
    const forced = withEnv(
      { WITHINGS_MODE: 'demo', WITHINGS_CLIENT_ID: 'id', WITHINGS_CLIENT_SECRET: 'secret' },
      () => readWithingsSettings('https://host.tailnet.ts.net'),
    );
    expect(forced.mode).toBe('demo');
    expect(forced.declared).toBe(true);

    const claimed = withEnv({ WITHINGS_MODE: 'live' }, () => readWithingsSettings('x'));
    expect(claimed.mode).toBe('live');
    // And says so plainly rather than failing every call in silence.
    expect(liveModeIsUnusable(claimed)).toBe(true);
  });

  it('derives the redirect uri from the origin, on the path PREFLIGHT names', () => {
    // Two precedents disagreed. `.forge/PREFLIGHT.md` says /api/withings/callback
    // and .env.example said /api/integrations/withings/callback. PREFLIGHT is
    // the sheet the owner reads while typing the value into a form on somebody
    // else's website, so PREFLIGHT wins and the example file moved.
    expect(CALLBACK_PATH).toBe('/api/withings/callback');
    const derived = withEnv({}, () => readWithingsSettings('https://host.tailnet.ts.net/'));
    expect(derived.redirectUri).toBe('https://host.tailnet.ts.net/api/withings/callback');

    const declared = withEnv({ WITHINGS_REDIRECT_URI: 'http://localhost:3000/api/withings/callback' }, () =>
      readWithingsSettings('https://host.tailnet.ts.net'),
    );
    expect(declared.redirectUri).toBe('http://localhost:3000/api/withings/callback');
  });
});
