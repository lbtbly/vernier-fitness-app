import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MOVEMENTS } from '@/lib/catalogue';

/**
 * F66, and the 38 cards that drew nothing in a basement.
 *
 * The worker precached six shell assets. The catalogue's images carry
 * `loading=lazy`, so a demonstration was fetched the moment it scrolled into
 * view and cached on the way past, which means the only ones that survived the
 * network going away were the ones the owner had already looked at while
 * online. Measured on the shipped build: 6 of 44 rendered offline. A catalogue
 * that works only for the movements you have already seen is not a catalogue
 * you can take into a gym with no signal.
 *
 * The fix is a precache of the whole 3.54 MB layer at install, generated into
 * public/sw.js from the same manifest the cards render from. These tests grade
 * that generation. What proves the bytes are really on the device is
 * tests/e2e/catalogue-offline.spec.ts, which takes the origin away and renders
 * a movement it never scrolled to.
 */

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const worker = readFileSync(`${projectRoot}public/sw.js`, 'utf8');
const manifest: Array<{ movement: string; path: string; embeddingMode: string; bytes: number }> =
  JSON.parse(readFileSync(`${projectRoot}src/data/movement-media.json`, 'utf8'));

/** The generated MEDIA array, read back out of the worker as the browser sees it. */
function mediaInWorker(): string[] {
  const opens = worker.indexOf('const MEDIA = [');
  const closes = worker.indexOf('];', opens);
  expect(opens, 'public/sw.js carries no generated MEDIA list').toBeGreaterThan(-1);
  return [...worker.slice(opens, closes).matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

describe('every bundled demonstration is on the phone before it is needed', () => {
  it('precaches all of them, and prints the population it covers', () => {
    // WHAT WOULD MAKE THIS RED: adding a movement to
    // src/data/movement-media.json without running `npm run sw`. The card would
    // render online and draw nothing in a basement, which is exactly the state
    // this file exists to close, and `npm run sw:check` in the gate goes red for
    // the same edit.
    const bundled = manifest.filter((record) => record.embeddingMode === 'bundled');
    const precached = mediaInWorker();
    const missing = bundled.filter((record) => !precached.includes(record.path));
    const bytes = bundled.reduce((total, record) => total + record.bytes, 0);
    console.log(
      `sw-precache: ${bundled.length} bundled demonstrations, ${precached.length} precached, ` +
        `${(bytes / 1024 / 1024).toFixed(2)} MB, ${missing.length} missing`,
    );
    console.log(`sw-precache: ${precached.join(', ')}`);
    // The floor F66 states, so a clean comparison over an empty manifest fails.
    expect(bundled.length).toBeGreaterThanOrEqual(30);
    expect(missing.map((record) => record.path)).toEqual([]);
    expect(precached).toHaveLength(bundled.length);
  });

  it('covers every movement the catalogue can draw a card for', () => {
    // The other direction. The list above proves the worker holds what the
    // manifest names; this proves the manifest names what the screen renders,
    // so a movement with no media cannot hide between the two.
    const withMedia = new Set(manifest.map((record) => record.movement));
    const uncovered = MOVEMENTS.filter((movement) => !withMedia.has(movement.id)).map(
      (movement) => movement.id,
    );
    console.log(`sw-precache: ${MOVEMENTS.length} movements, ${uncovered.length} with no media`);
    expect(MOVEMENTS.length).toBeGreaterThanOrEqual(30);
    expect(uncovered).toEqual([]);
  });

  it('fills the cache at install and keeps it across a shell version bump', () => {
    // WHAT WOULD MAKE THIS RED: dropping the precache out of the install event,
    // which is the state the worker shipped in, or folding the demonstrations
    // back into the shell cache, where the next version bump throws 3.5 MB away
    // and re-fetches it over whatever link the phone happens to be on.
    expect(worker).toContain('await precacheMedia();');
    expect(worker).toMatch(/const MEDIA_CACHE = `vernier-media-\$\{MEDIA_VERSION\}`/);
    expect(worker).toMatch(/const keep = new Set\(\[SHELL, MEDIA_CACHE\]\)/);
    // And the repair path, for an install that ran before the owner signed in.
    expect(worker).toContain("if (event.data === 'PRECACHE_MEDIA') event.waitUntil(precacheMedia());");
  });

  it('reads a demonstration back by path, ignoring Vary', () => {
    // WHAT WOULD MAKE THIS RED: looking a demonstration up with the img
    // element's own Request. The precache fetched it with fetch(), which sends
    // `Accept: */*`, and the card asks with an image Accept list, so any Vary
    // on the response makes those two different cache keys and the precached
    // bytes are a miss at the moment the network is gone.
    expect(worker).toContain(
      'await caches.match(url.pathname, { cacheName: MEDIA_CACHE, ignoreVary: true })',
    );
  });

  it('refuses to cache a redirect as if it were a demonstration', () => {
    // /movements is behind the session gate, so an install on the sign-in
    // screen fetches 44 redirects that answer 200 with an HTML document. Caching
    // one would poison the entry until the manifest changed, and the card would
    // draw nothing offline while the cache reported a hit. It would go red if
    // the response check went back to `response.ok` alone.
    expect(worker).toContain('if (!response.ok || response.redirected || response.type !== \'basic\') continue;');
  });
});
