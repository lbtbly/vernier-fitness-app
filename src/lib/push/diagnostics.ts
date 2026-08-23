import { strings } from '@/lib/strings';

/**
 * The eleven rows, in the order they have to pass, and the rule that only the
 * first failure is answered.
 *
 * ORDER IS THE FEATURE. A phone in a Safari tab fails secure context, installed
 * state, the Notification interface, permission, subscription, key match and
 * server knowledge all at once, and a screen that shows seven red rows has told
 * the owner nothing he can act on. One remedy, for the first thing that is
 * wrong, and everything under it is stated as not checked rather than as
 * passing or failing, because its answer is meaningless until the row above it
 * is fixed. Reporting a check that did not run as a pass is the failure this
 * project has now found seven times.
 *
 * TWO ROWS EARN THE SCREEN. `subscription` against `serverKnown`, which
 * separates "this phone never subscribed" from "this phone thinks it did and
 * the Mac mini disagrees", and `delivery`, which turns "it does not work" into
 * a number from Apple's own table.
 *
 * Pure. The browser facts come in as an object, so the ordering is graded in
 * the unit suite with no browser, and the component that gathers them does
 * nothing but gather them.
 */

export const PUSH_CHECK_IDS = [
  'secure',
  'installed',
  'notifications',
  'platform',
  'permission',
  'worker',
  'subscription',
  'keyMatch',
  'serverKnown',
  'delivery',
  'badge',
] as const;

export type PushCheckId = (typeof PUSH_CHECK_IDS)[number];

/** Eleven, stated as a number, because F114 and PLAN.md both count them. */
export const PUSH_CHECK_COUNT = PUSH_CHECK_IDS.length;

export type PushFacts = {
  secureContext: boolean;
  standalone: boolean;
  notificationApi: boolean;
  /** The iOS major.minor the user agent reports, or null off an Apple mobile platform. */
  platformVersion: number | null;
  permission: 'granted' | 'denied' | 'default' | 'unavailable';
  workerState: 'active' | 'installing' | 'waiting' | 'none';
  localEndpoint: string | null;
  localApplicationServerKey: string | null;
  serverApplicationServerKey: string | null;
  /** Null when the probe could not reach the Mac mini at all. */
  serverKnowsEndpoint: boolean | null;
  lastStatus: number | null;
  lastStatusAt: string | null;
  badgeWorks: boolean;
};

export type RowState = 'passed' | 'failed' | 'not-checked';

export type PushCheckRow = {
  id: PushCheckId;
  label: string;
  state: RowState;
  detail: string;
  /** Rendered where the row is the first failure, and nowhere else. */
  remedy: string;
};

/** Web Push needs iOS 16.4. Below it there is nothing to diagnose. */
export const MINIMUM_IOS = 16.4;

/** What a push service returns on success. Anything else is worth a remedy. */
const DELIVERED = [200, 201, 202];

const LABELS = strings.push.checks;

function tail(endpoint: string): string {
  return endpoint.slice(-12);
}

/**
 * The eleven answers, before the stop rule is applied. Each one is a boolean
 * and a detail, and none of them knows about any other.
 */
