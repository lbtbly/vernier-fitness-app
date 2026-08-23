import { desc, eq } from 'drizzle-orm';
import { getDb } from './client';
import { pushDelivery, pushSubscription } from './schema';
import { getConfig } from '@/lib/config';
import { pushKeys } from '@/lib/push/keys';
import type { NotificationPlan } from '@/lib/push/payload';
import {
  type DeliveryRecord,
  type PushTransport,
  type SendResult,
  type StoredSubscription,
  type SubscriptionStore,
  endpointTail,
  sendToAll,
} from '@/lib/push/registry';
import type { WireSubscription } from '@/lib/push/subscription';
import { strings } from '@/lib/strings';

/**
 * The Postgres side of push: the subscription table, the delivery log, and the
 * transport that actually talks to Apple.
 *
 * What DECIDES is in src/lib/push/registry.ts and is graded over a memory store.
 * What is here is the store and the wire, kept thin enough to read in one
 * sitting, because that is the deal that lets the rule be tested without a
 * database and still be the rule that runs.
 */

export type SubscriptionRow = typeof pushSubscription.$inferSelect;

/** Everything the diagnostics screen is allowed to know about a subscription. */
export type SubscriptionView = {
  id: string;
  endpointTail: string;
  applicationServerKey: string;
  createdAt: string;
  lastSeenAt: string;
  lastStatus: number | null;
  lastStatusAt: string | null;
};

export function toSubscriptionView(row: SubscriptionRow): SubscriptionView {
  return {
    id: row.id,
    endpointTail: endpointTail(row.endpoint),
    applicationServerKey: row.applicationServerKey,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    lastStatus: row.lastStatus,
    lastStatusAt: row.lastStatusAt?.toISOString() ?? null,
  };
}

/**
 * Stores a subscription, or moves the one that is already there forward.
 *
 * ARRIVING TWICE IS THE NORMAL CASE, not the error case. The app re-reads and
 * re-posts on every launch, because iOS never fires `pushsubscriptionchange`
 * and a rotated endpoint is otherwise invisible. So the same endpoint arriving
 * again is a heartbeat, and a different endpoint from the same device is a
 * rotation: both are inserts against a unique endpoint, and the conflict path
 * moves `lastSeenAt` and re-reads the key the device subscribed with.
 */
export async function storeSubscription(input: {
  subscription: WireSubscription;
  userAgent: string;
}): Promise<{ view: SubscriptionView; created: boolean }> {
  const db = getDb();
  const existing = await db
    .select({ id: pushSubscription.id })
    .from(pushSubscription)
    .where(eq(pushSubscription.endpoint, input.subscription.endpoint));

  const [row] = await db
    .insert(pushSubscription)
    .values({
      id: crypto.randomUUID(),
      endpoint: input.subscription.endpoint,
      p256dh: input.subscription.keys.p256dh,
      auth: input.subscription.keys.auth,
      applicationServerKey: input.subscription.applicationServerKey,
      userAgent: input.userAgent,
    })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: {
        p256dh: input.subscription.keys.p256dh,
        auth: input.subscription.keys.auth,
        applicationServerKey: input.subscription.applicationServerKey,
        userAgent: input.userAgent,
        lastSeenAt: new Date(),
      },
    })
    .returning();

  return { view: toSubscriptionView(row), created: existing.length === 0 };
}

export async function forgetSubscription(endpoint: string): Promise<boolean> {
  const db = getDb();
  const gone = await db
    .delete(pushSubscription)
    .where(eq(pushSubscription.endpoint, endpoint))
    .returning({ id: pushSubscription.id });
  return gone.length > 0;
}

export async function readSubscriptions(): Promise<SubscriptionView[]> {
  const db = getDb();
  const rows = await db.select().from(pushSubscription).orderBy(desc(pushSubscription.lastSeenAt));
  return rows.map(toSubscriptionView);
}

/**
 * What the diagnostics probe asks: does this machine hold THIS endpoint, and
 * what happened the last time it sent to it.
 *
 * The three answers that separate "the phone never subscribed" from "the phone
 * thinks it did and this machine disagrees" from "both agree and Apple refused
 * the send". Nothing here returns the endpoint, the keys or the private half of
 * anything: a tail, a status code and a time.
 */
export async function probeSubscription(endpoint: string): Promise<{
  known: boolean;
  knownTail: string | null;
  applicationServerKey: string | null;
  lastStatus: number | null;
  lastStatusAt: string | null;
}> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(pushSubscription)
    .where(eq(pushSubscription.endpoint, endpoint));
  if (!row) {
    return {
      known: false,
      knownTail: null,
      applicationServerKey: null,
      lastStatus: null,
      lastStatusAt: null,
    };
  }
  const view = toSubscriptionView(row);
  return {
    known: true,
    knownTail: view.endpointTail,
    applicationServerKey: view.applicationServerKey,
    lastStatus: view.lastStatus,
    lastStatusAt: view.lastStatusAt,
  };
}

