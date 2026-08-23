import { and, asc, eq, gte, inArray, lt, lte } from 'drizzle-orm';
import { getDb } from './client';
import { readPlan } from './nutrition';
import { sendNotification } from './push';
import { measurement, reminderItem, reminderPreference, reminderSetting } from './schema';
import { readSessionsBetween } from './sessions';
import { readFreshness } from './trends';
import { getConfig } from '@/lib/config';
import { sourceLabel } from '@/lib/display';
import { longDayLabel, time24 } from '@/lib/format';
import { dayAfter, instantOnDay, localDayKey, mondayOf } from '@/lib/local-time';
import type { PushTransport } from '@/lib/push/registry';
import {
  DEFAULT_LEAD_MINUTES,
  DEFAULT_QUIET_HOURS,
  type PendingItem,
  type QuietHours,
  REMINDER_CATEGORIES,
  type ReminderCategory,
  type ReminderSetting,
  isReminderCategory,
  planSweep,
} from '@/lib/reminders';
import { strings } from '@/lib/strings';

/**
 * Where reminders come from, and the sweep that decides what to say about them.
 *
 * WHAT RAISES AN ITEM IS A READ OF A TABLE SOMEBODY ELSE OWNS, never a write of
 * a new fact. A session reminder exists because `planned_session` holds a
 * session; a menu reminder exists because `meal_plan` holds a draft. This
 * module adds nothing to the record of the week and takes nothing away from it.
 *
 * IDEMPOTENCE IS `unique(category, subject_id)` AND NOTHING ELSE. The sweep runs
 * every five minutes and re-reads the same rows every time, so raising is an
 * insert that conflicts and does nothing. Where an item should be able to come
 * back tomorrow, the subject carries the day: `withings:2026-08-23` is a
 * different subject from `withings:2026-08-24`, so a source that is still quiet
 * raises one reminder a day rather than one ever or two hundred and eighty
 * eight.
 */

export const REMINDERS_ROUTE = '/reminders';

/** A pending item whose moment has passed by this much is expired, not sent. */
const EXPIRY_HOURS = 12;

/** The hour a measurement reminder is due, local. Morning, after the scale. */
const MEASUREMENT_HOUR = 9;

/** The evening before a week starts, which is when its menu has to be decided. */
const MENU_HOUR = 18;

/** Sessions are looked ahead for this far, so a lead time up to four hours works. */
const SESSION_LOOKAHEAD_HOURS = 30;

export type ReminderItemRow = typeof reminderItem.$inferSelect;

export type ReminderItemView = {
  id: string;
  category: ReminderCategory;
  dueAt: string;
  line: string;
  detail: string;
  route: string;
  state: string;
  windowKey: string | null;
  sentAt: string | null;
  suppressedAt: string | null;
};

function toItemView(row: ReminderItemRow): ReminderItemView {
  return {
    id: row.id,
    category: row.category as ReminderCategory,
    dueAt: row.dueAt.toISOString(),
    line: row.line,
    detail: row.detail,
    route: row.route,
    state: row.state,
    windowKey: row.windowKey,
    sentAt: row.sentAt?.toISOString() ?? null,
    suppressedAt: row.suppressedAt?.toISOString() ?? null,
  };
}

/**
 * The four settings, with the defaults standing in for any row the seed has not
 * written. A settings screen with fewer than four rows on it reads as broken,
 * and a missing row is a fact about a migration rather than about the owner.
 */
export async function readSettings(): Promise<ReminderSetting[]> {
  const db = getDb();
  const rows = await db.select().from(reminderSetting);
  const stored = new Map(rows.map((row) => [row.category, row]));
  return REMINDER_CATEGORIES.map((category) => {
    const row = stored.get(category);
    return {
      category,
      enabled: row?.enabled ?? true,
      leadMinutes: row?.leadMinutes ?? DEFAULT_LEAD_MINUTES[category],
    };
  });
}

export async function writeSetting(
  category: ReminderCategory,
  change: { enabled?: boolean; leadMinutes?: number },
): Promise<ReminderSetting[]> {
  const db = getDb();
  await db
    .insert(reminderSetting)
    .values({
      category,
      enabled: change.enabled ?? true,
      leadMinutes: change.leadMinutes ?? DEFAULT_LEAD_MINUTES[category],
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: reminderSetting.category,
      set: {
        ...(change.enabled === undefined ? {} : { enabled: change.enabled }),
        ...(change.leadMinutes === undefined ? {} : { leadMinutes: change.leadMinutes }),
        updatedAt: new Date(),
      },
    });
  return readSettings();
}

export const QUIET_HOURS_ID = 'quiet-hours';

export async function readQuietHours(): Promise<QuietHours> {
  const db = getDb();
  const [row] = await db.select().from(reminderPreference).where(eq(reminderPreference.id, QUIET_HOURS_ID));
  return row ? { from: row.quietFrom, to: row.quietTo } : DEFAULT_QUIET_HOURS;
}

