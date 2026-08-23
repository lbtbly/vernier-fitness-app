import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { strings } from '@/lib/strings';

/**
 * F115's first clause, run against the shipped worker: a notification on every
 * push it receives.
 *
 * WHY THIS IS WORTH A TEST RATHER THAN A READ. WebKit: "Violations of the
 * userVisibleOnly promise will result in a push subscription being revoked."
 * Apple: "If you don't [present the notification], Safari revokes the push
 * notification permission for your site." AN EXCEPTION IN THE HANDLER COUNTS.
 * So the cost of one branch through this handler that shows nothing is not a
 * missed notification: it is the owner's phone quietly and permanently
 * unsubscribing, discovered weeks later.
 *
 * The worker is not a module in the app's graph, so it cannot be imported. It
 * is evaluated here inside a small harness that gives it the four globals it
 * touches, and then driven with every payload shape that has ever reached one:
 * a good one, an empty one, one that fails to parse, one with no title, and one
 * whose `showNotification` throws.
 *
 * WHAT WOULD MAKE THIS GO RED. `if (payload.title) showNotification(...)`,
 * which is exactly what this worker said before this slice and which shows
 * nothing at all for four of the five payloads below.
 */

const WORKER = fileURLToPath(new URL('../../public/sw.js', import.meta.url));

type Shown = { title: string; options: Record<string, unknown> };

type Harness = {
  shown: Shown[];
  push: (data: unknown, options?: { failFirstShow?: boolean }) => Promise<void>;
};

/**
 * Runs the worker's source with a stub `self`, and returns a driver for its
 * `push` listener.
 *
 * Everything the worker reaches for is stubbed to the smallest thing that
 * answers: no caches are exercised, no IndexedDB exists, and `fetch` is never
 * called because the outbox open fails and the drain gives up. That is the
 * point: the notification must still be shown when every one of those is
 * broken, because on a phone off the tailnet most of them are.
 */
function harness(): Harness {
  const shown: Shown[] = [];
  const listeners = new Map<string, (event: unknown) => void>();
  let failNextShow = false;

  const self = {
    location: { origin: 'https://lamberts-mac-mini.tailda76d6.ts.net', host: 'lamberts-mac-mini.tailda76d6.ts.net' },
    addEventListener: (name: string, listener: (event: unknown) => void) => {
      listeners.set(name, listener);
    },
    registration: {
      showNotification: async (title: string, options: Record<string, unknown> = {}) => {
        if (failNextShow) {
          failNextShow = false;
          throw new Error('the platform refused this notification');
        }
        shown.push({ title, options });
      },
    },
    clients: { claim: async () => undefined, matchAll: async () => [], openWindow: async () => null },
    navigator: {},
    skipWaiting: () => undefined,
  };

  const source = readFileSync(WORKER, 'utf8');
  const run = new Function(
    'self',
    'caches',
    'indexedDB',
    'fetch',
    `${source}\nreturn null;`,
  );
  run(
    self,
    { open: async () => ({ addAll: async () => undefined }), keys: async () => [], match: async () => undefined, delete: async () => undefined },
    // No IndexedDB at all, which is the worst case and the one that matters.
    { open: () => { throw new Error('no indexeddb here'); } },
    async () => ({ ok: false, status: 503 }),
  );

  const push = async (data: unknown, options?: { failFirstShow?: boolean }) => {
    failNextShow = options?.failFirstShow ?? false;
    const listener = listeners.get('push');
    if (!listener) throw new Error('the worker registered no push listener');
    let waited: Promise<unknown> = Promise.resolve();
    listener({
      data,
      waitUntil: (promise: Promise<unknown>) => {
        waited = promise;
      },
    });
    await waited;
  };

  return { shown, push };
}

const asJson = (value: unknown) => ({ json: () => value });

describe('the worker shows a notification on every push', () => {
  test('a good payload shows what it carries', async () => {
    const { shown, push } = harness();
    await push(
      asJson({
        title: 'Home strength at 07:00',
        body: 'At home. Tap Done once it is finished.',
        tag: 'vernier-reminders-2026-08-23T20:00',
        url: '/reminders',
        itemIds: ['a'],
      }),
    );
    console.log(`payload with a title showed: ${JSON.stringify(shown[0])}`);
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe('Home strength at 07:00');
    expect(shown[0].options.silent).toBe(false);
    expect(shown[0].options.data).toEqual({ url: '/reminders', itemIds: ['a'] });
  });

  test('five payloads that have all reached a worker, and five notifications', async () => {
    const cases: Array<[string, unknown]> = [
      ['no data at all', undefined],
      ['an empty object', asJson({})],
      ['a body that will not parse', { json: () => { throw new Error('bad json'); } }],
      ['a title that is only whitespace', asJson({ title: '   ', body: 'something' })],
      ['a body with no title', asJson({ body: 'something' })],
    ];
    const results: string[] = [];
    for (const [name, data] of cases) {
      const { shown, push } = harness();
      await push(data);
      results.push(`${name}: ${shown.length} shown, title "${shown[0]?.title}"`);
      expect(shown).toHaveLength(1);
      expect(shown[0].title).toBe(strings.notification.fallbackTitle);
    }
    console.log(results.join('\n'));
    expect(results).toHaveLength(5);
  });

  test('even a refused showNotification ends in a notification', async () => {
    const { shown, push } = harness();
    await push(asJson({ title: 'Home strength at 07:00', body: 'At home.' }), {
      failFirstShow: true,
    });
    console.log(`after a refused show: ${shown.length} shown, title "${shown[0]?.title}"`);
    // The first attempt threw. An exception inside this handler is a
    // userVisibleOnly violation, so the catch shows the plainest thing it can
    // rather than letting the promise settle with nothing on the screen.
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe(strings.notification.fallbackTitle);
    expect(shown[0].options.body).toBe(strings.notification.fallbackBody);
  });

  test('the fallback copy is the catalogue, written through the generated block', () => {
    const source = readFileSync(WORKER, 'utf8');
    expect(source).toContain(strings.notification.fallbackTitle);
    expect(source).toContain(strings.notification.fallbackBody);
    // Inside the block, not written by hand beside it. `npm run sw:check` is
    // the gate step that keeps them equal; this asserts they are in the block
    // at all.
    const open = source.indexOf('// --- generated from src/lib/strings.ts');
    const close = source.indexOf('// --- end generated ---');
    const block = source.slice(open, close);
    expect(block).toContain(strings.notification.fallbackTitle);
  });

  test('there is no branch through the handler that shows nothing', () => {
    const source = readFileSync(WORKER, 'utf8');
    const handler = source.slice(source.indexOf("self.addEventListener('push'"));
    const push = handler.slice(0, handler.indexOf("self.addEventListener('notificationclick'"));
    // The old shape, which this slice replaced: a conditional around the show.
    expect(push).not.toMatch(/if\s*\(\s*payload\.title\s*\)/);
    // Two shows: the real one and the one inside the catch.
    const shows = push.match(/showNotification\(/g) ?? [];
    console.log(`the push handler calls showNotification ${shows.length} time(s)`);
    expect(shows).toHaveLength(2);
  });
});

describe('the tap', () => {
  test('the worker registers a notificationclick listener', () => {
    const source = readFileSync(WORKER, 'utf8');
    expect(source).toContain("self.addEventListener('notificationclick'");
    // The Done action's id, matching the one the payload builder sends.
    expect(source).toContain("event.action === 'done'");
    expect(source).toContain('/api/push/done');
  });
});
