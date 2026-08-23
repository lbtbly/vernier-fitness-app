import { describe, expect, test } from 'vitest';
import {
  DEFAULT_LEAD_MINUTES,
  DEFAULT_QUIET_HOURS,
  MAX_LEAD_MINUTES,
  type PendingItem,
  REMINDER_CATEGORIES,
  type ReminderSetting,
  fireAt,
  inQuietHours,
  isReminderCategory,
  isWallTime,
  planSweep,
} from '@/lib/reminders';
import { strings } from '@/lib/strings';

/**
 * F117: four categories, on per category, grouped into one notification per
 * window, silenced inside quiet hours, each carrying the action that closes it.
 *
 * WHAT WOULD MAKE THIS GO RED. Sending one notification per item, which is what
 * a naive loop over the ready set produces and which is four unlocks and four
 * dismissals on a Sunday evening. The `send` shape below is a single plan
 * carrying every item id, so a loop would have to change the return type to
 * pass, and it would fail the grouped-title assertion first.
 *
 * The quiet-hours window WRAPS. 22:00 to 07:00 is two ranges on a clock face
 * and one range in the owner's head, and the naive `from <= now && now < to` is
 * false for all nine hours of it, which is a setting that silences nothing.
 * Every hour of the wrap is walked below, and the population is printed.
 */

const ZONE = 'Europe/Paris';
const ROUTE = '/reminders';

const ON: ReminderSetting[] = REMINDER_CATEGORIES.map((category) => ({
  category,
  enabled: true,
  leadMinutes: DEFAULT_LEAD_MINUTES[category],
}));

function item(over: Partial<PendingItem> & { id: string }): PendingItem {
  return {
    category: 'measurements',
    dueAt: new Date('2026-08-23T09:00:00+02:00'),
    line: 'Weight and waist are due',
    detail: 'One weigh-in and one tape measure. Both take under a minute.',
    route: ROUTE,
    ...over,
  };
}

describe('grouping into one notification per window', () => {
  test('four things due in the same five minutes are one notification', () => {
    const now = new Date('2026-08-23T09:02:00+02:00');
    const items = [
      item({ id: 'a', category: 'measurements', line: 'Weight and waist are due' }),
      item({
        id: 'b',
        category: 'menu',
        line: 'The menu for the week of 24 August is waiting',
        dueAt: new Date('2026-08-23T09:00:00+02:00'),
      }),
      item({
        id: 'c',
        category: 'missing_data',
        line: 'Apple Health has sent nothing since 18 August',
        dueAt: new Date('2026-08-23T09:01:00+02:00'),
      }),
      item({
        id: 'd',
        category: 'session',
        line: 'Home strength at 09:30',
        dueAt: new Date('2026-08-23T09:30:00+02:00'),
      }),
    ];
    const plan = planSweep({
      items,
      settings: ON,
      quiet: { from: '22:00', to: '07:00' },
      now,
      timeZone: ZONE,
      route: ROUTE,
      badge: items.length,
    });
    console.log(`walked ${items.length} pending item(s) in window ${plan.windowKey}`);
    console.log(`one notification: "${plan.send?.plan.title}" carrying ${plan.send?.itemIds.length} item(s)`);
    expect(plan.send).not.toBeNull();
    // Four ready at once and ONE notification, not four.
    expect(plan.send?.itemIds).toEqual(['a', 'b', 'c', 'd']);
    expect(plan.send?.plan.title).toBe(strings.reminders.manyTitle(4));
    expect(plan.send?.plan.body).toContain('Weight and waist are due');
    expect(plan.send?.plan.body).toContain('Home strength at 09:30');
    expect(plan.waiting).toEqual([]);
  });

  test('one thing alone keeps its own words rather than a count', () => {
    const now = new Date('2026-08-23T09:02:00+02:00');
    const plan = planSweep({
      items: [item({ id: 'a' })],
      settings: ON,
      quiet: DEFAULT_QUIET_HOURS,
      now,
      timeZone: ZONE,
      route: ROUTE,
      badge: 1,
    });
    expect(plan.send?.plan.title).toBe('Weight and waist are due');
    expect(plan.send?.plan.body).toBe(
      'One weigh-in and one tape measure. Both take under a minute.',
    );
  });

  test('the tag is one per window, so a retry replaces rather than stacks', () => {
    const now = new Date('2026-08-23T09:02:00+02:00');
    const first = planSweep({
      items: [item({ id: 'a' })],
      settings: ON,
      quiet: DEFAULT_QUIET_HOURS,
      now,
      timeZone: ZONE,
      route: ROUTE,
      badge: 1,
    });
    const second = planSweep({
      items: [item({ id: 'a' })],
      settings: ON,
      quiet: DEFAULT_QUIET_HOURS,
      now: new Date('2026-08-23T09:04:30+02:00'),
      timeZone: ZONE,
      route: ROUTE,
      badge: 1,
    });
    expect(first.send?.plan.tag).toBe(second.send?.plan.tag);
    expect(first.send?.plan.tag).toContain(first.windowKey);
  });

  test('nothing ready is no notification at all, which is not a silent send', () => {
    const plan = planSweep({
      items: [],
      settings: ON,
      quiet: DEFAULT_QUIET_HOURS,
      now: new Date('2026-08-23T09:02:00+02:00'),
      timeZone: ZONE,
      route: ROUTE,
      badge: 0,
    });
    expect(plan.send).toBeNull();
    expect(plan.suppressed).toEqual([]);
  });

  test('the notification points at the screen that closes the item', () => {
    const plan = planSweep({
      items: [item({ id: 'a' })],
      settings: ON,
      quiet: DEFAULT_QUIET_HOURS,
      now: new Date('2026-08-23T09:02:00+02:00'),
      timeZone: ZONE,
      route: ROUTE,
      badge: 1,
    });
    // `Notification.actions` is unsupported in Safari, so the tap on the body
    // is the Done path on the owner's iPhone. It has to land somewhere the item
    // can actually be closed.
    expect(plan.send?.plan.route).toBe('/reminders');
    expect(plan.send?.plan.itemIds).toEqual(['a']);
  });
});

