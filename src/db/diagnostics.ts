import { desc, sql } from 'drizzle-orm';
import { getDb } from './client';
import { deviceObservation, requestOrigin } from './schema';

/**
 * The diagnostics the running system can answer about itself, read and written
 * here so the endpoints stay thin.
 *
 * Everything below is an observation, never a permission. Nothing in this file
 * is read by an authorization decision.
 */

/**
 * The four signal names, spelled the way `.forge/PREFLIGHT.md` reads them back.
 * Change one of these and a preflight line stops matching, so they are keys and
 * not prose.
 */
export const SIGNALS = {
  standaloneSeen: 'standalone_seen',
  wakeLockAvailable: 'wake_lock_available',
  passkeyRegistered: 'passkey_registered',
  pushSubscription: 'push_subscription',
} as const;

export type SignalName = keyof typeof SIGNALS;

export type DeviceDiagnostics = {
  standaloneSeen: boolean;
  wakeLockAvailable: boolean;
  passkeyRegistered: boolean;
  pushSubscription: boolean;
  firstObservedAt: Record<SignalName, string | null>;
  lastReportedAt: Record<SignalName, string | null>;
  tailscaleProxySeen: boolean;
  recentPeers: Array<{ address: string; viaTailscale: boolean; lastSeenAt: string }>;
};

/**
 * How many distinct peer addresses the endpoint hands back. Five is enough to
 * show a Mac, a phone and a laptop without turning the answer into a log.
 */
const PEER_LIMIT = 5;

/**
 * One launch of the app, as the browser saw itself. True is sticky: the
 * question the preflight asks is whether a standalone launch has ever been
 * seen, and opening the same install in Safari afterwards does not un-see it.
 * The two timestamps keep that honest, one for when it first became true and
 * one for the last launch that reported at all.
 *
 * Wake Lock is only believed from a launch that was standalone. The preflight
 * line asks whether the installed app on the phone has it, and a desktop
 * browser tab answering yes would answer a different question. No launch is
 * told apart from any other here, because telling them apart would mean
 * storing a device identifier, and this endpoint stores none.
 */
export async function recordDeviceLaunch(report: {
  standalone: boolean;
  wakeLock: boolean;
}): Promise<void> {
  const db = getDb();
  const rows = [
    { signal: SIGNALS.standaloneSeen, observed: report.standalone },
    ...(report.standalone
      ? [{ signal: SIGNALS.wakeLockAvailable, observed: report.wakeLock }]
      : []),
  ];

  for (const row of rows) {
    await db
      .insert(deviceObservation)
      .values({
        signal: row.signal,
        observed: row.observed,
        firstObservedAt: row.observed ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: deviceObservation.signal,
        set: {
          observed: sql`${deviceObservation.observed} or excluded.observed`,
          firstObservedAt: sql`coalesce(${deviceObservation.firstObservedAt}, excluded.first_observed_at)`,
          lastReportedAt: sql`now()`,
        },
      });
  }
}

/**
 * A visit to the app root, reduced to its origin. Called only for a request
 * that came through the Tailscale proxy, which is the only kind that carries a
 * real peer address. A request straight to the loopback port arrives from the
 * container bridge and has nothing about a visitor to store.
 */
export async function recordRequestOrigin(origin: {
  peerAddress: string;
  viaTailscale: boolean;
}): Promise<void> {
  const db = getDb();
  await db
    .insert(requestOrigin)
    .values({ peerAddress: origin.peerAddress, viaTailscale: origin.viaTailscale })
    .onConflictDoUpdate({
      target: requestOrigin.peerAddress,
      set: { viaTailscale: sql`excluded.via_tailscale`, lastSeenAt: sql`now()` },
    });
}

export async function readDeviceDiagnostics(): Promise<DeviceDiagnostics> {
  const db = getDb();
  const [signals, peers] = await Promise.all([
    db.select().from(deviceObservation),
    db.select().from(requestOrigin).orderBy(desc(requestOrigin.lastSeenAt)).limit(PEER_LIMIT),
  ]);

  const bySignal = new Map(signals.map((row) => [row.signal, row]));
  const observed = (name: SignalName) => bySignal.get(SIGNALS[name])?.observed === true;
  const firstAt = (name: SignalName) =>
    bySignal.get(SIGNALS[name])?.firstObservedAt?.toISOString() ?? null;
  const lastAt = (name: SignalName) =>
    bySignal.get(SIGNALS[name])?.lastReportedAt?.toISOString() ?? null;

  return {
    standaloneSeen: observed('standaloneSeen'),
    wakeLockAvailable: observed('wakeLockAvailable'),
    // passkeyRegistered gets its source in slice 2, from the registration
    // ceremony. Push lands in slice 12 and until then reads false because
    // nothing has been observed, which is the truth.
    passkeyRegistered: observed('passkeyRegistered'),
    pushSubscription: observed('pushSubscription'),
    firstObservedAt: {
      standaloneSeen: firstAt('standaloneSeen'),
      wakeLockAvailable: firstAt('wakeLockAvailable'),
      passkeyRegistered: firstAt('passkeyRegistered'),
      pushSubscription: firstAt('pushSubscription'),
    },
    lastReportedAt: {
      standaloneSeen: lastAt('standaloneSeen'),
      wakeLockAvailable: lastAt('wakeLockAvailable'),
      passkeyRegistered: lastAt('passkeyRegistered'),
      pushSubscription: lastAt('pushSubscription'),
    },
    tailscaleProxySeen: peers.some((peer) => peer.viaTailscale),
    recentPeers: peers.map((peer) => ({
      address: peer.peerAddress,
      viaTailscale: peer.viaTailscale,
      lastSeenAt: peer.lastSeenAt.toISOString(),
    })),
  };
}

/**
 * A passkey registered successfully. Written the same way a launch is: sticky
 * true, timestamped once when it first became true and again on every later
 * report.
 *
 * `.forge/PREFLIGHT.md` greps this key, and until slice 2 nothing wrote it, so
 * it answered false because nothing had been observed. Now it has a source.
 * The other three signals are untouched.
 */
export async function recordPasskeyRegistered(): Promise<void> {
  const db = getDb();
  await db
    .insert(deviceObservation)
    .values({
      signal: SIGNALS.passkeyRegistered,
      observed: true,
      firstObservedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: deviceObservation.signal,
      set: {
        observed: sql`${deviceObservation.observed} or excluded.observed`,
        firstObservedAt: sql`coalesce(${deviceObservation.firstObservedAt}, excluded.first_observed_at)`,
        lastReportedAt: sql`now()`,
      },
    });
}