export async function writeQuietHours(quiet: QuietHours): Promise<QuietHours> {
  const db = getDb();
  await db
    .insert(reminderPreference)
    .values({
      id: QUIET_HOURS_ID,
      singleton: true,
      quietFrom: quiet.from,
      quietTo: quiet.to,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: reminderPreference.id,
      set: { quietFrom: quiet.from, quietTo: quiet.to, updatedAt: new Date() },
    });
  return readQuietHours();
}

/** Everything still waiting, oldest first. What the screen draws and the sweep reads. */
export async function readPendingItems(): Promise<ReminderItemView[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(reminderItem)
    .where(eq(reminderItem.state, 'pending'))
    .orderBy(asc(reminderItem.dueAt));
  return rows.map(toItemView);
}

/** Everything that happened recently, whatever became of it, for the screen's history. */
export async function readRecentItems(limit = 20): Promise<ReminderItemView[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(reminderItem)
    .orderBy(asc(reminderItem.dueAt))
    .limit(limit);
  return rows.map(toItemView);
}

type Raised = { category: ReminderCategory; subjectId: string } & Omit<
  PendingItem,
  'id' | 'category'
>;

/**
 * What the four categories look at, and it is four reads of other slices'
 * tables.
 */
async function itemsToRaise(now: Date, timeZone: string): Promise<Raised[]> {
  const raised: Raised[] = [];
  const today = localDayKey(now, timeZone);

  // 1. A session the owner has on the calendar for the next thirty hours.
  const sessions = await readSessionsBetween(
    now,
    new Date(now.getTime() + SESSION_LOOKAHEAD_HOURS * 3_600_000),
  );
  for (const session of sessions) {
    if (session.state !== 'planned') continue;
    raised.push({
      category: 'session',
      subjectId: session.id,
      dueAt: session.plannedFor,
      line: strings.reminders.lines.session(session.title, time24(session.plannedFor, timeZone)),
      detail:
        session.place.trim() === ''
          ? strings.reminders.details.sessionNoPlace
          : strings.reminders.details.session(session.place),
      route: REMINDERS_ROUTE,
    });
  }

  // 2. A day with no weight reading on it. One subject per day, so tomorrow can
  //    raise its own and yesterday's answer does not silence it.
  const db = getDb();
  const dayStart = instantOnDay(today, 0, 0, timeZone);
  const dayEnd = instantOnDay(today, 23, 59, timeZone);
  const [logged] = await db
    .select({ id: measurement.id })
    .from(measurement)
    .where(
      and(
        eq(measurement.metric, 'weight'),
        gte(measurement.measuredAt, dayStart),
        lte(measurement.measuredAt, dayEnd),
      ),
    )
    .limit(1);
  if (!logged) {
    raised.push({
      category: 'measurements',
      subjectId: today,
      dueAt: instantOnDay(today, MEASUREMENT_HOUR, 0, timeZone),
      line: strings.reminders.lines.measurements,
      detail: strings.reminders.details.measurements,
      route: REMINDERS_ROUTE,
    });
  }

  // 3. A menu for the coming week that is still a draft.
  const nextWeekStart = dayAfter(mondayOf(today, timeZone), 7);
  const nextPlan = await readPlan(instantOnDay(nextWeekStart, 0, 0, timeZone));
  if (nextPlan && nextPlan.state === 'draft') {
    raised.push({
      category: 'menu',
      subjectId: nextPlan.id,
      dueAt: instantOnDay(dayAfter(nextWeekStart, -1), MENU_HOUR, 0, timeZone),
      line: strings.reminders.lines.menu(longDayLabel(nextWeekStart)),
      detail: strings.reminders.details.menu,
      route: REMINDERS_ROUTE,
    });
  }

  // 4. A syncing source that has gone quiet. One subject per source per day.
  for (const source of await readFreshness(now)) {
    if (!source.stale) continue;
    const name = sourceLabel(source.source);
    raised.push({
      category: 'missing_data',
      subjectId: `${source.source}:${today}`,
      dueAt: now,
      line: strings.reminders.lines.missingData(
        name,
        source.lastAt ? longDayLabel(localDayKey(source.lastAt, timeZone)) : strings.review.noReading,
      ),
      detail: strings.reminders.details.missingData(name),
      route: REMINDERS_ROUTE,
    });
  }

  return raised;
}