describe('lead times', () => {
  test('a session speaks thirty minutes before by default', () => {
    expect(DEFAULT_LEAD_MINUTES.session).toBe(30);
    const session = item({
      id: 's',
      category: 'session',
      dueAt: new Date('2026-08-23T19:00:00+02:00'),
    });
    expect(fireAt(session, 30).toISOString()).toBe('2026-08-23T16:30:00.000Z');
  });

  test('an item whose lead has not been reached waits rather than firing', () => {
    const session = item({
      id: 's',
      category: 'session',
      dueAt: new Date('2026-08-23T19:00:00+02:00'),
    });
    const plan = planSweep({
      items: [session],
      settings: ON,
      quiet: { from: '22:00', to: '07:00' },
      now: new Date('2026-08-23T18:00:00+02:00'),
      timeZone: ZONE,
      route: ROUTE,
      badge: 1,
    });
    console.log(`at 18:00 with a 30 minute lead: waiting=${plan.waiting.join(',') || 'none'}`);
    expect(plan.waiting).toEqual(['s']);
    expect(plan.send).toBeNull();
  });

  test('and fires once the lead is reached', () => {
    const session = item({
      id: 's',
      category: 'session',
      dueAt: new Date('2026-08-23T19:00:00+02:00'),
    });
    const plan = planSweep({
      items: [session],
      settings: ON,
      quiet: { from: '22:00', to: '07:00' },
      now: new Date('2026-08-23T18:31:00+02:00'),
      timeZone: ZONE,
      route: ROUTE,
      badge: 1,
    });
    expect(plan.send?.itemIds).toEqual(['s']);
  });

  test('the lead is bounded, and the bound is stated as a number', () => {
    expect(MAX_LEAD_MINUTES).toBe(240);
  });
});

