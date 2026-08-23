import { type NotificationPlan, type PushPayload, buildPayload, isUserVisible } from './payload';
import { type DeliveryOutcome, deliveryOutcome } from './status';
import { strings } from '@/lib/strings';

/**
 * The send, over a store and a transport that are both arguments.
 *
 * WHY THE INTERFACES. What decides whether a 410 destroys a subscription and a
 * 429 leaves it alone is about fifteen lines of ordering, and those fifteen
 * lines are worth a test that needs no Postgres, no push service and no phone.
 * `src/db/idempotency.ts` already draws that line in this repository and it is
 * the precedent followed here: the rule is graded over a memory store, and the
 * Postgres implementation next door is thin enough to read in one sitting.
 *
 * F116 is walked over all six status codes in tests/unit/push-delivery.test.ts,
 * with the row state printed after each one.
 */

export type StoredSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  /** The VAPID public key this device subscribed with. A rotated key breaks delivery silently. */
  applicationServerKey: string;
};

export type DeliveryRecord = {
  subscriptionId: string;
  endpointTail: string;
  kind: string;
  status: number;
  apnsId: string | null;
  detail: string;
  removed: boolean;
};

export type SubscriptionStore = {
  list(): Promise<StoredSubscription[]>;
  /** Drops the row. Called for 404 and 410 and for nothing else. */
  remove(id: string): Promise<void>;
  /** Appends the delivery and stamps the subscription's last status, when it still exists. */
  record(record: DeliveryRecord): Promise<void>;
};

export type TransportAnswer = { status: number; apnsId: string | null; detail: string };

export type PushTransport = (input: {
  subscription: StoredSubscription;
  payload: string;
}) => Promise<TransportAnswer>;

/**
 * Why a send did not happen, and every one of these is a sentence the owner
 * reads rather than a code a log swallows. `no-keys` and `no-devices` are here
 * beside the three payload refusals because all five end the same way, with
 * nothing sent, and a caller that had to tell them apart by shape would end up
 * telling one of them wrong.
 */
export type SendRefusal = 'no-title' | 'no-body' | 'too-large' | 'no-keys' | 'no-devices';

export type SendResult =
  | {
      ok: true;
      payload: PushPayload;
      bytes: number;
      sent: number;
      removed: number;
      answers: Array<{ endpointTail: string; status: number; outcome: DeliveryOutcome }>;
    }
  | { ok: false; reason: SendRefusal; error: string; detail: string };

/** The last twelve characters of an endpoint. Enough to tell two apart, and no more. */
export function endpointTail(endpoint: string): string {
  return endpoint.slice(-12);
}

/**
 * Sends one notification to every stored device.
 *
 * The refusal comes first and it is unconditional. A plan with no title is not
 * sent to nobody, it is not sent quietly, and it does not become an empty
 * notification: it returns a refusal that the caller renders, because a push
 * that shows nothing costs the owner his entire subscription and he finds out
 * the next time something mattered.
 */
export async function sendToAll(
  store: SubscriptionStore,
  transport: PushTransport,
  plan: NotificationPlan,
  origin: string,
  kind: string,
): Promise<SendResult> {
  const built = buildPayload(plan, origin);
  if (!built.ok) return built;

  // The same question a second time, asked of the finished bytes rather than of
  // the plan. Cheap, and it is what stops a later edit inside buildPayload from
  // reopening the hole the refusal above closes.
  if (!isUserVisible(built.payload)) {
    return {
      ok: false,
      reason: 'no-title',
      error: strings.api.push.refusedSilent,
      detail: strings.api.push.refusedSilentDetail,
    };
  }

  const subscriptions = await store.list();
  const answers: Array<{ endpointTail: string; status: number; outcome: DeliveryOutcome }> = [];
  let sent = 0;
  let removed = 0;

  for (const subscription of subscriptions) {
    let answer: TransportAnswer;
    try {
      answer = await transport({ subscription, payload: built.json });
    } catch (error) {
      // A transport that threw rather than answered is a send that did not
      // reach a push service at all. It is recorded as a zero, which is not a
      // status code any service returns, so it can never be read as one.
      answer = { status: 0, apnsId: null, detail: (error as Error).message };
    }

    const outcome = deliveryOutcome(answer.status);
    const tail = endpointTail(subscription.endpoint);
    if (outcome === 'delivered') sent += 1;

    if (outcome === 'gone') {
      // The order matters: the delivery is recorded BEFORE the row goes, so the
      // reason the subscription disappeared survives the subscription.
      await store.record({
        subscriptionId: subscription.id,
        endpointTail: tail,
        kind,
        status: answer.status,
        apnsId: answer.apnsId,
        detail: answer.detail,
        removed: true,
      });
      await store.remove(subscription.id);
      removed += 1;
    } else {
      await store.record({
        subscriptionId: subscription.id,
        endpointTail: tail,
        kind,
        status: answer.status,
        apnsId: answer.apnsId,
        detail: answer.detail,
        removed: false,
      });
    }

    answers.push({ endpointTail: tail, status: answer.status, outcome });
  }

  return { ok: true, payload: built.payload, bytes: built.bytes, sent, removed, answers };
}