/** Writes what is not already there. Every insert conflicts on its second run. */
export async function raiseReminders(now: Date, timeZone: string): Promise<number> {
  const db = getDb();
  const candidates = await itemsToRaise(now, timeZone);
  let written = 0;
  for (const candidate of candidates) {
    const inserted = await db
      .insert(reminderItem)
      .values({
        id: crypto.randomUUID(),
        category: candidate.category,
        subjectId: candidate.subjectId,
        dueAt: candidate.dueAt,
        line: candidate.line,
        detail: candidate.detail,
        route: candidate.route,
      })
      .onConflictDoNothing({ target: [reminderItem.category, reminderItem.subjectId] })
      .returning({ id: reminderItem.id });
    written += inserted.length;
  }
  return written;
}

/** A pending item whose moment has long passed stops waiting and says so. */
export async function expireStale(now: Date): Promise<number> {
  const db = getDb();
  const cutoff = new Date(now.getTime() - EXPIRY_HOURS * 3_600_000);
  const rows = await db
    .update(reminderItem)
    .set({ state: 'expired' })
    .where(and(eq(reminderItem.state, 'pending'), lt(reminderItem.dueAt, cutoff)))
    .returning({ id: reminderItem.id });
  return rows.length;
}

/**
 * Closes one item, which is what the notification's action and the screen's
 * Done control both do. The same endpoint from both, so there is one way for an
 * item to end.
 */
export async function markDone(id: string, now: Date): Promise<ReminderItemView | null> {
  const db = getDb();
  const [row] = await db
    .update(reminderItem)
    .set({ state: 'done', doneAt: now })
    .where(eq(reminderItem.id, id))
    .returning();
  return row ? toItemView(row) : null;
}

async function markSent(ids: string[], windowKey: string, now: Date): Promise<void> {
  if (ids.length === 0) return;
  const db = getDb();
  await db
    .update(reminderItem)
    .set({ state: 'sent', windowKey, sentAt: now })
    .where(inArray(reminderItem.id, ids));
}

async function markSuppressed(ids: string[], now: Date): Promise<void> {
  if (ids.length === 0) return;
  const db = getDb();
  await db
    .update(reminderItem)
    .set({ state: 'suppressed', suppressedAt: now })
    .where(inArray(reminderItem.id, ids));
}

export type SweepResult = {
  windowKey: string;
  raised: number;
  expired: number;
  sent: string[];
  suppressed: string[];
  disabled: string[];
  waiting: string[];
  /** Null when nothing was sent, otherwise the push service's answer per device. */
  delivery: { ok: boolean; error?: string; sentTo?: number; removed?: number } | null;
};

/**
 * One tick of the five-minute sweep.
 *
 * Expire, raise, read, decide, send, record. The decision is
 * `planSweep` in src/lib/reminders.ts and is graded in the unit suite; what is
 * here is the reading and the writing around it.
 *
 * A SEND THAT DID NOT HAPPEN LEAVES THE ITEMS PENDING. No device subscribed, no
 * key pair, a push service that refused: in every one of those the owner was
 * not told, so the item is still waiting and the next sweep tries again until
 * it expires. Marking an item sent because a send was attempted is the same
 * defect as a check that passes by not checking.
 */
export async function runReminderSweep(
  now: Date,
  transport?: PushTransport,
): Promise<SweepResult> {
  const { timeZone } = getConfig();
  const expired = await expireStale(now);
  const raised = await raiseReminders(now, timeZone);

  const [items, settings, quiet] = await Promise.all([
    readPendingItems(),
    readSettings(),
    readQuietHours(),
  ]);

  const plan = planSweep({
    items: items.map((item) => ({
      id: item.id,
      category: item.category,
      dueAt: new Date(item.dueAt),
      line: item.line,
      detail: item.detail,
      route: item.route,
    })),
    settings,
    quiet,
    now,
    timeZone,
    route: REMINDERS_ROUTE,
    // What will still be waiting once this window's items are sent.
    badge: Math.max(0, items.length),
  });

  await markSuppressed(plan.suppressed, now);

  if (!plan.send) {
    return {
      windowKey: plan.windowKey,
      raised,
      expired,
      sent: [],
      suppressed: plan.suppressed,
      disabled: plan.disabled,
      waiting: plan.waiting,
      delivery: null,
    };
  }

  const result = await sendNotification(plan.send.plan, 'reminder', transport);
  if (!result.ok) {
    return {
      windowKey: plan.windowKey,
      raised,
      expired,
      sent: [],
      suppressed: plan.suppressed,
      disabled: plan.disabled,
      waiting: plan.waiting,
      delivery: { ok: false, error: result.error },
    };
  }

  await markSent(plan.send.itemIds, plan.windowKey, now);
  return {
    windowKey: plan.windowKey,
    raised,
    expired,
    sent: plan.send.itemIds,
    suppressed: plan.suppressed,
    disabled: plan.disabled,
    waiting: plan.waiting,
    delivery: { ok: true, sentTo: result.sent, removed: result.removed },
  };
}

/** Whether a string names one of the four. The routes ask before they write. */
export { isReminderCategory };
