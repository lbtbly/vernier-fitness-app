import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

/**
 * F113's third clause, walked: only the public half of the key pair is ever
 * present in anything the browser receives.
 *
 * HOW IT IS HELD RATHER THAN HOPED. `VAPID_PRIVATE_KEY` is read in exactly one
 * file, `src/lib/push/keys.ts`, and used in exactly one other,
 * `src/db/push.ts`, which is the transport. Nothing marked `'use client'` names
 * it, so nothing that Next sends to a browser can carry it. Next only inlines
 * `NEXT_PUBLIC_*` into a client bundle, which is the platform half of the same
 * guarantee; this is the half a person can break by hand.
 *
 * WHAT WOULD MAKE THIS GO RED. Passing the pair rather than the public key into
 * a component to "save a round trip", or logging the key to diagnose a 403. The
 * walk prints the files it read and the population it covered, because a search
 * that finds nothing over nothing is a search that proves nothing.
 */

const SRC = fileURLToPath(new URL('../../src', import.meta.url));

/** Every readable source file under src/, so a new directory is covered the day it exists. */
async function walk(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(path)));
    else if (['.ts', '.tsx'].includes(extname(entry.name))) found.push(path);
  }
  return found;
}

describe('the private half of the VAPID pair', () => {
  test('is named in one file, and that file is not a client component', async () => {
    const files = await walk(SRC);
    const naming: string[] = [];
    let clientComponents = 0;
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      if (source.trimStart().startsWith("'use client'")) clientComponents += 1;
      if (source.includes('VAPID_PRIVATE_KEY')) naming.push(relative(SRC, file));
    }
    console.log(`walked ${files.length} source file(s) under src/, of which ${clientComponents} are client components`);
    console.log(`files naming VAPID_PRIVATE_KEY: ${naming.join(', ')}`);
    // The population is not empty and the walk is not vacuous.
    expect(files.length).toBeGreaterThan(100);
    expect(clientComponents).toBeGreaterThan(10);
    expect(naming).toEqual(['lib/push/keys.ts']);
  });

  test('no client component reads the pair, by any name', async () => {
    const files = await walk(SRC);
    const offenders: string[] = [];
    let walked = 0;
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      if (!source.trimStart().startsWith("'use client'")) continue;
      walked += 1;
      if (/privateKey|VAPID_PRIVATE|pushKeys\s*\(/.test(source)) offenders.push(relative(SRC, file));
    }
    console.log(`walked ${walked} client component(s); ${offenders.length} name the private half`);
    expect(walked).toBeGreaterThan(10);
    expect(offenders).toEqual([]);
  });

  test('the transport is the only caller of pushKeys()', async () => {
    const files = await walk(SRC);
    const callers: string[] = [];
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      if (relative(SRC, file) === 'lib/push/keys.ts') continue;
      if (/\bpushKeys\s*\(/.test(source)) callers.push(relative(SRC, file));
    }
    console.log(`callers of pushKeys(): ${callers.join(', ')}`);
    expect(callers).toEqual(['db/push.ts']);
  });
});

describe('the refusal when the pair is absent', () => {
  test('pushKeys returns a refusal rather than an empty pair', async () => {
    const before = { pub: process.env.VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY };
    try {
      delete process.env.VAPID_PUBLIC_KEY;
      delete process.env.VAPID_PRIVATE_KEY;
      const { pushKeys, pushKeysPresent, publicPushKey } = await import('@/lib/push/keys');
      expect(pushKeysPresent()).toBe(false);
      expect(publicPushKey()).toBeNull();
      const result = pushKeys();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      console.log(`absent pair refuses with: ${result.error}`);
      expect(result.detail).toContain('gen-vapid');
    } finally {
      if (before.pub === undefined) delete process.env.VAPID_PUBLIC_KEY;
      else process.env.VAPID_PUBLIC_KEY = before.pub;
      if (before.priv === undefined) delete process.env.VAPID_PRIVATE_KEY;
      else process.env.VAPID_PRIVATE_KEY = before.priv;
    }
  });

  test('a half-filled pair is refused, not half-used', async () => {
    const before = { pub: process.env.VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY };
    try {
      process.env.VAPID_PUBLIC_KEY = 'BPublicHalfOnly';
      delete process.env.VAPID_PRIVATE_KEY;
      const { pushKeys, pushKeysPresent } = await import('@/lib/push/keys');
      expect(pushKeysPresent()).toBe(false);
      expect(pushKeys().ok).toBe(false);
    } finally {
      if (before.pub === undefined) delete process.env.VAPID_PUBLIC_KEY;
      else process.env.VAPID_PUBLIC_KEY = before.pub;
      if (before.priv === undefined) delete process.env.VAPID_PRIVATE_KEY;
      else process.env.VAPID_PRIVATE_KEY = before.priv;
    }
  });

  test('a whole pair is read back, and the public half is what a page gets', async () => {
    const before = { pub: process.env.VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY };
    try {
      process.env.VAPID_PUBLIC_KEY = 'BPublicHalf';
      process.env.VAPID_PRIVATE_KEY = 'PrivateHalf';
      const { pushKeys, publicPushKey } = await import('@/lib/push/keys');
      expect(publicPushKey()).toBe('BPublicHalf');
      const result = pushKeys();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.keys.publicKey).toBe('BPublicHalf');
      expect(result.keys.subject.startsWith('mailto:')).toBe(true);
    } finally {
      if (before.pub === undefined) delete process.env.VAPID_PUBLIC_KEY;
      else process.env.VAPID_PUBLIC_KEY = before.pub;
      if (before.priv === undefined) delete process.env.VAPID_PRIVATE_KEY;
      else process.env.VAPID_PRIVATE_KEY = before.priv;
    }
  });
});
