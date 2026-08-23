/**
 * How the owner learns something broke, without opening anything first.
 *
 * THE PANEL'S FIRST FINDING WAS THAT SILENCE IS THE FAILURE MODE. Nobody churns
 * on a missing feature; they churn on an app that stopped doing something and
 * did not say so. A green healthcheck over a dead sync is the canonical version,
 * and this run has already produced the real thing twice: a Withings token that
 * died and was noticed four days later as a flat gap in a chart, and a shortcut
 * that stopped running for three days.
 *
 * SO ALERTS ARE DERIVED, NOT RAISED. Nothing in this product calls "raise an
 * alert" at the moment it fails. A failure writes its own row where it happened
 * (`backup_run.outcome`, `job_run.state`, the integration's own connection row)
 * and this function reads all three every five minutes and says what is wrong
 * right now. Two consequences, both deliberate:
 *
 *   - A failure that nobody remembered to instrument still surfaces, because
 *     the sweep reads state rather than events.
 *   - An alert whose cause has gone CLEARS ITSELF. A banner that needs a human
 *     to dismiss it is a banner that is still up in November.
 *
 * ONE NOTIFICATION PER FAILING THING, EVER, and the key is what makes that
 * true: a backup failing every night for a week is one open row, one push and
 * one banner, and a partial unique index in the database enforces it rather
 * than this function promising it.
 *
 * Pure and dependency free, so the whole of F133 is graded over facts in
 * `tests/unit/operator-alerts.test.ts` with no database, no push service and no
 * container.
 */

export type AlertSeverity = 'alert' | 'warn';

export type AlertDescriptor = {
  /** Stable per failing thing. One open row per key. */
  key: string;
  /** Which surface is broken. A token; the catalogue names it. */
  surface: string;
  /** Why. A token; the catalogue turns it into a sentence with `detail` in it. */
  cause: string;
  /** The numbers and names that sentence needs. Never a credential. */
  detail: Record<string, string | number>;
  /** The one action. A route in this app. */
  route: string;
  severity: AlertSeverity;
};

export type BackupFact = {
  outcome: 'running' | 'ok' | 'failed';
  destination: 'configured' | 'fallback';
  /** The host path the owner configured, or the fallback directory. */
  directory: string;
  cause: string;
  detail: Record<string, unknown>;
  /** Hours since the last run that produced a verified archive. Null when never. */
  hoursSinceGood: number | null;
  startedAt: string;
};

export type JobFact = {
  jobName: string;
  periodStart: string;
  state: 'running' | 'done' | 'failed';
  detail: string;
  attempt: number;
};

export type IntegrationFact = {
  provider: string;
  state: string;
  /** Hours since it last worked. Null when it has never worked. */
  hoursSinceSync: number | null;
  cause: string;
};

export type AlertFacts = {
  backup: BackupFact | null;
  jobs: JobFact[];
  integrations: IntegrationFact[];
};

/**
 * How old the newest verified archive may be before the console says so.
 *
 * Thirty-six hours. The archive runs at 03:00, so a single missed night is
 * thirty-three hours old by the time the next one is due and would raise
 * nothing on a threshold of forty-eight. Thirty-six is the same number
 * `src/lib/trend.ts` uses for a source that has gone quiet, and one threshold
 * the owner can hold in his head beats two he cannot.
 */
export const ARCHIVE_STALE_HOURS = 36;

/** The one action for each surface. A route this app serves, always. */
export const ALERT_ROUTES: Record<string, string> = {
  backup: '/settings/data',
  machine: '/settings/data',
  weekly_review: '/review',
  daily_archive: '/settings/data',
  reminders: '/settings/notifications',
  withings: '/settings',
  apple_health: '/settings/shortcut',
  google_calendar: '/settings',
  mail_relay: '/settings',
  anthropic: '/settings/ai',
};

function routeFor(surface: string): string {
  return ALERT_ROUTES[surface] ?? '/settings';
}

/**
 * Everything wrong right now, one descriptor each.
 *
 * The order is the order the banner shows them in: the archive first, because
 * an installation with no working backup is one power supply away from being no
 * installation at all; then the scheduled jobs; then the integrations.
 */