/** The delivery log, newest first, for the operator surface. */
export async function readDeliveries(limit = 20) {
  const db = getDb();
  const rows = await db.select().from(pushDelivery).orderBy(desc(pushDelivery.at)).limit(limit);
  return rows.map((row) => ({
    id: row.id,
    endpointTail: row.endpointTail,
    kind: row.kind,
    status: row.status,
    removed: row.removed,
    at: row.at.toISOString(),
  }));
}

/**
 * The store the rule runs over. Four statements, no branching, nothing to get
 * wrong that reading it would not show.
 */
export function postgresSubscriptionStore(): SubscriptionStore {
  return {
    async list(): Promise<StoredSubscription[]> {
      const db = getDb();
      const rows = await db.select().from(pushSubscription);
      return rows.map((row) => ({
        id: row.id,
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
        applicationServerKey: row.applicationServerKey,
      }));
    },
    async remove(id: string): Promise<void> {
      const db = getDb();
      await db.delete(pushSubscription).where(eq(pushSubscription.id, id));
    },
    async record(record: DeliveryRecord): Promise<void> {
      const db = getDb();
      await db.insert(pushDelivery).values({
        id: crypto.randomUUID(),
        subscriptionId: record.subscriptionId,
        endpointTail: record.endpointTail,
        kind: record.kind,
        status: record.status,
        apnsId: record.apnsId,
        detail: record.detail,
        removed: record.removed,
      });
      if (record.removed) return;
      await db
        .update(pushSubscription)
        .set({
          lastStatus: record.status,
          lastStatusAt: new Date(),
          lastApnsId: record.apnsId,
        })
        .where(eq(pushSubscription.id, record.subscriptionId));
    },
  };
}

/**
 * The transport, and the only place in this repository that reads the private
 * half of the VAPID pair.
 *
 * `web-push` is imported inside the function rather than at the top of the
 * file, so a page that imports anything else out of this module does not drag a
 * Node-only dependency into a bundle that has no use for it.
 *
 * A `WebPushError` carries the push service's status code, which is exactly
 * what the rule upstairs needs; anything else that throws is reported as a zero,
 * which is not a code any service returns and so can never be read as one.
 */
export function webPushTransport(): PushTransport {
  return async ({ subscription, payload }) => {
    const keys = pushKeys();
    if (!keys.ok) return { status: 0, apnsId: null, detail: keys.error };

    const webpush = (await import('web-push')).default;
    try {
      const answer = await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
        {
          vapidDetails: {
            subject: keys.keys.subject,
            publicKey: keys.keys.publicKey,
            privateKey: keys.keys.privateKey,
          },
          // Twelve hours. A reminder that has waited longer than that is about
          // something that has already happened, and delivering it then is
          // worse than not delivering it.
          TTL: 43_200,
        },
      );
      return {
        status: answer.statusCode,
        apnsId: answer.headers?.['apns-id'] ?? null,
        detail: '',
      };
    } catch (error) {
      const failure = error as { statusCode?: number; headers?: Record<string, string>; message?: string };
      return {
        status: typeof failure.statusCode === 'number' ? failure.statusCode : 0,
        apnsId: failure.headers?.['apns-id'] ?? null,
        detail: failure.message ?? '',
      };
    }
  };
}

/**
 * Sends one notification to every subscribed device, through the real store and
 * the real wire.
 *
 * THE KEY CHECK IS FIRST AND IT REFUSES RATHER THAN DEGRADES. F113: the app
 * refuses to send when the pair is absent. A send attempted with no key would
 * be one 403 per device, four delivery rows saying the wrong thing, and a
 * diagnostics screen pointing at Apple for a value that is missing on this
 * machine.
 */
export async function sendNotification(
  plan: NotificationPlan,
  kind: string,
  transport: PushTransport = webPushTransport(),
): Promise<SendResult> {
  const keys = pushKeys();
  if (!keys.ok) {
    return { ok: false, reason: 'no-keys', error: keys.error, detail: keys.detail };
  }
  const store = postgresSubscriptionStore();
  const devices = await store.list();
  if (devices.length === 0) {
    return {
      ok: false,
      reason: 'no-devices',
      error: strings.api.push.noSubscriptions,
      detail: strings.api.push.noSubscriptionsDetail,
    };
  }
  return sendToAll(store, transport, plan, getConfig().appUrl, kind);
}