describe('per category', () => {
  test('a category switched off holds its item back and says which', () => {
    const off = ON.map((setting) =>
      setting.category === 'menu' ? { ...setting, enabled: false } : setting,
    );
    const items = [
      item({ id: 'a', category: 'measurements' }),
      item({ id: 'b', category: 'menu' }),
    ];
    const plan = planSweep({
      items,
      settings: off,
      quiet: { from: '22:00', to: '07:00' },
      now: new Date('2026-08-23T09:02:00+02:00'),
      timeZone: ZONE,
      route: ROUTE,
      badge: 2,
    });
    console.log(`two items, menu off: sent=${plan.send?.itemIds.join(',')} disabled=${plan.disabled.join(',')}`);
    expect(plan.disabled).toEqual(['b']);
    expect(plan.send?.itemIds).toEqual(['a']);
  });

  test('every category can be switched off on its own, and there are four', () => {
    expect(REMINDER_CATEGORIES).toEqual(['session', 'measurements', 'menu', 'missing_data']);
    for (const category of REMINDER_CATEGORIES) {
      expect(isReminderCategory(category)).toBe(true);
    }
    expect(isReminderCategory('anything-else')).toBe(false);
  });
});

describe('quiet hours', () => {
  test('every hour of the wrapping window is silent, and every hour outside it is not', () => {
    const quiet = { from: '22:00', to: '07:00' };
    const silent: string[] = [];
    const loud: string[] = [];
    for (let hour = 0; hour < 24; hour += 1) {
      const at = new Date(`2026-08-23T${String(hour).padStart(2, '0')}:30:00+02:00`);
      (inQuietHours(at, quiet, ZONE) ? silent : loud).push(`${hour}:30`);
    }
    console.log(`walked 24 hours; silent at ${silent.join(', ')}`);
    console.log(`loud at ${loud.join(', ')}`);
    expect(silent).toHaveLength(9);
    expect(loud).toHaveLength(15);
    // The wrap: midnight to 07:00 and 22:00 to midnight, and nothing between.
    expect(silent).toEqual([
      '0:30',
      '1:30',
      '2:30',
      '3:30',
      '4:30',
      '5:30',
      '6:30',
      '22:30',
      '23:30',
    ]);
  });

  test('a window that does not wrap still works', () => {
    const quiet = { from: '09:00', to: '17:00' };
    expect(inQuietHours(new Date('2026-08-23T10:00:00+02:00'), quiet, ZONE)).toBe(true);
    expect(inQuietHours(new Date('2026-08-23T18:00:00+02:00'), quiet, ZONE)).toBe(false);
    expect(inQuietHours(new Date('2026-08-23T08:59:00+02:00'), quiet, ZONE)).toBe(false);
  });

  test('two equal ends mean quiet hours are off, not silence forever', () => {
    const quiet = { from: '22:00', to: '22:00' };
    const walked = [0, 6, 12, 18, 22, 23].map((hour) =>
      inQuietHours(new Date(`2026-08-23T${String(hour).padStart(2, '0')}:00:00+02:00`), quiet, ZONE),
    );
    console.log(`equal ends over six hours: ${walked.join(', ')}`);
    expect(walked.every((quietNow) => quietNow === false)).toBe(true);
  });

  test('an item ready inside quiet hours is dropped, never saved up', () => {
    const plan = planSweep({
      items: [item({ id: 'a' }), item({ id: 'b', category: 'menu' })],
      settings: ON,
      quiet: { from: '22:00', to: '07:00' },
      now: new Date('2026-08-23T23:15:00+02:00'),
      timeZone: ZONE,
      route: ROUTE,
      badge: 2,
    });
    console.log(`at 23:15 inside quiet hours: suppressed=${plan.suppressed.join(',')}`);
    expect(plan.send).toBeNull();
    expect(plan.suppressed).toEqual(['a', 'b']);
    // Dropped rather than deferred: a stack of last night arriving at 07:00 is
    // about things that have already passed.
    expect(plan.waiting).toEqual([]);
  });

  test('a wall time is a wall time or it is not stored', () => {
    const good = ['00:00', '07:00', '22:00', '23:59'];
    const bad = ['24:00', '7:00', '22:60', '22', 'evening', ''];
    console.log(`walked ${good.length + bad.length} candidates`);
    expect(good.every(isWallTime)).toBe(true);
    expect(bad.some(isWallTime)).toBe(false);
    expect(DEFAULT_QUIET_HOURS).toEqual({ from: '22:00', to: '07:00' });
  });
});
