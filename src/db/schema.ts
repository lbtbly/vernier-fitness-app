import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

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

/**
 * The owner. Exactly one row, forever, and the database is what enforces it:
 * `singleton` is always true and carries a unique index, so a second insert
 * fails inside Postgres rather than inside a race between two reads. F8 counts
 * the rows before and after the refused attempt.
 *
 * The Argon2id parameters live in columns beside the tag, not in a constant in
 * source. A verification reads memory, passes, parallelism and tag length off
 * this row, which is what lets the cost be raised later without invalidating
 * the password that was hashed under the old one, and what lets F10 read the
 * numbers it grades from the row it is grading.
 */
export const owner = pgTable(
  'owner',
  {
    id: text('id').primaryKey(),
    displayName: text('display_name').notNull(),
    singleton: boolean('singleton').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // base64, so a row read straight out of psql is legible without a cast.
    passwordTag: text('password_tag').notNull(),
    passwordNonce: text('password_nonce').notNull(),
    passwordAlgorithm: text('password_algorithm').notNull(),
    passwordMemory: integer('password_memory').notNull(),
    passwordPasses: integer('password_passes').notNull(),
    passwordParallelism: integer('password_parallelism').notNull(),
    passwordTagLength: integer('password_tag_length').notNull(),
    passwordUpdatedAt: timestamp('password_updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('owner_singleton').on(table.singleton)],
);

/**
 * One passkey. Several rows per owner by design: Touch ID on the Mac, the
 * iPhone, and whatever comes next.
 *
 * `counter` is stored exactly as the authenticator reported it and is never
 * synthesised. A passkey synced through iCloud Keychain reports 0 on every
 * assertion for the rest of its life, so a strictly-increasing replay check
 * would lock the owner out of his own app the second time he used his phone.
 * The rule the library actually applies is narrower and correct: refuse only
 * when a counter that has ever been non-zero fails to advance.
 */
export const webauthnCredential = pgTable('webauthn_credential', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => owner.id),
  publicKey: text('public_key').notNull(),
  counter: bigint('counter', { mode: 'number' }).notNull(),
  transports: text('transports').array().notNull().default([]),
  deviceType: text('device_type').notNull(),
  backedUp: boolean('backed_up').notNull(),
  aaguid: text('aaguid').notNull(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
});

/**
 * A challenge, held by the server for the length of one ceremony. The browser
 * gets an opaque handle and never a say in what the challenge is, the row is
 * deleted the moment it is spent, and an unspent row expires on its own.
 */
export const webauthnChallenge = pgTable('webauthn_challenge', {
  id: text('id').primaryKey(),
  challenge: text('challenge').notNull(),
  ceremony: text('ceremony').notNull(),
  ownerId: text('owner_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/**
 * A signed-in session. The primary key is the SHA-256 of the cookie value, so
 * the table a backup copies holds nothing that can be replayed as a session.
 * The anti-forgery token is stored beside it: same lifetime, same rotation, one
 * row to delete on sign-out.
 */
export const session = pgTable('session', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => owner.id),
  csrfToken: text('csrf_token').notNull(),
  method: text('method').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The local audit log. One row per sign-in attempt, whatever the outcome, and
 * the rate limiter reads its window from these rows rather than from memory so
 * a restart cannot be used to clear a lockout.
 *
 * Nothing here names a credential. The reason is a fixed phrase from a small
 * set, never the value that was tried.
 */
export const authAttempt = pgTable(
  'auth_attempt',
  {
    id: text('id').primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    method: text('method').notNull(),
    outcome: text('outcome').notNull(),
    reason: text('reason').notNull(),
    peer: text('peer').notNull(),
  },
  (table) => [index('auth_attempt_at').on(table.at)],
);

/**
 * A third-party credential, encrypted at rest with the master key. The
 * ciphertext, the nonce and the GCM tag are three columns; the plaintext exists
 * only inside the process that is making the call it belongs to.
 *
 * `keyFingerprint` is a SHA-256 of the key, truncated, so a wrong key is named
 * as a wrong key rather than surfacing as a corrupt row. Everything the settings
 * screen renders is on the other side of this comment: state, scope and last
 * successful sync.
 */
export const integrationCredential = pgTable('integration_credential', {
  provider: text('provider').primaryKey(),
  state: text('state').notNull(),
  scope: text('scope').notNull(),
  secretCiphertext: text('secret_ciphertext'),
  secretNonce: text('secret_nonce'),
  secretTag: text('secret_tag'),
  keyFingerprint: text('key_fingerprint'),
  lastSuccessfulSyncAt: timestamp('last_successful_sync_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A one-time sign-in grant, minted on the Mac mini's own shell and nowhere
 * else. This is the half of local recovery that gets the owner back in right
 * now, on a machine holding no passkey, without changing the password he may
 * still remember. The other half is `scripts/recovery.sh password`, which sets
 * a new one.
 *
 * The row holds the SHA-256 of the token, so the grant cannot be replayed out
 * of a backup. It is single use, it expires, and spending it writes an audit
 * row like every other way in.
 */
export const recoveryGrant = pgTable('recovery_grant', {
  id: text('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});
