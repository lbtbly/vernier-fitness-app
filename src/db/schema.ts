import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
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

/**
 * ---------------------------------------------------------------------------
 * The provenance spine. Slice 3.
 *
 * Eleven slices write through these tables, so the shape is settled here once.
 * Withings, the iPhone shortcut, a typed number, a laboratory PDF, a derivation
 * and the demonstration seed all land in the same row shape, and none of them
 * gets to invent its own.
 * ---------------------------------------------------------------------------
 */

/**
 * Where a value came from, told in full, once, so tap 2 has a destination.
 *
 * One record per real event: a Withings sync batch, one shortcut payload, one
 * page of a laboratory PDF, one model reply, one derivation, one manual entry,
 * one demonstration record. `detail` holds ordered rows of `{ key, value }`
 * where the key names a line in the string catalogue and the value is data.
 * No user-facing sentence is stored here, which is what keeps C6's inventory
 * complete and what lets a second language reach the source screen too.
 */
export const sourceRecord = pgTable(
  'source_record',
  {
    id: text('id').primaryKey(),
    source: text('source').notNull(),
    kind: text('kind').notNull(),
    /** A short identifier of the event itself: 'Sync batch 1184', 'Panel 12 Aug, page 2'. */
    reference: text('reference').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    importVersion: text('import_version').notNull(),
    detail: jsonb('detail').notNull(),
  },
  (table) => [index('source_record_occurred_at').on(table.occurredAt)],
);

/**
 * One stored measurement, and every one of them carries its origin forever.
 *
 * The nine columns F19 names are all NOT NULL and the source is one of six
 * values enforced by the database, not by a handler: `withings`,
 * `apple_health_shortcut`, `manual`, `lab_pdf`, `derived`, `demo`. A demo row
 * is therefore distinguishable from a real one by reading the table, which is
 * the only place that distinction can be trusted.
 *
 * `rawValue` is text and holds what actually arrived: "98.0", "4", the typed
 * note, or the laboratory's printed "1.44". `value` is the canonical number in
 * `unit` and is null for a free note, because a note has no number and storing
 * a zero for one is exactly the smoothing this product refuses. A converted
 * laboratory value keeps `rawUnit` and `conversionFactor` beside it so the
 * printed original, the factor and the stored value can sit on one line.
 *
 * Corrections append. `rootId` is the original's id and equals `id` on an
 * original; `correctsId` names the row this one corrects. Four rows, one chain,
 * and the original is still readable after three edits. A trigger in
 * 0003_provenance.sql refuses UPDATE and DELETE on this table outright, so an
 * overwrite is impossible from any code path, present or future. A later slice
 * that re-imports the same reading does not update: it decides a dedup
 * outcome, or it raises a question.
 */
export const measurement = pgTable(
  'measurement',
  {
    /** The client UUID that carried the write, which is also its Idempotency-Key. */
    id: text('id').primaryKey(),
    metric: text('metric').notNull(),
    rawValue: text('raw_value').notNull(),
    rawUnit: text('raw_unit').notNull(),
    value: doublePrecision('value'),
    unit: text('unit').notNull(),
    conversionFactor: doublePrecision('conversion_factor'),
    timeZone: text('time_zone').notNull(),
    source: text('source').notNull(),
    measuredAt: timestamp('measured_at', { withTimezone: true }).notNull(),
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
    confidence: text('confidence').notNull(),
    importVersion: text('import_version').notNull(),
    dedupDecision: text('dedup_decision').notNull(),
    dedupReason: text('dedup_reason').notNull(),
    sourceRecordId: text('source_record_id')
      .notNull()
      .references(() => sourceRecord.id),
    rootId: text('root_id').notNull(),
    correctsId: text('corrects_id'),
    correctionIndex: integer('correction_index').notNull().default(0),
    /** Null on an original. A correction says why in the owner's own words. */
    correctionReason: text('correction_reason'),
  },
  (table) => [
    index('measurement_metric_measured_at').on(table.metric, table.measuredAt),
    index('measurement_root').on(table.rootId, table.correctionIndex),
    index('measurement_source').on(table.source),
  ],
);

/**
 * A re-import that disagrees with a stored correction. It holds both values and
 * it writes nothing to `measurement` until the owner answers.
 *
 * This is the quiet half of the panel's unapproved-write risk. The loud half is
 * an event appearing in a calendar nobody approved; this one has a longer fuse,
 * because a silently overwritten correction is a wrong number nobody knows to
 * look for. The owner's words: "that's worse than not importing at all, because
 * I won't know to check."
 */
export const importQuestion = pgTable(
  'import_question',
  {
    id: text('id').primaryKey(),
    metric: text('metric').notNull(),
    measurementId: text('measurement_id')
      .notNull()
      .references(() => measurement.id),
    storedRawValue: text('stored_raw_value').notNull(),
    storedUnit: text('stored_unit').notNull(),
    storedSource: text('stored_source').notNull(),
    storedMeasuredAt: timestamp('stored_measured_at', { withTimezone: true }).notNull(),
    incomingRawValue: text('incoming_raw_value').notNull(),
    incomingUnit: text('incoming_unit').notNull(),
    incomingSource: text('incoming_source').notNull(),
    incomingMeasuredAt: timestamp('incoming_measured_at', { withTimezone: true }).notNull(),
    incomingImportVersion: text('incoming_import_version').notNull(),
    raisedAt: timestamp('raised_at', { withTimezone: true }).notNull().defaultNow(),
    state: text('state').notNull().default('open'),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    answer: text('answer'),
  },
  (table) => [index('import_question_state').on(table.state, table.raisedAt)],
);

/**
 * A seen idempotency key and the answer it got the first time.
 *
 * The outbox retries. A request that succeeded but whose response was lost on
 * the way home comes back, and without this it would log the same waist reading
 * twice. The stored response is returned verbatim on a repeat, so a replay is
 * indistinguishable from the original as far as the phone is concerned, and the
 * table holds exactly one row per key however many times it arrives.
 */
export const idempotencyKey = pgTable('idempotency_key', {
  key: text('key').primaryKey(),
  route: text('route').notNull(),
  status: integer('status').notNull(),
  body: text('body').notNull(),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  replays: integer('replays').notNull().default(0),
});

/**
 * The request log: one appended row per arrival of a mutating write, whatever
 * the outcome. F24 counts rows in `measurement` and keys in here, and the pair
 * is what proves a replay applied once and no more.
 */
export const writeRequest = pgTable(
  'write_request',
  {
    id: text('id').primaryKey(),
    key: text('key').notNull(),
    route: text('route').notNull(),
    outcome: text('outcome').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('write_request_key').on(table.key)],
);