function answers(facts: PushFacts): Array<{ id: PushCheckId; ok: boolean; detail: string }> {
  const detail = strings.push.detail;
  return [
    {
      id: 'secure',
      ok: facts.secureContext,
      detail: facts.secureContext ? detail.present : detail.absent,
    },
    {
      id: 'installed',
      ok: facts.standalone,
      detail: facts.standalone ? detail.standalone : detail.browserTab,
    },
    {
      id: 'notifications',
      ok: facts.notificationApi,
      detail: facts.notificationApi ? detail.present : detail.absent,
    },
    {
      /*
       * A null version is a pass, not a failure. The user agent is the only
       * signal a browser gives here, and a Mac reports no iOS version at all:
       * failing it would tell the owner to upgrade an iPhone he is not holding.
       */
      id: 'platform',
      ok: facts.platformVersion === null || facts.platformVersion >= MINIMUM_IOS,
      detail:
        facts.platformVersion === null
          ? detail.platformUnknown
          : detail.platformVersion(facts.platformVersion.toFixed(1)),
    },
    {
      id: 'permission',
      ok: facts.permission === 'granted',
      detail: strings.push.permissions[facts.permission],
    },
    {
      id: 'worker',
      ok: facts.workerState === 'active',
      detail:
        facts.workerState === 'none'
          ? detail.workerNone
          : strings.push.workerStates[facts.workerState],
    },
    {
      id: 'subscription',
      ok: facts.localEndpoint !== null,
      detail: facts.localEndpoint === null ? detail.none : detail.endpointTail(tail(facts.localEndpoint)),
    },
    {
      /*
       * A rotated server key breaks delivery with no error anywhere: the device
       * holds a subscription, the Mac mini holds the row, and the push service
       * refuses every send with a 403 that nothing on the phone can see.
       */
      id: 'keyMatch',
      ok:
        facts.localApplicationServerKey !== null &&
        facts.serverApplicationServerKey !== null &&
        facts.localApplicationServerKey === facts.serverApplicationServerKey,
      detail:
        facts.localApplicationServerKey === null || facts.serverApplicationServerKey === null
          ? detail.none
          : facts.localApplicationServerKey === facts.serverApplicationServerKey
            ? detail.matches
            : detail.differs,
    },
    {
      id: 'serverKnown',
      ok: facts.serverKnowsEndpoint === true,
      detail:
        facts.serverKnowsEndpoint === null
          ? detail.unreachable
          : facts.serverKnowsEndpoint && facts.localEndpoint
            ? detail.known(tail(facts.localEndpoint))
            : detail.unknown,
    },
    {
      /*
       * Never sent is a pass. A device subscribed a minute ago has no delivery
       * behind it, and calling that a failure would put a remedy on a screen
       * where nothing is wrong. What fails is a send that a push service
       * refused, which is a number the owner can act on.
       */
      id: 'delivery',
      ok: facts.lastStatus === null || DELIVERED.includes(facts.lastStatus),
      detail:
        facts.lastStatus === null
          ? detail.neverSent
          : detail.lastSend(facts.lastStatus, facts.lastStatusAt ?? ''),
    },
    {
      id: 'badge',
      ok: facts.badgeWorks,
      detail: facts.badgeWorks ? detail.badgeWorks : detail.badgeRefused,
    },
  ];
}

/**
 * The eleven rows as the screen draws them: everything above the first failure
 * passed, the first failure with its remedy, everything below it not checked.
 */
export function pushDiagnostics(facts: PushFacts): PushCheckRow[] {
  const rows: PushCheckRow[] = [];
  let stopped = false;
  for (const answer of answers(facts)) {
    const label = LABELS[answer.id].label;
    const remedy = LABELS[answer.id].remedy;
    if (stopped) {
      rows.push({ id: answer.id, label, state: 'not-checked', detail: '', remedy });
      continue;
    }
    if (answer.ok) {
      rows.push({ id: answer.id, label, state: 'passed', detail: answer.detail, remedy });
      continue;
    }
    stopped = true;
    rows.push({ id: answer.id, label, state: 'failed', detail: answer.detail, remedy });
  }
  return rows;
}

/** The row the screen answers, or null when all eleven pass. */
export function firstFailure(rows: PushCheckRow[]): PushCheckRow | null {
  return rows.find((row) => row.state === 'failed') ?? null;
}

/**
 * The iOS version out of a user agent, as major.minor. Best effort and stated
 * as such: the user agent string is the only signal a browser offers, there is
 * no API for it, and a Mac has no answer to give.
 */
export function platformVersionOf(userAgent: string): number | null {
  const match = /(?:iPhone |CPU )OS (\d+)[._](\d+)/.exec(userAgent);
  if (!match) return null;
  return Number(match[1]) + Number(match[2]) / 10;
}
