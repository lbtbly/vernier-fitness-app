import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
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
 *
 * `reported_from` is the address the launch report arrived from, or null when
 * it did not come through the Tailscale proxy, which on this install means
 * something on the Mac mini itself. It is here because the row was anonymous
 * and a verifier could not tell the owner's phone from a headless browser: on
 * 2026-08-22 both signals went true from an automated run and read exactly like
 * a real Home Screen launch. The same class of fact `request_origin` already
 * holds, evidence of origin and never a credential, and nothing reads it to
 * decide anything.
 */
export const deviceObservation = pgTable('device_observation', {
  signal: text('signal').primaryKey(),
  observed: boolean('observed').notNull(),
  firstObservedAt: timestamp('first_observed_at', { withTimezone: true }),
  lastReportedAt: timestamp('last_reported_at', { withTimezone: true }).notNull().defaultNow(),
  reportedFrom: text('reported_from'),
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
 *
 * `seed` is the demonstration marker and it is a column because it has to be
 * one. A source record written by the seed carries the shape it stands in for,
 * so its `source` really does read `withings` and its kind really does read
 * `sync_batch`, and F22's six destinations stay walkable. That leaves nothing
 * in the row itself to tell it from a real Withings batch, and an id prefix is
 * a naming convention rather than a constraint. This column is the fact, the
 * unique below is what lets `measurement` point at it, and the two together
 * make `where seed` the whole answer on both tables.
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
    /** True on every row the demonstration seed wrote, and on no other row. */
    seed: boolean('seed').notNull().default(false),
  },
  (table) => [
    index('source_record_occurred_at').on(table.occurredAt),
    unique('source_record_id_seed').on(table.id, table.seed),
  ],
);

/**
 * One stored measurement, and every one of them carries its origin forever.
 *
 * The nine columns F19 names are all NOT NULL and the source is one of six
 * values enforced by the database, not by a handler: `withings`,
 * `apple_health_shortcut`, `manual`, `lab_pdf`, `derived`, `demo`. A demo row
 * is therefore distinguishable from a real one by reading the table, which is
 * the only place that distinction can be trusted, and `seed` below carries the
 * same fact in one column on both tables the seed writes to.
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
    /**
     * The reference interval the laboratory printed beside this result, and the
     * text it printed it as.
     *
     * F57 names the interval as one of the five things a stored analyte carries.
     * The two numbers are what a screen reads and what a later slice could sort
     * on; the text is what the owner checks against his own paper, because
     * "< 5" and "0 to 5" are not the same claim and a parse that flattened them
     * would be inventing a lower bound the sheet never printed.
     *
     * Null everywhere else. A waist measurement has no reference interval and
     * storing a zero for one is exactly the smoothing this product refuses.
     */
    referenceLow: doublePrecision('reference_low'),
    referenceHigh: doublePrecision('reference_high'),
    referenceText: text('reference_text'),
    /**
     * The demonstration marker, and no writer gets a say in it. The database
     * computes it from the source, so a seeded row cannot be written without
     * it and a real row cannot claim it. `where seed` reads the same here as
     * it does on `source_record`, which is the whole point of having it twice.
     */
    seed: boolean('seed')
      .notNull()
      .generatedAlwaysAs(sql`"source" = 'demo'`),
  },
  (table) => [
    index('measurement_metric_measured_at').on(table.metric, table.measuredAt),
    index('measurement_root').on(table.rootId, table.correctionIndex),
    index('measurement_source').on(table.source),
    /*
     * The linkage, enforced by Postgres rather than by a handler. A seeded
     * measurement can only point at a seeded source record and a real one can
     * only point at a real one, so the seed cannot leave a row behind that
     * reads as a real Withings batch and nothing later can attach a real
     * reading to a demonstration record.
     */
    foreignKey({
      name: 'measurement_seed_matches_source_record',
      columns: [table.sourceRecordId, table.seed],
      foreignColumns: [sourceRecord.id, sourceRecord.seed],
    }),
  ],
);

/**
 * The weight goal: two points and a straight line between them.
 *
 * One row, forever, the same way the owner is one row, and the database is what
 * enforces it. A goal is a plan and not a prediction: the chart draws the line
 * from where the owner started to where he says he wants to be, and nothing in
 * this product ever extrapolates a curve from his readings and calls it a
 * forecast.
 *
 * This table does take an UPDATE, and that is not a contradiction of the
 * append-only rule next door. `measurement` refuses UPDATE because a stored
 * reading is a fact about a moment and rewriting it destroys the history the
 * whole product is built on. A goal is an intention, it has exactly one current
 * value, and the row carries when it last changed so a trajectory that moved
 * can be seen to have moved.
 */
