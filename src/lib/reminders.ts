import type { NotificationPlan } from '@/lib/push/payload';
import { localWallTime, sweepWindowKey } from '@/lib/schedule';
import { strings } from '@/lib/strings';

/**
 * Four categories, one notification per window, and nothing at all inside quiet
 * hours.
 *
 * THE GROUPING IS THE PRODUCT DECISION AND IT IS NOT A NICETY. A Sunday evening
 * can raise a session reminder, a measurement reminder, a menu confirmation and
 * a missing-data notice inside the same minute. Four notifications for that is
 * four unlocks, four dismissals and a person who turns the whole thing off in a
 * fortnight. Everything that becomes due in one sweep window is one
 * notification carrying every line, with one tag so a duplicate collapses on
 * the device rather than stacking.
 *
 * QUIET HOURS DROP, THEY DO NOT DEFER. A reminder held until 07:00 arrives as a
 * stack of last night at the moment the owner wakes up, about things that have
 * already passed. The item stays pending on the screen where it can be seen and
 * closed; what is suppressed is the push, and the row says so with the time it
 * would have gone.
 *
 * Pure and dependency free. Everything that reads a table is in
 * `src/db/reminders.ts`; what decides is here, so the unit suite grades it
 * across midnight, across a clock change and over an empty window.
 */

export const REMINDER_CATEGORIES = ['session', 'measurements', 'menu', 'missing_data'] as const;

export type ReminderCategory = (typeof REMINDER_CATEGORIES)[number];

export function isReminderCategory(value: string): value is ReminderCategory {
  return (REMINDER_CATEGORIES as readonly string[]).includes(value);
}

/** How long before the thing itself each category speaks, out of the box. */
export const DEFAULT_LEAD_MINUTES: Record<ReminderCategory, number> = {
  session: 30,
  measurements: 0,
  menu: 0,
  missing_data: 0,
};

/** The widest lead a setting may carry. Four hours, and a whole number of minutes. */
export const MAX_LEAD_MINUTES = 240;

export type ReminderSetting = {
  category: ReminderCategory;
  enabled: boolean;
  leadMinutes: number;
};

export type QuietHours = { from: string; to: string };

export const DEFAULT_QUIET_HOURS: QuietHours = { from: '22:00', to: '07:00' };

/** `22:00`, and nothing else. A minute that is not a minute is not stored. */
export function isWallTime(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

/**
 * Whether an instant falls inside the quiet window, read on the app's own
 * clock.
 *
 * The window wraps. 22:00 to 07:00 is two ranges on a clock face and one range
 * in the owner's head, and the naive `from <= now && now < to` is false for all
 * nine hours of it, which is a quiet-hours setting that silences nothing. The
 * wrap is the normal case here, not the edge case.
 *
 * A window whose two ends are equal is nine hours of nothing or twenty-four
 * hours of silence depending on which way it is read, so it is read as neither:
 * equal ends mean quiet hours are off.
 */
export function inQuietHours(at: Date, quiet: QuietHours, timeZone: string): boolean {
  if (!isWallTime(quiet.from) || !isWallTime(quiet.to)) return false;
  if (quiet.from === quiet.to) return false;
  const now = localWallTime(at, timeZone);
  if (quiet.from < quiet.to) return now >= quiet.from && now < quiet.to;
  return now >= quiet.from || now < quiet.to;
}

export type PendingItem = {
  id: string;
  category: ReminderCategory;
  /** When the thing itself happens. The lead is subtracted from this. */
  dueAt: Date;
  /** One short line, which is the notification's title when it is alone. */
  line: string;
  /** One sentence, which is the notification's body when it is alone. */
  detail: string;
  route: string;
};

export type SweepPlan = {
  windowKey: string;
  /** One notification for the whole window, or null when there is nothing to say. */
  send: { plan: NotificationPlan; itemIds: string[] } | null;
  /** Ready, and dropped because the clock is inside quiet hours. */
  suppressed: string[];
  /** Ready, and the owner has this category switched off. */
  disabled: string[];
  /** Not ready yet, because the lead time has not been reached. */
  waiting: string[];
};

/** When a category's reminder speaks: the thing itself, minus its lead. */
export function fireAt(item: PendingItem, leadMinutes: number): Date {
  return new Date(item.dueAt.getTime() - leadMinutes * 60_000);
}

/**
 * Everything the sweep decides, in one pass over the pending items.
 *
 * The route is the screen that lists the pending reminders with a Done control
 * on each, so the notification body and its action both land somewhere the item
 * can be closed. That matters more on iOS than anywhere else: notification
 * actions are unsupported in Safari, so the tap on the body is the Done path.
 */
export function planSweep(input: {
  items: PendingItem[];
  settings: ReminderSetting[];
  quiet: QuietHours;
  now: Date;
  timeZone: string;
  route: string;
  /** How many items will still be pending after this send, for the icon badge. */
  badge: number;
}): SweepPlan {
  const windowKey = sweepWindowKey(input.now, input.timeZone);
  const byCategory = new Map(input.settings.map((setting) => [setting.category, setting]));

  const ready: PendingItem[] = [];
  const suppressed: string[] = [];
  const disabled: string[] = [];
  const waiting: string[] = [];

  const quiet = inQuietHours(input.now, input.quiet, input.timeZone);

  for (const item of input.items) {
    const setting = byCategory.get(item.category);
    const lead = setting?.leadMinutes ?? DEFAULT_LEAD_MINUTES[item.category];
    if (fireAt(item, lead).getTime() > input.now.getTime()) {
      waiting.push(item.id);
      continue;
    }
    if (!setting?.enabled) {
      disabled.push(item.id);
      continue;
    }
    if (quiet) {
      suppressed.push(item.id);
      continue;
    }
    ready.push(item);
  }

  if (ready.length === 0) {
    return { windowKey, send: null, suppressed, disabled, waiting };
  }

  const lines = ready.map((item) => item.line);
  const plan: NotificationPlan = {
    title: ready.length === 1 ? ready[0].line : strings.reminders.manyTitle(ready.length),
    body: ready.length === 1 ? ready[0].detail : strings.reminders.manyBody(lines),
    // One tag per window, so a retry of the same sweep replaces rather than
    // stacks. `vernier-reminders` is a machine token, not copy.
    tag: `vernier-reminders-${windowKey}`,
    route: input.route,
    itemIds: ready.map((item) => item.id),
    badge: input.badge,
  };

  return { windowKey, send: { plan, itemIds: plan.itemIds }, suppressed, disabled, waiting };
}

/** The label a category shows on the settings screen and in a row. */
export function categoryLabel(category: ReminderCategory): string {
  return strings.reminders.categories[category].label;
}

export function categoryPurpose(category: ReminderCategory): string {
  return strings.reminders.categories[category].purpose;
}
