import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from './client';
import { readLastBackupRun, readLastGoodBackupRun } from './backup';
import { describeIntegrations } from './integrations';
import { readAllRuns } from './jobs';
import { sendNotification } from './push';
import { readQuietHours } from './reminders';
import { operatorAlert } from './schema';
import {
  type AlertDescriptor,
  type AlertFacts,
  deriveAlerts,
  planAlerts,
} from '@/lib/backup/alerts';
import { getConfig } from '@/lib/config';
import { alertBody, alertTitle } from '@/lib/display';
import { hoursBetween } from '@/lib/format';
import { inQuietHours } from '@/lib/reminders';

/**
 * The alert sweep: read what is broken, raise what is new, clear what is fixed,
 * and send exactly one notification per failing thing.
 *
 * IT READS STATE AND NOT EVENTS, which is what makes it catch a failure nobody
 * remembered to instrument. `src/lib/backup/alerts.ts` holds the rule and is
 * graded with no database; this file is the part Postgres arbitrates, and the
 * arbitration is a partial unique index rather than a promise: one OPEN row per
 * key, so two sweeps racing produce one alert and one push.
 */

export type OperatorAlertRow = typeof operatorAlert.$inferSelect;

export type OperatorAlertView = {
  id: string;
  key: string;
  surface: string;
  cause: string;
  detail: Record<string, string | number>;
  route: string;
  severity: 'alert' | 'warn';
  raisedAt: string;
  notifiedAt: string | null;
  notifyDetail: string;
};

export function toAlertView(row: OperatorAlertRow): OperatorAlertView {
  return {
    id: row.id,
    key: row.key,
    surface: row.surface,
    cause: row.cause,
    detail: (row.detail ?? {}) as Record<string, string | number>,
    route: row.route,
    severity: row.severity as OperatorAlertView['severity'],
    raisedAt: row.raisedAt.toISOString(),
    notifiedAt: row.notifiedAt?.toISOString() ?? null,
    notifyDetail: row.notifyDetail,
  };
}

/** Everything still true, newest first. What the banner draws. */
export async function readOpenAlerts(): Promise<OperatorAlertView[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(operatorAlert)
    .where(isNull(operatorAlert.clearedAt))
    .orderBy(desc(operatorAlert.raisedAt));
  return rows.map(toAlertView);
}

/** The facts three different subsystems each keep for their own reasons. */
export async function readAlertFacts(now: Date): Promise<AlertFacts> {
  const [last, lastGood, runs, integrations] = await Promise.all([
    readLastBackupRun(),
    readLastGoodBackupRun(),
    readAllRuns(40),
    describeIntegrations(),
  ]);

  const hoursSinceGood = lastGood?.finishedAt
    ? hoursBetween(new Date(lastGood.finishedAt), now)
    : null;

  // One row per job: the newest period, because an old failure that has since
  // been followed by a good run is not a thing that is broken now.
  const newest = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    if (!newest.has(run.jobName)) newest.set(run.jobName, run);
  }

  return {
    backup: last
      ? {
          outcome: last.outcome,
          destination: last.destination,
          directory: last.directory,
          cause: last.cause,
          detail: last.detail,
          hoursSinceGood,
          startedAt: last.startedAt,
        }
      : null,
    jobs: [...newest.values()].map((run) => ({
      jobName: run.jobName,
      periodStart: run.periodStart,
      state: run.state,
      detail: run.detail,
      attempt: run.attempt,
    })),
    integrations: integrations.map((integration) => ({
      provider: integration.provider,
      state: integration.state,
      hoursSinceSync: integration.lastSuccessfulSyncAt
        ? hoursBetween(new Date(integration.lastSuccessfulSyncAt), now)
        : null,
      cause: integration.lastError ?? '',
    })),
  };
}

async function raise(descriptor: AlertDescriptor): Promise<OperatorAlertView | null> {
  const db = getDb();
  const [row] = await db
    .insert(operatorAlert)
    .values({
      id: crypto.randomUUID(),
      key: descriptor.key,
      surface: descriptor.surface,
      cause: descriptor.cause,
      detail: descriptor.detail,
      route: descriptor.route,
      severity: descriptor.severity,
    })
    // The partial unique index takes the decision. A sweep that lost the race
    // inserts nothing and returns nothing, which is exactly right: the alert is
    // already open and the push has already gone.
    .onConflictDoNothing()
    .returning();
  return row ? toAlertView(row) : null;
}

