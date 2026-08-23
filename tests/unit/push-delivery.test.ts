import { describe, expect, test } from 'vitest';
import {
  DELIVERED_STATUSES,
  GONE_STATUSES,
  KEPT_STATUSES,
  deletesSubscription,
  deliveryOutcome,
} from '@/lib/push/status';
import {
  type DeliveryRecord,
  type PushTransport,
  type StoredSubscription,
  type SubscriptionStore,
  endpointTail,
  sendToAll,
} from '@/lib/push/registry';
import type { NotificationPlan } from '@/lib/push/payload';

/**
 * F116, walked over all six status codes, with the row state printed after each.
 *
 * 404 and 410 are facts about the SUBSCRIPTION: it is not there any more, and a
 * row that stays is a machine sending into a hole forever. 400, 403, 413 and
 * 429 are facts about the SEND: the key pair, the payload, the rate. Deleting
 * on a 429 would throw away a live subscription because the owner tapped the
 * test button twice, and he would then have to notice, and re-subscribe, from a
 * phone that had stopped telling him anything.
 *
 * WHAT WOULD MAKE THIS GO RED. Widening the gone set to "anything above 399",
 * which is the shape somebody reaches for when a 403 keeps arriving. The six
 * codes are asserted one at a time, against the rows that exist afterwards, and
 * the population is printed on every run so a green pass cannot be a pass over
 * an empty store.
 */

const ORIGIN = 'https://lamberts-mac-mini.tailda76d6.ts.net';

const PLAN: NotificationPlan = {
  title: 'Home strength at 07:00',
  body: 'At home. Tap Done once it is finished.',
  tag: 'vernier-reminders-2026-08-23T20:00',
  route: '/reminders',
  itemIds: ['item-1'],
  badge: 1,
};

function memoryStore(seed: StoredSubscription[]) {
  const rows = new Map(seed.map((row) => [row.id, row]));
  const deliveries: DeliveryRecord[] = [];
  const store: SubscriptionStore = {
    async list() {
      return [...rows.values()];
    },
    async remove(id) {
      rows.delete(id);
    },
    async record(record) {
      deliveries.push(record);
    },
  };
  return { store, rows, deliveries };
}

function device(id: string): StoredSubscription {
  return {
    id,
    endpoint: `https://web.push.apple.com/${id}-abcdefghijkl`,
    p256dh: 'BP256',
    auth: 'AUTH',
    applicationServerKey: 'BServerKey',
  };
}

const answering = (status: number): PushTransport => async () => ({
  status,
  apnsId: 'apns-1',
  detail: '',
});

describe('what a push service answer does to the stored row', () => {
  test('the six codes F116 names, one at a time, with the rows after each', async () => {
    const walked: string[] = [];
    for (const status of [404, 410, 400, 403, 413, 429]) {
      const { store, rows, deliveries } = memoryStore([device('one')]);
      expect(rows.size).toBe(1);
      const result = await sendToAll(store, answering(status), PLAN, ORIGIN, 'test');
      const after = rows.size;
      walked.push(`${status}: ${after} row(s) after, delivery logged removed=${deliveries[0].removed}`);
      expect(result.ok).toBe(true);
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].status).toBe(status);
      if (status === 404 || status === 410) {
        expect(after).toBe(0);
        expect(deliveries[0].removed).toBe(true);
      } else {
        expect(after).toBe(1);
        expect(deliveries[0].removed).toBe(false);
      }
    }
    console.log(`six codes walked over a store that held one row each time:\n  ${walked.join('\n  ')}`);
    expect(walked).toHaveLength(6);
  });

  test('a 201 keeps the row and counts as sent', async () => {
    const { store, rows, deliveries } = memoryStore([device('one'), device('two')]);
    const result = await sendToAll(store, answering(201), PLAN, ORIGIN, 'reminder');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    console.log(`two devices, both 201: ${result.sent} sent, ${rows.size} row(s) remain`);
    expect(result.sent).toBe(2);
    expect(result.removed).toBe(0);
    expect(rows.size).toBe(2);
    expect(deliveries.every((delivery) => delivery.removed === false)).toBe(true);
  });

  test('one gone device does not take the live one with it', async () => {
    const { store, rows } = memoryStore([device('gone'), device('live')]);
    const transport: PushTransport = async ({ subscription }) => ({
      status: subscription.id === 'gone' ? 410 : 201,
      apnsId: null,
      detail: '',
    });
    const result = await sendToAll(store, transport, PLAN, ORIGIN, 'reminder');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    console.log(`answers: ${result.answers.map((a) => `${a.endpointTail}=${a.status}/${a.outcome}`).join(', ')}`);
    expect(result.removed).toBe(1);
    expect(result.sent).toBe(1);
    expect([...rows.keys()]).toEqual(['live']);
  });

  test('a transport that threw is recorded as a zero and never as a status', async () => {
    const { store, rows, deliveries } = memoryStore([device('one')]);
    const transport: PushTransport = async () => {
      throw new Error('socket hang up');
    };
    const result = await sendToAll(store, transport, PLAN, ORIGIN, 'reminder');
    expect(result.ok).toBe(true);
    expect(deliveries[0].status).toBe(0);
    // Zero is not a code any push service returns, so it can never be read as
    // one, and it is not in the gone set, so the row survives a bad network.
    expect(rows.size).toBe(1);
    expect(deletesSubscription(0)).toBe(false);
  });

  test('the delivery is recorded before the row is removed', async () => {
    const order: string[] = [];
    const rows = new Map([['one', device('one')]]);
    const store: SubscriptionStore = {
      async list() {
        return [...rows.values()];
      },
      async remove(id) {
        order.push('remove');
        rows.delete(id);
      },
      async record() {
        order.push('record');
      },
    };
    await sendToAll(store, answering(410), PLAN, ORIGIN, 'reminder');
    console.log(`order on a 410: ${order.join(' then ')}`);
    // The reason a subscription disappeared has to outlive the subscription.
    expect(order).toEqual(['record', 'remove']);
  });
});

describe('the status vocabulary itself', () => {
  test('the three sets are disjoint and name what F116 names', () => {
    expect([...GONE_STATUSES]).toEqual([404, 410]);
    expect([...KEPT_STATUSES]).toEqual([400, 403, 413, 429]);
    const all = [...GONE_STATUSES, ...KEPT_STATUSES, ...DELIVERED_STATUSES];
    expect(new Set(all).size).toBe(all.length);
  });

  test('every code outside the gone set keeps the row', () => {
    const kept: number[] = [];
    for (let status = 200; status < 600; status += 1) {
      if (deletesSubscription(status)) continue;
      kept.push(status);
    }
    console.log(`${kept.length} of 400 codes keep the row; the two that do not are 404 and 410`);
    expect(kept).toHaveLength(398);
    expect(deliveryOutcome(404)).toBe('gone');
    expect(deliveryOutcome(410)).toBe('gone');
    expect(deliveryOutcome(201)).toBe('delivered');
    expect(deliveryOutcome(429)).toBe('kept');
  });
});

describe('the tail that reaches a screen', () => {
  test('is twelve characters and never the endpoint', () => {
    const tail = endpointTail('https://web.push.apple.com/one-abcdefghijkl');
    expect(tail).toBe('abcdefghijkl');
    expect(tail).toHaveLength(12);
  });
});
