import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_STALE_HOURS,
  type AlertFacts,
  deriveAlerts,
  planAlerts,
} from '@/lib/backup/alerts';
import { alertAction, alertBody, alertTitle } from '@/lib/display';
import {
  DAILY_ARCHIVE_JOB,
  DAILY_ARCHIVE_SCHEDULE,
  dailyPeriodKey,
  missedDailyPeriods,
} from '@/lib/schedule';

/**
 * F133, over facts, with no database and no push service.
 *
 * THREE CLASSES OF FAILURE AND ONE ANSWER EACH: a scheduled job, an archive
 * run, an integration. Each raises one alert naming the surface, the cause and
 * one action, and the three sentences are read out of the catalogue here rather
 * than asserted as tokens, because "names the cause" is a claim about what a
 * person reads.
 *
 * WHAT WOULD MAKE THIS GO RED. Raise alerts at the moment of failure instead of
 * deriving them from state and the clearing test fails, because nothing would
 * ever take a banner down. Drop the key and the "one notification" test fails,
 * because every sweep would raise the same failure again.
 */

const healthy: AlertFacts = {
  backup: {
    outcome: 'ok',
    destination: 'configured',
    directory: '/Users/owner/Library/Mobile Documents/com~apple~CloudDocs/Vernier',
    cause: '',
    detail: {},
    hoursSinceGood: 6,
    startedAt: '2026-08-23T01:00:00.000Z',
  },
  jobs: [
    { jobName: 'weekly_review', periodStart: '2026-08-23T20:00', state: 'done', detail: '', attempt: 1 },
    { jobName: 'daily_archive', periodStart: '2026-08-23T03:00', state: 'done', detail: '', attempt: 1 },
  ],
  integrations: [
    { provider: 'withings', state: 'connected', hoursSinceSync: 2, cause: '' },
    { provider: 'apple_health', state: 'connected', hoursSinceSync: 5, cause: '' },
  ],
};

describe('a healthy machine', () => {
  it('raises nothing at all', () => {
    expect(deriveAlerts(healthy)).toEqual([]);
  });
});

describe('one alert per failing thing', () => {
  it('raises the archive failure, naming the folder and the cause', () => {
    const alerts = deriveAlerts({
      ...healthy,
      backup: {
        ...healthy.backup!,
        outcome: 'failed',
        cause: 'not_writable',
        destination: 'fallback',
        directory: '/Users/owner/Library/Mobile Documents/com~apple~CloudDocs/Vernier',
        detail: { errno: 'EACCES' },
      },
    });
    expect(alerts.map((alert) => alert.key)).toEqual(['backup']);
    const [alert] = alerts;
    const sentence = `${alertTitle(alert.surface)}. ${alertBody(alert.cause, alert.detail)} ${alertAction(alert.route)}`;
    console.log(sentence);
    expect(sentence).toContain('The nightly backup');
    expect(sentence).toContain('CloudDocs');
    expect(sentence).toContain('EACCES');
    expect(sentence).toContain('Open Data and backups');
    expect(alert.severity).toBe('alert');
  });

  it('raises the fallback as its own thing when the archive itself worked', () => {
    const alerts = deriveAlerts({
      ...healthy,
      backup: { ...healthy.backup!, destination: 'fallback', cause: 'missing' },
    });
    expect(alerts.map((alert) => alert.key)).toEqual(['backup_destination']);
    expect(alertBody(alerts[0].cause, alerts[0].detail)).toContain('not there');
    // A folder that was configured and refused the write is an operation that
    // failed. A folder nobody has configured yet is a setting, and reads warn.
    expect(alerts[0].severity).toBe('alert');
    const unconfigured = deriveAlerts({
      ...healthy,
      backup: { ...healthy.backup!, destination: 'fallback', cause: 'not_configured' },
    });
    expect(unconfigured[0].severity).toBe('warn');
  });

  it('raises a scheduled job that failed, naming its period', () => {
    const alerts = deriveAlerts({
      ...healthy,
      jobs: [
        {
          jobName: 'weekly_review',
          periodStart: '2026-08-23T20:00',
          state: 'failed',
          detail: 'stale-timeout',
          attempt: 2,
        },
      ],
    });
    expect(alerts.map((alert) => alert.key)).toEqual(['job:weekly_review']);
    const sentence = `${alertTitle(alerts[0].surface)}. ${alertBody(alerts[0].cause, alerts[0].detail)} ${alertAction(alerts[0].route)}`;
    console.log(sentence);
    expect(sentence).toContain('The Sunday review');
    expect(sentence).toContain('stopped halfway through');
    expect(sentence).toContain('2026-08-23T20:00');
    expect(sentence).toContain('Open Your week');
  });

  it('raises an integration that stopped working, and never one that is merely quiet', () => {
    const alerts = deriveAlerts({
      ...healthy,
      integrations: [
        { provider: 'withings', state: 'error', hoursSinceSync: 96, cause: 'invalid_grant' },
        { provider: 'apple_health', state: 'connected', hoursSinceSync: 80, cause: '' },
      ],
    });
    expect(alerts.map((alert) => alert.key)).toEqual(['integration:withings']);
    const sentence = alertBody(alerts[0].cause, alerts[0].detail);
    console.log(`${alertTitle(alerts[0].surface)}. ${sentence}`);
    // The withings cause map already had words for this token, and they are the
    // ones the settings card uses. One failure reads the same on both screens.
    expect(sentence.length).toBeGreaterThan(20);
    expect(sentence).not.toContain('invalid_grant');
  });

  it('never tells the archive failure twice, once as a run and once as a job', () => {
    const alerts = deriveAlerts({
      ...healthy,
      backup: { ...healthy.backup!, outcome: 'failed', cause: 'no_space' },
      jobs: [
        {
          jobName: DAILY_ARCHIVE_JOB,
          periodStart: '2026-08-23T03:00',
          state: 'failed',
          detail: 'no_space',
          attempt: 1,
        },
      ],
    });
    expect(alerts.map((alert) => alert.key)).toEqual(['backup']);
  });

  it('says so when the newest archive is older than the threshold, or there is none', () => {
    const stale = deriveAlerts({
      ...healthy,
      backup: { ...healthy.backup!, hoursSinceGood: ARCHIVE_STALE_HOURS + 5 },
    });
    expect(stale.map((alert) => alert.key)).toEqual(['backup_stale']);
    expect(alertBody(stale[0].cause, stale[0].detail)).toContain(`${ARCHIVE_STALE_HOURS + 5} hours`);

    const never = deriveAlerts({ ...healthy, backup: null });
    expect(never.map((alert) => alert.key)).toEqual(['backup_stale']);
    expect(alertBody(never[0].cause, never[0].detail)).toContain('No archive has ever finished');
  });

  it('gives every alert an action that is a route this app serves', () => {
    const alerts = deriveAlerts({
      backup: { ...healthy.backup!, outcome: 'failed', cause: 'archive_failed', hoursSinceGood: 99 },
      jobs: [
        { jobName: 'weekly_review', periodStart: '2026-08-23T20:00', state: 'failed', detail: '', attempt: 1 },
      ],
      integrations: [
        { provider: 'google_calendar', state: 'error', hoursSinceSync: 40, cause: 'invalid_grant' },
      ],
    });
    console.log(alerts.map((alert) => `${alert.key} -> ${alert.route}`).join('\n'));
    expect(alerts).toHaveLength(4);
    for (const alert of alerts) {
      expect(alert.route.startsWith('/')).toBe(true);
      expect(alertAction(alert.route).startsWith('Open ')).toBe(true);
    }
  });
});