async function clear(id: string): Promise<void> {
  const db = getDb();
  await db.update(operatorAlert).set({ clearedAt: new Date() }).where(eq(operatorAlert.id, id));
}

export type SweepReport = {
  raised: OperatorAlertView[];
  cleared: number;
  standing: number;
  notified: number;
  held: number;
};

/**
 * One pass. Safe to run every five minutes and safe to run twice.
 *
 * THE PUSH IS SENT ONCE, AND HELD RATHER THAN DROPPED INSIDE QUIET HOURS. An
 * archive that fails at 03:04 is real and the owner is asleep; the banner is up
 * the moment he opens the app, and the notification waits for the window to
 * open rather than waking him or being thrown away. `notified_at` stays null
 * and `notify_detail` says why, so a push that never arrives has a reason
 * written down instead of being an absence.
 */
export async function sweepAlerts(now: Date = new Date()): Promise<SweepReport> {
  const facts = await readAlertFacts(now);
  const derived = deriveAlerts(facts);
  const open = await readOpenAlerts();
  const plan = planAlerts(
    open.map((alert) => ({ key: alert.key, id: alert.id })),
    derived,
  );

  const raised: OperatorAlertView[] = [];
  for (const descriptor of plan.raise) {
    const row = await raise(descriptor);
    if (row) raised.push(row);
  }
  for (const alert of plan.clear) {
    await clear(alert.id);
  }

  const { timeZone } = getConfig();
  const quiet = await readQuietHours();
  const silent = inQuietHours(now, quiet, timeZone);

  let notified = 0;
  let held = 0;
  const owed = await readUnnotified();
  for (const alert of owed) {
    if (silent) {
      await markNotifyDetail(alert.id, 'quiet_hours');
      held += 1;
      continue;
    }
    const sent = await sendNotification(
      {
        title: alertTitle(alert.surface),
        body: alertBody(alert.cause, alert.detail),
        tag: `vernier-alert-${alert.key}`,
        route: alert.route,
        itemIds: [],
        badge: 1,
      },
      'operator',
    ).catch(() => ({ ok: false as const, reason: 'no-devices' as const, error: '', detail: '' }));
    if (sent.ok) {
      await markNotified(alert.id);
      notified += 1;
    } else {
      // No subscribed device is not a failure of the alert: the banner is the
      // product and the push is the nudge. The reason is recorded so the push
      // diagnostics screen and this row agree about what happened.
      await markNotifyDetail(alert.id, sent.reason);
      held += 1;
    }
  }

  return {
    raised,
    cleared: plan.clear.length,
    standing: plan.standing.length,
    notified,
    held,
  };
}

async function readUnnotified(): Promise<OperatorAlertView[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(operatorAlert)
    .where(and(isNull(operatorAlert.clearedAt), isNull(operatorAlert.notifiedAt)))
    .orderBy(operatorAlert.raisedAt);
  return rows.map(toAlertView);
}

async function markNotified(id: string): Promise<void> {
  const db = getDb();
  await db
    .update(operatorAlert)
    .set({ notifiedAt: new Date(), notifyDetail: '' })
    .where(eq(operatorAlert.id, id));
}

async function markNotifyDetail(id: string, detail: string): Promise<void> {
  const db = getDb();
  await db.update(operatorAlert).set({ notifyDetail: detail }).where(eq(operatorAlert.id, id));
}

/**
 * Every alert ever raised, for the operator console's history.
 *
 * Cleared ones included, deliberately: an integration that broke and repaired
 * itself three times this month is a thing the owner should be able to see, and
 * a table that only shows what is wrong right now cannot show it.
 */
export async function readAlertHistory(limit = 20): Promise<OperatorAlertView[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(operatorAlert)
    .orderBy(desc(operatorAlert.raisedAt))
    .limit(limit);
  return rows.map(toAlertView);
}

/** How many alerts are open right now, without reading them all. */
export async function countOpenAlerts(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(operatorAlert)
    .where(isNull(operatorAlert.clearedAt));
  return Number(row?.n ?? 0);
}
