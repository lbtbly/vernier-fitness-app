import { describe, expect, test } from 'vitest';
import {
  MINIMUM_IOS,
  PUSH_CHECK_COUNT,
  PUSH_CHECK_IDS,
  type PushFacts,
  firstFailure,
  platformVersionOf,
  pushDiagnostics,
} from '@/lib/push/diagnostics';

/**
 * F114's second half: eleven rows, each with its own remedy, stopping at the
 * first failure.
 *
 * WHAT WOULD MAKE THIS GO RED. Rendering every row's answer regardless, which
 * is what a naive map over the checks produces. A phone in a Safari tab fails
 * seven of them at once and a screen showing seven remedies has told nobody
 * anything. It would also go red if a row below a failure were reported as
 * PASSED rather than as not checked, which is the same defect this project has
 * now found seven times: a check that did not run, reported as one that did.
 */

const ALL_PASS: PushFacts = {
  secureContext: true,
  standalone: true,
  notificationApi: true,
  platformVersion: 18.4,
  permission: 'granted',
  workerState: 'active',
  localEndpoint: 'https://web.push.apple.com/one-abcdefghijkl',
  localApplicationServerKey: 'BServerKey',
  serverApplicationServerKey: 'BServerKey',
  serverKnowsEndpoint: true,
  lastStatus: 201,
  lastStatusAt: '2026-08-23T18:45:00.000Z',
  badgeWorks: true,
};

const SAFARI_TAB: PushFacts = {
  ...ALL_PASS,
  standalone: false,
  notificationApi: false,
  permission: 'unavailable',
  workerState: 'none',
  localEndpoint: null,
  localApplicationServerKey: null,
  serverKnowsEndpoint: false,
  lastStatus: null,
};

describe('the eleven rows', () => {
  test('there are eleven of them, in a fixed order', () => {
    expect(PUSH_CHECK_COUNT).toBe(11);
    expect(PUSH_CHECK_IDS).toEqual([
      'secure',
      'installed',
      'notifications',
      'platform',
      'permission',
      'worker',
      'subscription',
      'keyMatch',
      'serverKnown',
      'delivery',
      'badge',
    ]);
    const rows = pushDiagnostics(ALL_PASS);
    expect(rows.map((row) => row.id)).toEqual([...PUSH_CHECK_IDS]);
  });

  test('every row carries its own remedy, whatever its state', () => {
    const rows = pushDiagnostics(SAFARI_TAB);
    const empty = rows.filter((row) => row.remedy.trim() === '');
    console.log(`walked ${rows.length} rows; ${rows.length - empty.length} carry a remedy`);
    expect(rows).toHaveLength(11);
    expect(empty).toEqual([]);
  });

  test('all eleven pass on a working install', () => {
    const rows = pushDiagnostics(ALL_PASS);
    console.log(rows.map((row) => `${row.id}=${row.state}`).join(' '));
    expect(rows.every((row) => row.state === 'passed')).toBe(true);
    expect(firstFailure(rows)).toBeNull();
  });
});

describe('stopping at the first failure', () => {
  test('a Safari tab answers one row and leaves the rest unchecked', () => {
    const rows = pushDiagnostics(SAFARI_TAB);
    const failed = rows.filter((row) => row.state === 'failed');
    const notChecked = rows.filter((row) => row.state === 'not-checked');
    console.log(rows.map((row) => `${row.id}=${row.state}`).join(' '));
    expect(failed).toHaveLength(1);
    expect(failed[0].id).toBe('installed');
    // Everything under the failure is NOT CHECKED, never PASSED. Reporting a
    // check that did not run as one that did is the failure class this project
    // keeps finding.
    expect(notChecked.map((row) => row.id)).toEqual([
      'notifications',
      'platform',
      'permission',
      'worker',
      'subscription',
      'keyMatch',
      'serverKnown',
      'delivery',
      'badge',
    ]);
    expect(rows.filter((row) => row.state === 'passed').map((row) => row.id)).toEqual(['secure']);
  });

  test('a rotated server key is the row that answers, not the subscription', () => {
    const rows = pushDiagnostics({ ...ALL_PASS, serverApplicationServerKey: 'BSomethingElse' });
    const failure = firstFailure(rows);
    expect(failure?.id).toBe('keyMatch');
    console.log(`answered: ${failure?.label}, remedy: ${failure?.remedy}`);
  });

  test('the phone holds a subscription the Mac mini does not', () => {
    const rows = pushDiagnostics({ ...ALL_PASS, serverKnowsEndpoint: false });
    expect(firstFailure(rows)?.id).toBe('serverKnown');
    expect(rows.find((row) => row.id === 'subscription')?.state).toBe('passed');
  });

  test('a refused last send is a number, not a silence', () => {
    const rows = pushDiagnostics({ ...ALL_PASS, lastStatus: 403 });
    const failure = firstFailure(rows);
    expect(failure?.id).toBe('delivery');
    expect(failure?.detail).toContain('403');
    console.log(`delivery row reads: ${failure?.detail}`);
  });

  test('a device that has never been sent to has not failed', () => {
    const rows = pushDiagnostics({ ...ALL_PASS, lastStatus: null, lastStatusAt: null });
    expect(rows.find((row) => row.id === 'delivery')?.state).toBe('passed');
    expect(firstFailure(rows)).toBeNull();
  });

  test('a Mac reports no iOS version and is not told to upgrade an iPhone', () => {
    const rows = pushDiagnostics({ ...ALL_PASS, platformVersion: null });
    expect(rows.find((row) => row.id === 'platform')?.state).toBe('passed');
  });

  test('an iPhone below the floor fails the platform row', () => {
    const rows = pushDiagnostics({ ...ALL_PASS, platformVersion: 16.3 });
    expect(firstFailure(rows)?.id).toBe('platform');
    expect(MINIMUM_IOS).toBe(16.4);
  });
});

describe('the platform version, off the only signal a browser gives', () => {
  test('an iPhone user agent', () => {
    expect(
      platformVersionOf(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15',
      ),
    ).toBe(18.4);
  });

  test('an iPad user agent', () => {
    expect(platformVersionOf('Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15')).toBe(
      17.2,
    );
  });

  test('a Mac has no answer, and null is the honest one', () => {
    expect(
      platformVersionOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'),
    ).toBeNull();
  });
});
