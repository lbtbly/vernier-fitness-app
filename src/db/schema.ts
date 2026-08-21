import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * app_meta is the installation's own record: what this database is, when the
 * schema was first laid down, which build last booted against it. It is the
 * one table the walking skeleton owns. Every later slice adds its own.
 *
 * Nothing here is ever served to an unauthenticated caller. F2 keeps the
 * liveness endpoint to liveness.
 */
export const appMeta = pgTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * What the running system observed about the device it was launched from.
 *
 * Four preflight lines read these back by name, and a verifier is right to
 * refuse a screenshot as proof that the app opened from the Home Screen. So
 * the app records it: the browser reports display mode and Wake Lock on every
 * launch, and the two signals that have no source yet stay absent, which reads
 * as false. Absent is the truth until a later slice writes them.
 *
 * One row per signal, never one row per launch. The time is stored so a value
 * that has not been seen in months is visible as stale rather than as current.
 */
export const deviceObservation = pgTable('device_observation', {
  signal: text('signal').primaryKey(),
  observed: boolean('observed').notNull(),
  firstObservedAt: timestamp('first_observed_at', { withTimezone: true }),
  lastReportedAt: timestamp('last_reported_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Where requests to the app root arrived from: through the Tailscale HTTPS
 * proxy or not, and which tailnet address the proxy forwarded. F4 and R1 both
 * turn on a second device answering over HTTPS, and a visit nothing recorded
 * is a visit no command can read back.
 *
 * The address is the evidence, so the address is stored. Nothing else about
 * the visitor is: no user agent, no path, no identity header, no visit count.
 * One row per distinct address, its time overwritten on each visit.
 */
export const requestOrigin = pgTable('request_origin', {
  peerAddress: text('peer_address').primaryKey(),
  viaTailscale: boolean('via_tailscale').notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});
