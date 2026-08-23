import { describe, expect, it } from 'vitest';
import { lastSyncOf } from '@/db/integrations';
import { WITHINGS_PROVIDER } from '@/db/withings';

/**
 * F42, the two-answers defect, as arithmetic rather than as a screenshot.
 *
 * The settings screen printed "Last successful sync 23 Aug, 14:01" on the
 * Withings card and "No successful sync yet" in the integrations list six
 * centimetres below it, because the card read `withings_connection` and the
 * list read `integration_credential`, whose column only ever fills for the
 * ingest provider. One fact, two columns, both on screen.
 *
 * WHAT WOULD MAKE THESE GO RED: putting the credential column back in front of
 * the connection row for Withings, which is the exact edit that shipped the
 * contradiction, or dropping the per-provider branch so a provider that keeps
 * its own connection state is read off the credential table again.
 */

const AT = new Date('2026-08-23T12:01:30.000Z');
const OTHER = new Date('2026-01-01T00:00:00.000Z');

describe('one fact, one column', () => {
  it('reads Withings off the connection row and never off the credential', () => {
    expect(
      lastSyncOf(WITHINGS_PROVIDER, { lastSuccessfulSyncAt: null }, { lastSuccessfulSyncAt: AT }),
    ).toBe(AT.toISOString());

    // The shipped state: a demonstration connection that has synced, with no
    // credential row at all. The list said "No successful sync yet" here.
    expect(lastSyncOf(WITHINGS_PROVIDER, undefined, { lastSuccessfulSyncAt: AT })).toBe(
      AT.toISOString(),
    );

    // And a credential column that disagrees does not get a vote.
    expect(
      lastSyncOf(WITHINGS_PROVIDER, { lastSuccessfulSyncAt: OTHER }, { lastSuccessfulSyncAt: AT }),
    ).toBe(AT.toISOString());
  });

  it('says nothing rather than something when the connection has never synced', () => {
    expect(lastSyncOf(WITHINGS_PROVIDER, { lastSuccessfulSyncAt: OTHER }, null)).toBeNull();
    expect(
      lastSyncOf(WITHINGS_PROVIDER, { lastSuccessfulSyncAt: OTHER }, { lastSuccessfulSyncAt: null }),
    ).toBeNull();
  });

  it('reads every other provider off its own credential row', () => {
    expect(
      lastSyncOf('apple_health', { lastSuccessfulSyncAt: OTHER }, { lastSuccessfulSyncAt: AT }),
    ).toBe(OTHER.toISOString());
    expect(lastSyncOf('apple_health', undefined, { lastSuccessfulSyncAt: AT })).toBeNull();
  });
});