export function deriveAlerts(facts: AlertFacts): AlertDescriptor[] {
  const alerts: AlertDescriptor[] = [];

  if (facts.backup) {
    const backup = facts.backup;
    if (backup.outcome === 'failed') {
      alerts.push({
        key: 'backup',
        surface: 'backup',
        cause: backup.cause === '' ? 'archive_failed' : backup.cause,
        detail: { directory: backup.directory, ...toStrings(backup.detail) },
        route: routeFor('backup'),
        severity: 'alert',
      });
    } else if (backup.destination === 'fallback') {
      // The archive was written, so nothing is lost, and it is NOT where the
      // owner told it to go, so nothing is being synced off this machine
      // either. `not_configured` is a setting he has not made yet and reads as
      // warn; anything else is a destination that was configured and refused
      // the write, which is an operation that failed and reads as alert.
      alerts.push({
        key: 'backup_destination',
        surface: 'backup',
        cause: backup.cause === '' ? 'destination_unavailable' : backup.cause,
        detail: { directory: backup.directory, ...toStrings(backup.detail) },
        route: routeFor('backup'),
        severity: backup.cause === 'not_configured' ? 'warn' : 'alert',
      });
    }

    if (backup.hoursSinceGood === null || backup.hoursSinceGood >= ARCHIVE_STALE_HOURS) {
      alerts.push({
        key: 'backup_stale',
        surface: 'backup',
        cause: backup.hoursSinceGood === null ? 'never_archived' : 'archive_stale',
        detail: {
          hours: backup.hoursSinceGood === null ? 0 : Math.floor(backup.hoursSinceGood),
          threshold: ARCHIVE_STALE_HOURS,
        },
        route: routeFor('backup'),
        severity: 'warn',
      });
    }
  } else {
    // No run has ever been recorded. On a fresh installation that is true for
    // one night, and it is still worth saying: an owner who thinks he has a
    // backup and does not is in the worst state of the three.
    alerts.push({
      key: 'backup_stale',
      surface: 'backup',
      cause: 'never_archived',
      detail: { hours: 0, threshold: ARCHIVE_STALE_HOURS },
      route: routeFor('backup'),
      severity: 'warn',
    });
  }

  for (const job of facts.jobs) {
    if (job.state !== 'failed') continue;
    alerts.push({
      key: `job:${job.jobName}`,
      surface: job.jobName,
      cause: job.detail === '' ? 'job_failed' : job.detail,
      detail: { period: job.periodStart, attempt: job.attempt },
      route: routeFor(job.jobName),
      severity: 'alert',
    });
  }

  for (const integration of facts.integrations) {
    const broken = integration.state === 'error' || integration.state === 'revoked';
    if (!broken) continue;
    alerts.push({
      key: `integration:${integration.provider}`,
      surface: integration.provider,
      cause: integration.cause === '' ? 'integration_failed' : integration.cause,
      detail: {
        hours:
          integration.hoursSinceSync === null ? 0 : Math.floor(integration.hoursSinceSync),
        state: integration.state,
      },
      route: routeFor(integration.provider),
      severity: 'alert',
    });
  }

  return alerts;
}

function toStrings(detail: Record<string, unknown>): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') continue;
    flat[key] = String(value);
  }
  return flat;
}

export type OpenAlert = { key: string; id: string };

export type AlertPlan = {
  raise: AlertDescriptor[];
  clear: OpenAlert[];
  /** Already open and still true. Nothing is sent again for these. */
  standing: OpenAlert[];
};

/**
 * What the sweep should do, decided over the open rows and the derived set.
 *
 * Three answers and no fourth: raise what is newly true, clear what has stopped
 * being true, and leave standing what was already said. The last one is where
 * "one notification" is won or lost, and it is a set difference rather than a
 * timestamp comparison, so a sweep that runs twice in one second does the same
 * thing as a sweep that runs once.
 */
export function planAlerts(open: OpenAlert[], derived: AlertDescriptor[]): AlertPlan {
  const openKeys = new Map(open.map((alert) => [alert.key, alert]));
  const derivedKeys = new Set(derived.map((alert) => alert.key));
  return {
    raise: derived.filter((alert) => !openKeys.has(alert.key)),
    clear: open.filter((alert) => !derivedKeys.has(alert.key)),
    standing: open.filter((alert) => derivedKeys.has(alert.key)),
  };
}
