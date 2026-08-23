import { describe, expect, test } from 'vitest';
import {
  LAST_POSTED_KEY,
  isWireSubscription,
  mustRepost,
  repostDecision,
} from '@/lib/push/subscription';

/**
 * F116's second half: the app re-reads its subscription on every launch and
 * re-posts it when the endpoint differs from the last one sent.
 *
 * WHY IT EXISTS AT ALL. `ServiceWorkerGlobalScope.pushsubscriptionchange` is
 * `false` for `safari_ios` in browser-compat-data, checked 2026-08-21. The
 * subscription rotates and NOTHING TELLS ANYBODY: not the page, not the worker,
 * not the push service. Every send after it lands on an endpoint the service no
 * longer recognises, and the only symptom is silence.
 *
 * WHAT WOULD MAKE THIS GO RED. Reading the decision as "post when there is a
 * subscription", which posts on every launch forever, or as "post when there is
 * no marker", which never notices a rotation. Three cases, and two of them are
 * easy to get backwards, so all four are asserted.
 */

describe('whether this launch has to re-post', () => {
  test('nothing local means nothing to post', () => {
    expect(repostDecision(null, null)).toBe('none');
    expect(repostDecision(null, 'https://web.push.apple.com/old')).toBe('none');
    expect(mustRepost('none')).toBe(false);
  });

  test('a first subscription on this device is posted', () => {
    expect(repostDecision('https://web.push.apple.com/new', null)).toBe('first');
    expect(mustRepost('first')).toBe(true);
  });

  test('a rotated endpoint is posted, which is the whole point', () => {
    const decision = repostDecision(
      'https://web.push.apple.com/new-token',
      'https://web.push.apple.com/old-token',
    );
    console.log(`rotation decision: ${decision}`);
    expect(decision).toBe('rotated');
    expect(mustRepost('rotated')).toBe(true);
  });

  test('the same endpoint says nothing, which is the common case', () => {
    const endpoint = 'https://web.push.apple.com/same-token';
    expect(repostDecision(endpoint, endpoint)).toBe('unchanged');
    expect(mustRepost('unchanged')).toBe(false);
  });

  test('the marker key is one value, so two components cannot disagree about it', () => {
    expect(LAST_POSTED_KEY).toBe('vernier.push-endpoint');
  });
});

describe('what this machine will store', () => {
  const GOOD = {
    endpoint: 'https://web.push.apple.com/one-abcdefghijkl',
    keys: { p256dh: 'BP256', auth: 'AUTH' },
    applicationServerKey: 'BServerKey',
  };

  test('a whole subscription is accepted', () => {
    expect(isWireSubscription(GOOD)).toBe(true);
  });

  test('every missing part is refused, one at a time', () => {
    const broken = [
      { ...GOOD, endpoint: '' },
      { ...GOOD, endpoint: 'http://web.push.apple.com/one' },
      { ...GOOD, keys: { p256dh: '', auth: 'AUTH' } },
      { ...GOOD, keys: { p256dh: 'BP256', auth: '' } },
      { ...GOOD, applicationServerKey: '' },
      null,
      undefined,
      'a string',
      42,
    ];
    const refused = broken.filter((candidate) => !isWireSubscription(candidate));
    console.log(`walked ${broken.length} malformed bodies; ${refused.length} refused`);
    expect(broken).toHaveLength(9);
    expect(refused).toHaveLength(9);
  });
});