export const goal = pgTable(
  'goal',
  {
    id: text('id').primaryKey(),
    singleton: boolean('singleton').notNull().default(true),
    metric: text('metric').notNull(),
    unit: text('unit').notNull(),
    startValue: doublePrecision('start_value').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    targetValue: doublePrecision('target_value').notNull(),
    targetAt: timestamp('target_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** True on the row the demonstration seed wrote, and on no other row. */
    seed: boolean('seed').notNull().default(false),
  },
  (table) => [uniqueIndex('goal_singleton').on(table.singleton)],
);

/**
 * A planned session, which is what adherence counts against.
 *
 * Slice 8 owns training: the catalogue, the proposed week, the player and the
 * progression rules. This is the narrow part slice 4 cannot do without, because
 * adherence is a count over a denominator and the denominator is planned
 * sessions. Three states and no fourth: planned, completed, missed. Nothing
 * here scores the owner and nothing here is coloured, because the panel was
 * plain that two missed sessions because Thursday ran late is Tuesday, not a
 * failure state.
 *
 * `cause` is the reason the session sits where it sits, in the owner's language
 * and not as a label. "Placed at 18:45, your calendar is clear from 18:00" is a
 * reason; "recommended" is a badge. The panel's second finding turns on exactly
 * that difference.
 */
export const plannedSession = pgTable(
  'planned_session',
  {
    id: text('id').primaryKey(),
    plannedFor: timestamp('planned_for', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    title: text('title').notNull(),
    place: text('place').notNull(),
    cause: text('cause').notNull(),
    state: text('state').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** True on every row the demonstration seed wrote, and on no other row. */
    seed: boolean('seed').notNull().default(false),
  },
  (table) => [index('planned_session_planned_for').on(table.plannedFor)],
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

/**
 * ---------------------------------------------------------------------------
 * Apple Health ingest. Slice 6.
 *
 * The iPhone pushes and this machine never pulls, so everything below describes
 * one direction: a batch arrives, it is authenticated, its rows are made unique
 * by a key the server synthesises, and what a whole day of them adds up to
 * becomes a measurement through the same door every other value goes through.
 * ---------------------------------------------------------------------------
 */

/**
 * ---------------------------------------------------------------------------
 * The laboratory panel. Slice 7.
 *
 * Two tables and one rule between them: NOTHING IN `measurement` UNTIL A ROW IS
 * EXPLICITLY ACCEPTED. `lab_document` holds the review, which is a holding and
 * says so on the screen; `measurement` holds what the owner accepted, which is
 * the only thing this product treats as true.
 * ---------------------------------------------------------------------------
 */

/**
 * The credential the iPhone shortcut presents, and it is deliberately two
 * halves stored two different ways.
 *
 * `tokenHash` is the SHA-256 of the bearer token and there is no other copy of
 * it anywhere. The token is shown once, at creation, and the database cannot
 * give it back: a stolen backup is not a working ingest credential.
 *
 * The other half is the signing secret, and it is NOT here. It is sealed with
 * the master key in `integration_credential` under the provider `apple_health`,
 * beside every other third-party secret, because the server has to recompute
 * the two-pass digest from it on every request and F54 has to print the digest
 * it computes for a fixed canonical string. A value the server must reproduce
 * cannot be stored as a hash. Splitting them is what keeps that true without
 * weakening the token: the recoverable half opens nothing on its own, since
 * every request needs the bearer token as well.
 *
 * `keyId` is the `k1` the canonical string names, so a rotation can mint `k2`
 * and keep the shape.
 *
 * Revocation sets `revokedAt` rather than deleting the row. The row is the
 * record that this key existed and when it stopped; a partial unique index in
 * drizzle/pending/06-apple-health.sql keeps exactly one un-revoked row.
 */
export const ingestCredential = pgTable('ingest_credential', {
  keyId: text('key_id').primaryKey(),
  tokenHash: text('token_hash').notNull(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  /**
   * Whether this key is still live, computed by the database from the column
   * beside it so no writer gets a say, exactly as `measurement.seed` is. The
   * partial unique index in drizzle/pending/06-apple-health.sql sits on this
   * column and is what makes "one live credential" a constraint rather than a
   * rule somebody remembers.
   */
  live: boolean('live')
    .notNull()
    .generatedAlwaysAs(sql`"revoked_at" is null`),
});

/**
 * A nonce this endpoint has already seen, kept for 24 hours.
 *
 * The nonce is not a secret and does not need to be unpredictable. Shortcuts
 * has no UUID action and `Random Number` is not documented as a CSPRNG, so the
 * nonce is a timestamp and two random runs, and its only job is uniqueness.
 * Uniqueness is enforced here, by an index, and never by entropy: an attacker
 * who guesses the next nonce gains nothing, because he still needs the token
 * and a matching digest, and a nonce already in this table is refused.
 *
 * The unique index is named and separate from the primary key so a verifier can
 * read it back out of `pg_indexes` as a unique index rather than infer one.
 */
export const ingestNonce = pgTable(
  'ingest_nonce',
  {
    id: text('id').primaryKey(),
    nonce: text('nonce').notNull(),
    seenAt: timestamp('seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('ingest_nonce_value').on(table.nonce),
    index('ingest_nonce_expires_at').on(table.expiresAt),
  ],
);

/**
 * One arrival of a batch, whatever became of it.
 *
 * Every outcome appends a row, refusals included, so the diagnostics screen can
 * show that the phone is reaching this machine and being turned away rather
 * than not reaching it at all. Those are different failures with different
 * fixes, and from the phone they look identical: silence.
 *
 * `outcome` is a token and never a sentence: `accepted`, `bad_digest`,
 * `forbidden_type` and the rest. The words for it live in the catalogue.
 *
 * There is no sync cursor on this table and there is not going to be one. A
 * failed run on a locked phone that advanced a checkpoint is a documented way
 * to lose a day permanently; every run re-reads a fixed 48-hour window and the
 * dedup key makes the overlap free.
 */
export const ingestBatch = pgTable(
  'ingest_batch',
  {
    id: text('id').primaryKey(),
    keyId: text('key_id').notNull(),
    device: text('device').notNull(),
    nonce: text('nonce').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }),
    windowEnd: timestamp('window_end', { withTimezone: true }),
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    outcome: text('outcome').notNull(),
    seriesCount: integer('series_count').notNull().default(0),
    rowsReceived: integer('rows_received').notNull().default(0),
    rowsAccepted: integer('rows_accepted').notNull().default(0),
    rowsDuplicate: integer('rows_duplicate').notNull().default(0),
    readingsStored: integer('readings_stored').notNull().default(0),
  },
  (table) => [index('ingest_batch_received_at').on(table.receivedAt)],
);

/**
 * One health sample, exactly as the phone reported it.
 *
 * Append only, and the trigger in drizzle/pending/06-apple-health.sql is what
 * makes that true rather than a convention: this is raw evidence, and a
 * rewritten sample is a lie about what a device said.
 *
 * `dedupKey` is the sample identifier Shortcuts does not expose, synthesised
 * from the seven fields it does. The unique index on it is the whole of the
 * idempotency at row level: an overlapping 48-hour window costs nothing and a
 * nervous owner can run the shortcut ten times.
 *
 * `value` is null for a category sample such as a sleep stage, whose value is a
 * word. `valueRaw` always holds what arrived, and `unit` holds the unit the
 * phone displayed it in, because `Value` comes back in the action's displayed
 * Health unit and never in the HealthKit SDK unit.
 */
export const healthSample = pgTable(
  'health_sample',
  {
    id: text('id').primaryKey(),
    batchId: text('batch_id')
      .notNull()
      .references(() => ingestBatch.id),
    origin: text('origin').notNull(),
    metric: text('metric').notNull(),
    grouping: text('grouping').notNull(),
    /** The Find Health Samples picker label as it arrived, for provenance. */
    type: text('type').notNull(),
    valueRaw: text('value_raw').notNull(),
    value: doublePrecision('value'),
    unit: text('unit').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    /** Minutes east of UTC the sample declared. Paris in August is 120. */
    offsetMinutes: integer('offset_minutes').notNull(),
    /** What HealthKit named as the sample's source: iPhone, Apple Watch, or nothing. */
    sampleSource: text('sample_source').notNull(),
    dedupKey: text('dedup_key').notNull(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('health_sample_dedup_key').on(table.dedupKey),
    index('health_sample_metric_start_at').on(table.metric, table.startAt),
    index('health_sample_batch').on(table.batchId),
  ],
);

/**
 * The analyte catalogue, and it is a TABLE rather than a constant on purpose.
 *
 * F64 asks for a fourteenth analyte added through the interface with no source
 * file modified and `git status` clean, and a catalogue compiled into the image
 * cannot do that. The thirteen are seeded by drizzle/pending/07-blood.sql from
 * the rules in `src/lib/labs.ts`, and anything the owner adds while reviewing a
 * panel lands here beside them with `built_in` false.
 *
 * `built_in` is not decoration. The label of a seeded analyte is copy this
 * repository wrote and has a key in `strings.metrics`; the label of an added one
 * is a word the owner typed, and the closed-world string check on main reads it
 * out of this column as data exactly the way it reads a correction reason. One
 * boolean is what tells those two apart, the same way `seed` does on
 * `measurement`.
 *
 * `printed` holds the accepted printed units and their factors as ordered rows
 * of `{ unit, factor }`. `reference_low` and `reference_high` are the general
 * adult range the explanation quotes, and `source_url` is the public page it
 * cites. Every one of the three is data because R2 requires the explanation to
 * carry them and a fourteenth analyte has to be able to carry its own.
 */
export const labAnalyte = pgTable(
  'lab_analyte',
  {
    key: text('key').primaryKey(),
    label: text('label').notNull(),
    unit: text('unit').notNull(),
    printed: jsonb('printed').notNull(),
    low: doublePrecision('low').notNull(),
    high: doublePrecision('high').notNull(),
    referenceLow: doublePrecision('reference_low'),
    referenceHigh: doublePrecision('reference_high'),
    sourceUrl: text('source_url').notNull(),
    /** Normalised name fragments a sheet may print. Matched longest first. */
    aliases: text('aliases').array().notNull().default([]),
    /** Where it sits in the catalogue, on the review screen and in the trend list. */
    position: integer('position').notNull(),
    builtIn: boolean('built_in').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('lab_analyte_position').on(table.position)],
);

/**
 * One imported document and the review it is holding.
 *
 * `extraction` is the candidate rows: what the parser read, what the owner has
 * decided about each one, and which measurement each accepted row became. It is
 * a HOLDING and the screen says so in those words. It is not the store: a row in
 * here has no value in `measurement`, appears in no trend, is counted by no
 * chart and is deleted whole when the review is abandoned, which is what makes
 * F58's "abandoning the review leaves zero rows" true of this table as well as
 * of the one that matters.
 *
 * `stored_path` is the file on the volume, relative to the storage root, and it
 * goes null the moment the owner chooses to delete. `file_removed` is the
 * separate fact that the bytes are gone: a document typed in by hand never had a
 * file, and a document whose file was deleted did, so one nullable path cannot
 * carry both answers. F63 reads the directory before and after, and this row is
 * what the screen reads.
 *
 * NO BLOOD PRESSURE REACHES THIS TABLE. `refusals` is a count and a page number
 * and nothing else: the parser drops a blood-pressure line before any row is
 * built, so there is no field here for the value and no field for the label
 * either. F60 asks for a query across every table and this is the table it would
 * have been in.
 */
export const labDocument = pgTable(
  'lab_document',
  {
    id: text('id').primaryKey(),
    /** The name the owner's own file carried, or the empty string for a typed panel. */
    fileName: text('file_name').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    pageCount: integer('page_count').notNull(),
    /** `text`, `ocr` or `manual`. How the rows in this review were produced. */
    mode: text('mode').notNull(),
    /** `review`, `validated` or `abandoned`. */
    state: text('state').notNull().default('review'),
    /** As the header printed it, or null. Every row inherits it unless edited. */
    panelDate: timestamp('panel_date', { withTimezone: true }),
    /** As the sheet names itself. The owner's document, not this product's words. */
    laboratory: text('laboratory').notNull().default(''),
    storedPath: text('stored_path'),
    checksum: text('checksum'),
    fileRemoved: boolean('file_removed').notNull().default(false),
    /** `kept`, `deleted`, or null while the question has not been asked yet. */
    retention: text('retention'),
    retentionAt: timestamp('retention_at', { withTimezone: true }),
    /** How many lines were refused at extraction. A count, never a value. */
    refusals: integer('refusals').notNull().default(0),
    /** Non-whitespace characters per page, and whether each page was image only. */
    census: jsonb('census').notNull(),
    /** The candidate rows and their decisions. A holding, never a store. */
    extraction: jsonb('extraction').notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    validatedAt: timestamp('validated_at', { withTimezone: true }),
  },
  (table) => [index('lab_document_state').on(table.state, table.uploadedAt)],
);