describe('the sweep plan', () => {
  const failing = deriveAlerts({
    ...healthy,
    backup: { ...healthy.backup!, outcome: 'failed', cause: 'archive_failed' },
  });

  it('raises a failure once and leaves it standing on every sweep after', () => {
    const first = planAlerts([], failing);
    expect(first.raise.map((alert) => alert.key)).toEqual(['backup']);
    const open = [{ key: 'backup', id: 'row-1' }];
    for (let sweep = 0; sweep < 12; sweep += 1) {
      const again = planAlerts(open, failing);
      expect(again.raise).toEqual([]);
      expect(again.standing.map((alert) => alert.key)).toEqual(['backup']);
      expect(again.clear).toEqual([]);
    }
  });

  it('clears an alert whose cause has gone, with nobody dismissing anything', () => {
    const plan = planAlerts([{ key: 'backup', id: 'row-1' }], deriveAlerts(healthy));
    expect(plan.clear.map((alert) => alert.id)).toEqual(['row-1']);
    expect(plan.raise).toEqual([]);
  });

  it('raises the same failure again after it was repaired and returned', () => {
    const cleared = planAlerts([], failing);
    expect(cleared.raise).toHaveLength(1);
  });
});

describe('the archive period', () => {
  const paris = 'Europe/Paris';

  it('names the period by the local calendar day and 03:00', () => {
    expect(dailyPeriodKey(new Date('2026-08-23T04:30:00+02:00'), DAILY_ARCHIVE_SCHEDULE, paris)).toBe(
      '2026-08-23T03:00',
    );
    // Before the hour, the instant still belongs to yesterday's period.
    expect(dailyPeriodKey(new Date('2026-08-23T01:15:00+02:00'), DAILY_ARCHIVE_SCHEDULE, paris)).toBe(
      '2026-08-22T03:00',
    );
  });

  it('holds across both clock changes, where an instant subtraction would not', () => {
    // The twenty-five hour day. 03:00 happens once, and every instant after it
    // belongs to that day's period whatever the offset did.
    expect(dailyPeriodKey(new Date('2026-10-25T23:00:00+01:00'), DAILY_ARCHIVE_SCHEDULE, paris)).toBe(
      '2026-10-25T03:00',
    );
    // The twenty-three hour day in March: 03:00 local does not exist that
    // morning, and the KEY still does, so the period is claimable.
    expect(dailyPeriodKey(new Date('2026-03-29T12:00:00+02:00'), DAILY_ARCHIVE_SCHEDULE, paris)).toBe(
      '2026-03-29T03:00',
    );
  });

  it('owes at most one period at boot, however long the machine was off', () => {
    const now = new Date('2026-08-23T09:00:00+02:00');
    const off = new Date('2026-07-23T09:00:00+02:00');
    const owed = missedDailyPeriods(off, now, DAILY_ARCHIVE_SCHEDULE, paris, 1);
    console.log(`a month off owes: ${owed.join(', ')}`);
    expect(owed).toEqual(['2026-08-23T03:00']);
  });
});
