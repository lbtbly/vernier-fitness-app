import { describe, expect, test } from 'vitest';
import { MAX_PAYLOAD_BYTES, buildPayload, isUserVisible } from '@/lib/push/payload';
import type { NotificationPlan } from '@/lib/push/payload';
import { strings } from '@/lib/strings';

/**
 * F115: both shapes in one body, a non-empty title, and a send that would show
 * nothing refused at the source.
 *
 * WHY THE REFUSAL IS NOT A DETAIL. Apple: "Safari doesn't support invisible
 * push notifications. Present push notifications to the user immediately after
 * your service worker receives them. If you don't, Safari revokes the push
 * notification permission for your site." So a payload with no title does not
 * become an empty notification and does not become a quiet no-op: it never
 * leaves this machine.
 *
 * WHAT WOULD MAKE THIS GO RED. Defaulting a missing title to the product name,
 * which is the obvious kindness and is exactly wrong: it would make an
 * unreadable send look like a working one and hide the caller that produced it.
 */

const ORIGIN = 'https://lamberts-mac-mini.tailda76d6.ts.net';

const PLAN: NotificationPlan = {
  title: 'Home strength at 07:00',
  body: 'At home. Tap Done once it is finished.',
  tag: 'vernier-reminders-2026-08-23T20:00',
  route: '/reminders',
  itemIds: ['item-1', 'item-2'],
  badge: 2,
};

describe('the payload', () => {
  test('carries the declarative shape and the classic one together', () => {
    const built = buildPayload(PLAN, ORIGIN);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const { payload } = built;

    // Declarative Web Push, iOS 18.4 and Safari 18.5 onward. The marker is the
    // opt-in and the title is required.
    expect(payload.web_push).toBe(8030);
    expect(payload.notification.title).toBe(PLAN.title);
    expect(payload.notification.body).toBe(PLAN.body);
    expect(payload.notification.silent).toBe(false);
    expect(payload.notification.app_badge).toBe('2');
    // Absolute, because the platform navigates to it with no origin of its own.
    expect(payload.notification.navigate).toBe(`${ORIGIN}/reminders`);

    // The classic shape our own worker reads, app-relative.
    expect(payload.title).toBe(PLAN.title);
    expect(payload.body).toBe(PLAN.body);
    expect(payload.url).toBe('/reminders');
    expect(payload.itemIds).toEqual(['item-1', 'item-2']);
    console.log(`payload keys: ${Object.keys(payload).sort().join(', ')}`);
    console.log(`declarative keys: ${Object.keys(payload.notification).sort().join(', ')}`);
  });

  test('the notification carries the Done action, with its words from the catalogue', () => {
    const built = buildPayload(PLAN, ORIGIN);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.payload.actions).toEqual([
      { action: 'done', title: strings.notification.doneAction },
    ]);
  });

  test('a plan with no title is refused, and the refusal says why', () => {
    const built = buildPayload({ ...PLAN, title: '   ' }, ORIGIN);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.reason).toBe('no-title');
    expect(built.error).toBe(strings.api.push.refusedSilent);
    console.log(`refused: ${built.error} ${built.detail}`);
  });

  test('a plan with no body is refused too', () => {
    const built = buildPayload({ ...PLAN, body: '' }, ORIGIN);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.reason).toBe('no-body');
  });

  test('a payload over four kilobytes is refused here rather than by a 413', () => {
    const built = buildPayload({ ...PLAN, body: 'x'.repeat(MAX_PAYLOAD_BYTES) }, ORIGIN);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.reason).toBe('too-large');
  });

  test('a real plan sits well inside the budget', () => {
    const built = buildPayload(PLAN, ORIGIN);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    console.log(`payload is ${built.bytes} bytes of ${MAX_PAYLOAD_BYTES}`);
    expect(built.bytes).toBeLessThan(MAX_PAYLOAD_BYTES);
    expect(built.bytes).toBeGreaterThan(0);
  });

  test('a route with no leading slash is still an absolute navigate', () => {
    const built = buildPayload({ ...PLAN, route: 'reminders' }, ORIGIN);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.payload.notification.navigate).toBe(`${ORIGIN}/reminders`);
    expect(built.payload.url).toBe('/reminders');
  });

  test('a badge of zero is a zero, which clears rather than draws a dot', () => {
    const built = buildPayload({ ...PLAN, badge: 0 }, ORIGIN);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.payload.notification.app_badge).toBe('0');
  });
});

describe('the second question, asked of the finished bytes', () => {
  test('a well-formed payload is user visible', () => {
    const built = buildPayload(PLAN, ORIGIN);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(isUserVisible(built.payload)).toBe(true);
  });

  test('a payload whose title was emptied afterwards is not', () => {
    const built = buildPayload(PLAN, ORIGIN);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // The positive control for the belt-and-braces check in sendToAll: if the
    // builder ever stopped enforcing a title, this is the shape that would
    // reach the transport, and the second check is what stops it.
    expect(isUserVisible({ ...built.payload, title: '' })).toBe(false);
    expect(
      isUserVisible({
        ...built.payload,
        notification: { ...built.payload.notification, title: ' ' },
      }),
    ).toBe(false);
  });
});
