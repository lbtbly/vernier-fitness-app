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
    /**
     * The identifier the origin gave this measure, when it gave one. Null on
     * everything the owner typed, because a tape measure has no identifier.
     *
     * Withings writes `grpid:type` here, and the unique index below is what
     * makes the same measure arriving a second time an insert that does
     * nothing rather than a second row. It CANNOT be an upsert: the trigger
     * above refuses UPDATE, and `INSERT ... ON CONFLICT DO UPDATE` fires the
     * same trigger. `.forge/AMENDMENTS.md` A1 records the ruling. A re-import
     * that disagrees appends a correction or raises a question, and both carry
     * their own key qualified by the modification instant that produced them,
     * so running the same import twice is a no-op at both levels.
     */
    externalKey: text('external_key'),
    /**
     * The `modified` this row was written from, in unix seconds. It is what
     * "arriving with a newer modification time" is read against, and a column
     * beats parsing it back out of a key.
     */
    externalModified: bigint('external_modified', { mode: 'number' }),
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
     * The importer's whole idempotency, in one index.
     *
     * `(source, external_key)`, exactly as A1 names it. Postgres treats NULLs
     * as distinct in a unique index, so every hand-typed row keeps a null key
     * and none of them collides with any other; a Withings row carries
     * `grpid:type` and the second arrival of that measure is an INSERT that
     * conflicts and does nothing. It cannot be an upsert, because the
     * append-only trigger fires on `ON CONFLICT DO UPDATE` exactly as it fires
     * on a bare UPDATE.
     *
     * The source is in the key on purpose. A demonstration import writes
     * `source = 'demo'` and a real one writes `source = 'withings'`, so
     * connecting the real scale later cannot collide with the demonstration
     * history: they are different facts and they are allowed to coexist.
     */
    uniqueIndex('measurement_source_external_key').on(table.source, table.externalKey),
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
 * Withings. Slice 5.
 * Apple Health ingest. Slice 6.
 *
 * The iPhone pushes and this machine never pulls, so everything below describes
 * one direction: a batch arrives, it is authenticated, its rows are made unique
 * by a key the server synthesises, and what a whole day of them adds up to
 * becomes a measurement through the same door every other value goes through.
 * Nutrition. Slice 9.
 *
 * The food table, the recipe catalogue with its versioned per-serving
 * snapshots, the four dietary rules, the daily targets, the generated week and
 * the shopping list it builds.
 *
 * ONE COLUMN CONVENTION RUNS THROUGH ALL OF IT AND IT IS THE POINT: EVERY
 * NUTRIENT IS NULLABLE. A missing nutrient is stored null and rendered
 * "unknown", never 0. Anses leaves fibre out on seventy of its three and a half
 * thousand rows and leaves energy out on eighty-one, and a schema that made
 * those columns NOT NULL DEFAULT 0 would turn "we do not know" into "there is
 * none of it" at the moment of the insert, where no screen could ever get it
 * back.
 * Training. Slice 8.
 *
 * The catalogue, the media that demonstrates it, the proposed week, the runs of
 * the player and what the owner reported afterwards. Ten tables, and the rules
 * that matter are in the columns rather than in a handler: a media row with no
 * author cannot be written, a proposal is a row with a state and never an
 * applied change, and nothing anywhere stores a workload ratio, a readiness
 * score or a number about injury risk.
 * ---------------------------------------------------------------------------
 */

/**
 * One row, forever, holding everything about the Withings connection that is
 * not a credential.
 *
 * THE CREDENTIAL IS NOT HERE. The token bundle lives sealed in
 * `integration_credential`, encrypted with the master key, and the two rows are
 * written inside one transaction so a rotated refresh token can never be
 * stranded from the access token it arrived with. That split is what makes the
 * transaction real: a single-row write is atomic whether or not anybody meant
 * it to be, and F37 asks for a guarantee rather than an accident.
 *
 * Everything on this row is safe on a screen: no token, no client secret, no
 * account identifier. The Withings user id stays inside the sealed bundle,
 * because F42 forbids it on the status screen and the surest way to keep it off
 * a screen is to keep it out of every column a screen can read.
 *
 * `cursor` is max(modified) over what has been COMMITTED, in unix seconds, and
 * it is the last thing an import writes. The whole reason it is a stored fact
 * rather than the `updatetime` a response reported is that a crash between
 * fetch and commit must not be able to skip a row: a cursor derived from data
 * already in this database cannot name a measure this database does not hold.
 */
export const withingsConnection = pgTable('withings_connection', {
  /** Always 'withings'. One row, the same way the owner is one row. */
  id: text('id').primaryKey(),
  /** 'demo' or 'live'. Read off the environment on every connect, stored so a screen can say it. */
  mode: text('mode').notNull(),
  /** 'disconnected', 'connecting', 'connected', 'expiring', 'revoked' or 'demo'. */
  state: text('state').notNull(),
  cursor: bigint('cursor', { mode: 'number' }),
  accessExpiresAt: timestamp('access_expires_at', { withTimezone: true }),
  refreshRotatedAt: timestamp('refresh_rotated_at', { withTimezone: true }),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  lastSyncStartedAt: timestamp('last_sync_started_at', { withTimezone: true }),
  lastSuccessfulSyncAt: timestamp('last_successful_sync_at', { withTimezone: true }),
  /** The source record the last batch wrote, so the status card can link to it. */
  lastBatchId: text('last_batch_id'),
  /** Counters the status screen prints. Cumulative, never reset by a failure. */
  rowsStored: integer('rows_stored').notNull().default(0),
  rowsSeen: integer('rows_seen').notNull().default(0),
  groupsDropped: integer('groups_dropped').notNull().default(0),
  questionsRaised: integer('questions_raised').notNull().default(0),
  /**
   * Why the last attempt did not work, as a TOKEN and never as a sentence. A
   * cause the owner reads is chosen in `src/lib/display.ts` from the string
   * catalogue, because a database value painted onto a chip is the defect C6
   * was rewritten over.
   */
  lastFailureKind: text('last_failure_kind'),
  /** The envelope status that came with it, for the operator and never for a screen. */
  lastFailureStatus: integer('last_failure_status'),
  /**
   * The SHA-256 of the `state` this app put on the authorize URL, never the
   * value. A callback whose state does not hash to this is refused, and a
   * backup of this table therefore carries nothing replayable.
   */
  authStateHash: text('auth_state_hash'),
  authStateIssuedAt: timestamp('auth_state_issued_at', { withTimezone: true }),
  /**
   * The day the demonstration account's history is generated back from, and the
   * stage it is in. Both are stored so the dataset is a pure function of this
   * row: the same anchor gives the same dates on the next boot and on the boot
   * after a fortnight away, exactly as the demonstration seed does.
   */
  demoAnchorDay: text('demo_anchor_day'),
  demoStage: text('demo_stage'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

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
 * One food, as Anses published it.
 *
 * Seeded at boot from drizzle/seed/foods.csv, which scripts/build-food-seed.mjs
 * derives from the Table Ciqual 2025 spreadsheet. Licence Ouverte 2.0 permits
 * the redistribution; `tableVersion` and the publisher are what the licence
 * obliges in return, and the data-sources screen reads both off this table
 * rather than off a constant in a component.
 *
 * `energySource` is F79's marker. Anses publishes an energy value for most rows
 * and not all; the rest are computed here by the EU Regulation 1169/2011 Annex
 * XIV conversion factors, which is the same basis Anses uses for the ones it
 * publishes. The column keeps the two tellable apart for ever, and it is null
 * on a row that has no energy at all, which is a third state and not a zero.
 *
 * `censoredFields` names the fields where Anses printed "traces" or "< 0,5" and
 * this app stored 0. A censored zero is a ceiling somebody measured against,
 * and it is not the same fact as a measured zero.
 */
export const food = pgTable(
  'food',
  {
    /** 'ciqual:26038'. The source and its own reference, never a bare number. */
    id: text('id').primaryKey(),
    source: text('source').notNull(),
    sourceRef: text('source_ref').notNull(),
    nameFr: text('name_fr').notNull(),
    groupCode: text('group_code').notNull(),
    subgroupCode: text('subgroup_code').notNull(),
    kcal100g: doublePrecision('kcal_100g'),
    proteinG: doublePrecision('protein_g'),
    carbG: doublePrecision('carb_g'),
    fatG: doublePrecision('fat_g'),
    fibreG: doublePrecision('fibre_g'),
    energySource: text('energy_source'),
    censoredFields: text('censored_fields').array().notNull().default([]),
    tableVersion: text('table_version').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('food_subgroup').on(table.subgroupCode),
    index('food_energy_source').on(table.energySource),
    unique('food_source_ref').on(table.source, table.sourceRef),
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

/**
 * A recipe. Either one Vernier ships, or one the owner imported.
 *
 * `nameKey` names a line in the string catalogue and `name` holds free text,
 * and exactly one of them is set. A recipe this app authored is copy like every
 * other word it authored, so it takes a key: C6 does not stop caring because a
 * sentence went through a database column on its way to the screen, and slice
 * 3 already paid for that lesson twice. A recipe the owner imports in slice 10
 * carries his own words and takes the free-text column.
 */
export const recipe = pgTable(
  'recipe',
  {
    id: text('id').primaryKey(),
    nameKey: text('name_key'),
    name: text('name'),
    servings: integer('servings').notNull(),
    cookMinutes: integer('cook_minutes').notNull(),
    /** breakfast, lunch, dinner or snack. What the generator will place it as. */
    slot: text('slot').notNull(),
    /** 'vernier' for the shipped catalogue, 'recipe_box' or 'import' later. */
    origin: text('origin').notNull(),
    originRef: text('origin_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('recipe_slot').on(table.slot, table.cookMinutes)],
);

/**
 * One ingredient line of one recipe, in grams.
 *
 * `aliasId` is the everyday name, which lives in src/lib/food-aliases.ts with
 * its aisle, its shop unit and its free-from alternative, because a name a
 * person reads is copy and belongs in the catalogue. `foodId` is the Anses row
 * the nutrition is summed from, and it is nullable on purpose: an ingredient
 * that resolves to nothing is counted as unresolved in the snapshot's coverage
 * rather than quietly dropped, which is the difference between a recipe that
 * says 82 percent and one that says a number it has not earned.
 */
export const recipeIngredient = pgTable(
  'recipe_ingredient',
  {
    id: text('id').primaryKey(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipe.id),
    aliasId: text('alias_id').notNull(),
    foodId: text('food_id').references(() => food.id),
    grams: doublePrecision('grams').notNull(),
    position: integer('position').notNull(),
    /** True when the recipe box supplies it, so the shopping list deducts it. */
    boxSupplied: boolean('box_supplied').notNull().default(false),
  },
  (table) => [index('recipe_ingredient_recipe').on(table.recipeId, table.position)],
);

/**
 * The versioned per-serving snapshot, and it is a snapshot rather than a view
 * for two reasons the research names: the weekly review has to show what the
 * owner ate under the food data as it stood then, and recomputing every recipe
 * on every render is waste.
 *
 * `sourceFoodIdsHash` is what makes the first reason enforceable. It covers
 * every ingredient's food id and its stored nutrients, so a change to any Anses
 * row behind this recipe changes the hash. A changed hash RAISES A QUESTION and
 * never replaces the row: 0009's trigger refuses UPDATE on the figures outright,
 * so the quiet unapproved write the panel named cannot happen from any code
 * path, present or future. A recompute writes a new version and supersedes this
 * one; the old one stays readable.
 *
 * `coveragePct` is the share of recipe mass that resolved to a food row.
 * `fibreCoveragePct` is the same share counted only where fibre was not null,
 * and it is a separate number because fibre is the field most likely to be
 * missing and a single coverage figure would hide exactly that.
 */
export const recipeNutrition = pgTable(
  'recipe_nutrition',
  {
    id: text('id').primaryKey(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipe.id),
    /**
     * 'base', or 'lactose_free' when this snapshot was computed from the
     * free-from alternatives instead of the dairy items.
     *
     * F85 says choosing the alternative recomputes the meal's macronutrients,
     * and this is where the recomputed set lives. It is a stored snapshot like
     * any other, with its own coverage and its own hash, rather than a number
     * derived at render: the plant dessert that replaces fromage blanc carries
     * no published fibre, so the swap moves the fibre coverage as well as the
     * figures, and that has to be a fact on a row rather than an arithmetic
     * accident in a component.
     */
    variant: text('variant').notNull().default('base'),
    version: integer('version').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
    perServingKcal: doublePrecision('per_serving_kcal'),
    perServingProteinG: doublePrecision('per_serving_protein_g'),
    perServingCarbG: doublePrecision('per_serving_carb_g'),
    perServingFatG: doublePrecision('per_serving_fat_g'),
    perServingFibreG: doublePrecision('per_serving_fibre_g'),
    provenance: text('provenance').notNull(),
    coveragePct: doublePrecision('coverage_pct').notNull(),
    fibreCoveragePct: doublePrecision('fibre_coverage_pct').notNull(),
    sourceFoodIdsHash: text('source_food_ids_hash').notNull(),
    /** How many ingredients carry an energy Vernier computed rather than Anses. */
    computedEnergyCount: integer('computed_energy_count').notNull().default(0),
    ingredientCount: integer('ingredient_count').notNull(),
    unresolvedCount: integer('unresolved_count').notNull().default(0),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
  },
  (table) => [
    unique('recipe_nutrition_version').on(table.recipeId, table.variant, table.version),
    index('recipe_nutrition_current').on(table.recipeId, table.variant, table.supersededAt),
  ],
);

/**
 * A recipe whose ingredient rows no longer hash to what its stored snapshot was
 * computed from.
 *
 * The same shape as `import_question` next door and for the same reason: a
 * silently replaced number is a wrong number nobody knows to look for. Both
 * figures are held, the stored snapshot has not moved, and the owner answers.
 */
export const recipeQuestion = pgTable(
  'recipe_question',
  {
    id: text('id').primaryKey(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipe.id),
    snapshotId: text('snapshot_id')
      .notNull()
      .references(() => recipeNutrition.id),
    storedHash: text('stored_hash').notNull(),
    incomingHash: text('incoming_hash').notNull(),
    raisedAt: timestamp('raised_at', { withTimezone: true }).notNull().defaultNow(),
    state: text('state').notNull().default('open'),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    answer: text('answer'),
  },
  (table) => [index('recipe_question_state').on(table.state, table.raisedAt)],
);

/**
 * A dietary rule, and the kind is the whole of it.
 *
 * FOUR KINDS, FOUR BEHAVIOURS, AND NOTHING RESOLVES ONE AS ANOTHER. An allergy
 * is refused, an intolerance is substituted, an exclusion is omitted and a
 * preference is ranked. They are four different verbs, so nuts as a preference
 * and shellfish as an exclusion cannot collapse into each other however the
 * generator is later rewritten: `src/lib/dietary-rules.ts` dispatches on the
 * kind to four separate functions and there is no shared matcher underneath
 * them, and `tests/unit/dietary-rules.test.ts` asserts exactly that.
 *
 * The check constraint on `kind` lives in the database, in 0009, so a fifth
 * kind cannot be written by any handler that forgets.
 */
export const dietaryRule = pgTable(
  'dietary_rule',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    /** A token: 'shellfish', 'lactose', 'nuts'. The words for it are copy. */
    subject: text('subject').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('dietary_rule_kind_subject').on(table.kind, table.subject)],
);

/**
 * The daily target, and every number that produced it.
 *
 * One row, forever, the way the owner is one row. The equation, the activity
 * level and the planned rate are stored beside the answer, so a target can be
 * read back and re-derived rather than taken on trust, and so F80's two figures
 * are checkable against the row that produced them.
 *
 * `hardFloorConfirmedAt` is the only way a target under 1500 kcal exists at all.
 * The route refuses to write one without it and the screen that sets it names a
 * professional, which is F81's middle tier implemented rather than promised.
 */
export const nutritionTarget = pgTable(
  'nutrition_target',
  {
    id: text('id').primaryKey(),
    singleton: boolean('singleton').notNull().default(true),
    sex: text('sex').notNull(),
    ageYears: integer('age_years').notNull(),
    heightCm: doublePrecision('height_cm').notNull(),
    weightKg: doublePrecision('weight_kg').notNull(),
    equation: text('equation').notNull(),
    activityLevel: text('activity_level').notNull(),
    pal: doublePrecision('pal').notNull(),
    rmrKcal: doublePrecision('rmr_kcal').notNull(),
    tdeeKcal: doublePrecision('tdee_kcal').notNull(),
    rateKgPerWeek: doublePrecision('rate_kg_per_week').notNull(),
    kcalTarget: integer('kcal_target').notNull(),
    proteinG: integer('protein_g').notNull(),
    carbG: integer('carb_g').notNull(),
    fatG: integer('fat_g').notNull(),
    fibreG: integer('fibre_g').notNull(),
    belowResting: boolean('below_resting').notNull().default(false),
    hardFloorConfirmedAt: timestamp('hard_floor_confirmed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('nutrition_target_singleton').on(table.singleton)],
);

/** One generated week. `maxCookMinutes` is the limit F86 measures against. */
export const mealPlan = pgTable(
  'meal_plan',
  {
    id: text('id').primaryKey(),
    weekStart: timestamp('week_start', { withTimezone: true }).notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    maxCookMinutes: integer('max_cook_minutes').notNull(),
    kcalTarget: integer('kcal_target').notNull(),
    state: text('state').notNull().default('draft'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    /** The generation this plan is, so two runs at 20 and 60 both keep a row. */
    generation: integer('generation').notNull().default(1),
  },
  (table) => [
    uniqueIndex('meal_plan_week').on(table.weekStart),
    index('meal_plan_generated').on(table.generatedAt),
  ],
);

/**
 * One meal in one week, decided on its own.
 *
 * F86's "one at a time" is the state column and the per-row route behind it.
 * There is no accept-all and there is no autosave: a meal is proposed until the
 * owner says otherwise, and saying otherwise about Tuesday's lunch says nothing
 * about Tuesday's dinner.
 *
 * `snapshotId` names the exact `recipe_nutrition` version the day totals were
 * added from, so a recompute next month does not silently rewrite what last
 * week's plan said it was.
 */
export const plannedMeal = pgTable(
  'planned_meal',
  {
    id: text('id').primaryKey(),
    planId: text('plan_id')
      .notNull()
      .references(() => mealPlan.id),
    /** 0 is the Monday the week starts on. */
    dayIndex: integer('day_index').notNull(),
    slot: text('slot').notNull(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipe.id),
    snapshotId: text('snapshot_id').references(() => recipeNutrition.id),
    state: text('state').notNull().default('proposed'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    /** True once the lactose-free alternative has been chosen for this meal. */
    lactoseFree: boolean('lactose_free').notNull().default(false),
    position: integer('position').notNull(),
  },
  (table) => [
    index('planned_meal_plan').on(table.planId, table.dayIndex, table.position),
    unique('planned_meal_slot').on(table.planId, table.dayIndex, table.slot),
  ],
);

/** The list built from one confirmed week. One list per plan. */
export const shoppingList = pgTable(
  'shopping_list',
  {
    id: text('id').primaryKey(),
    planId: text('plan_id')
      .notNull()
      .references(() => mealPlan.id),
    builtAt: timestamp('built_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('shopping_list_plan').on(table.planId)],
);

/**
 * One line of the shopping list.
 *
 * `deduction` is F89 and it is why the original quantity has its own column. A
 * line the recipe box supplies, or one the owner has marked in stock, STAYS ON
 * THE LIST with its original quantity struck through. It does not disappear.
 * A line that vanishes is a line nobody can check, and the whole value of a
 * deduction is that the owner sees it happen rather than trusts that it did.
 */
export const shoppingItem = pgTable(
  'shopping_item',
  {
    id: text('id').primaryKey(),
    listId: text('list_id')
      .notNull()
      .references(() => shoppingList.id),
    aliasId: text('alias_id').notNull(),
    aisle: text('aisle').notNull(),
    /** 'g', 'kg' or 'count'. Nothing else, and no millilitres anywhere. */
    unit: text('unit').notNull(),
    /** What the recipes actually need, before rounding to a shop unit. */
    neededQuantity: doublePrecision('needed_quantity').notNull(),
    /** What the list first said to buy, kept so a deduction can strike it. */
    originalQuantity: doublePrecision('original_quantity').notNull(),
    /** What it says now, after any edit the owner made this week. */
    quantity: doublePrecision('quantity').notNull(),
    countNoun: text('count_noun'),
    deduction: text('deduction').notNull().default('none'),
    /** The day the box arrives, for a box deduction. Null otherwise. */
    deductionDayIndex: integer('deduction_day_index'),
    checked: boolean('checked').notNull().default(false),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    removed: boolean('removed').notNull().default(false),
    position: integer('position').notNull(),
  },
  (table) => [
    index('shopping_item_list').on(table.listId, table.aisle, table.position),
    /*
     * One line per ingredient PER DEDUCTION, not one line per ingredient.
     *
     * Salmon arrives twice in a real week: three fillets the recipe box brings
     * on Monday and one the owner buys for Friday. Screen 10 draws that as two
     * lines, a bought one and a struck-through one, and it is right to: folding
     * them into a single line would mean either buying four fillets and wasting
     * three, or showing one line whose quantity is a subtraction the owner
     * cannot see. F89 is about seeing the deduction, so the deduction gets its
     * own row.
     */
    unique('shopping_item_alias').on(table.listId, table.aliasId, table.deduction),
  ],
);

/** Which meal wants how much of a line, so "where this comes from" is data. */
export const shoppingItemSource = pgTable(
  'shopping_item_source',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => shoppingItem.id),
    plannedMealId: text('planned_meal_id')
      .notNull()
      .references(() => plannedMeal.id),
    grams: doublePrecision('grams').notNull(),
  },
  (table) => [index('shopping_item_source_item').on(table.itemId)],
);

/**
 * What the owner says is already in the cupboard.
 *
 * Marked by hand and never inferred. The app does not watch a quantity go down
 * and decide it was used up, because it cannot see the cupboard and a guess
 * here shows up as a missing ingredient on a Tuesday night.
 */
export const stockItem = pgTable(
  'stock_item',
  {
    id: text('id').primaryKey(),
    aliasId: text('alias_id').notNull(),
    quantity: doublePrecision('quantity').notNull(),
    unit: text('unit').notNull(),
    markedAt: timestamp('marked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('stock_item_alias').on(table.aliasId)],
);

/**
 * One movement. The catalogue is 44 of them and it is seeded from
 * `src/lib/catalogue.ts` at boot, not by hand, so the rows and the module the
 * proposer reads cannot drift.
 *
 * `nameKey` and `cueKey` are catalogue keys and not words. A cue is copy the
 * product authored, C6 says wherever in the shipped tree it was written, and a
 * database row is in the shipped tree: `src/db/demo.ts` learned that one the
 * expensive way and this table is built on the same rule.
 */
export const movement = pgTable(
  'movement',
  {
    id: text('id').primaryKey(),
    nameKey: text('name_key').notNull(),
    cueKey: text('cue_key').notNull(),
    modality: text('modality').notNull(),
    pattern: text('pattern').notNull(),
    muscles: text('muscles').array().notNull().default([]),
    equipment: text('equipment').array().notNull().default([]),
    /** Where it sits on its pattern's ladder. Lower is easier. */
    step: integer('step').notNull(),
    unit: text('unit').notNull(),
    sets: integer('sets').notNull(),
    low: integer('low').notNull(),
    high: integer('high').notNull(),
    restSeconds: integer('rest_seconds').notNull(),
    effortScale: text('effort_scale').notNull(),
    loadable: boolean('loadable').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('movement_pattern').on(table.pattern, table.step)],
);

/**
 * One piece of media, and every column F67 names is here and NOT NULL.
 *
 * `author` is the one that matters. A CC BY-SA image whose creator is unknown
 * cannot be complied with, and 87 of wger's 365 images are exactly that; a
 * 1,746-image aggregator set is infringing and has no author to record at all.
 * The rule that keeps both out is one word in one column, and it is enforced
 * three times over: the fetch script refuses a source naming no author, this
 * column is NOT NULL, and a check constraint in
 * `drizzle/pending/08-train.sql` refuses a blank one, which is what NOT NULL
 * alone would let through.
 *
 * `embeddingMode` is `bundled` for a file in this repository and
 * `youtube_nocookie` for a video the browser fetches for itself. There is no
 * third mode and there is no local copy of a video: downloading one is
 * forbidden by Developer Policies III.E in the plainest words in the document.
 */
export const movementMedia = pgTable(
  'movement_media',
  {
    id: text('id').primaryKey(),
    movementId: text('movement_id')
      .notNull()
      .references(() => movement.id),
    /** Where it came from: the file page, the raw path, or the watch URL. */
    url: text('url').notNull(),
    /** The author, or the source that stands as one. Never null, never blank. */
    author: text('author').notNull(),
    licence: text('licence').notNull(),
    licenceUrl: text('licence_url').notNull().default(''),
    attributionUrl: text('attribution_url').notNull().default(''),
    embeddingMode: text('embedding_mode').notNull(),
    kind: text('kind').notNull(),
    /** The path this app serves it from, empty for an embed. */
    localPath: text('local_path').notNull().default(''),
    /** The day the source was asked, by a script, not typed by a person. */
    verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull(),
    bytes: integer('bytes').notNull().default(0),
    checksum: text('checksum').notNull().default(''),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('movement_media_movement').on(table.movementId),
    unique('movement_media_url').on(table.movementId, table.url),
  ],
);

/**
 * The embedding allowlist, as data. One row per host the editorial screen will
 * accept a link from, seeded from `src/data/media-allowlist.json`.
 *
 * It is a table and not a constant because F68 asks for an allowlist held as
 * data: a list compiled into a comparison is one the owner cannot inspect,
 * cannot extend and cannot audit, and the refusal it produces cannot name which
 * row it failed.
 */
export const mediaAllowlist = pgTable('media_allowlist', {
  host: text('host').primaryKey(),
  embeddingMode: text('embedding_mode').notNull(),
  /** The catalogue key of the sentence saying why this host is on the list. */
  reasonKey: text('reason_key').notNull(),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One proposed session. A row with a state, never an applied change.
 *
 * Accepting one writes a `planned_session`, which is what Today reads and what
 * adherence counts against. Rejecting one writes `rejected` here and touches
 * nothing else, which is the half of F72 that a single Accept-the-week control
 * would destroy.
 *
 * `cause` is the rendered sentence, frozen at write time the way `dedup_reason`
 * is, and `causeKey` is the key it was rendered from so a later reading knows
 * which rule placed it.
 */
export const sessionProposal = pgTable(
  'session_proposal',
  {
    id: text('id').primaryKey(),
    /** The Monday the week starts on, as a day key: "2026-08-24". */
    weekStart: text('week_start').notNull(),
    position: integer('position').notNull(),
    plannedFor: timestamp('planned_for', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    kind: text('kind').notNull(),
    place: text('place').notNull(),
    cause: text('cause').notNull(),
    causeKey: text('cause_key').notNull(),
    fullBody: boolean('full_body').notNull().default(false),
    /**
     * The plain fact about this session's length: how much longer than the
     * longest in the past 30 days, and what that longest was. A percentage and
     * a number of minutes. There is no risk attached to either and no ratio is
     * stored anywhere in this schema.
     */
    percentLonger: integer('percent_longer'),
    longestMinutes: integer('longest_minutes'),
    state: text('state').notNull().default('proposed'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    plannedSessionId: text('planned_session_id').references(() => plannedSession.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    seed: boolean('seed').notNull().default(false),
  },
  (table) => [
    index('session_proposal_week').on(table.weekStart, table.position),
    unique('session_proposal_slot').on(table.weekStart, table.position),
  ],
);

/** One movement inside a proposed session, in the order the player runs it. */
export const sessionMovement = pgTable(
  'session_movement',
  {
    id: text('id').primaryKey(),
    proposalId: text('proposal_id')
      .notNull()
      .references(() => sessionProposal.id),
    position: integer('position').notNull(),
    movementId: text('movement_id')
      .notNull()
      .references(() => movement.id),
    sets: integer('sets').notNull(),
    /** The rep target, or the hold in seconds, or the minutes of work. */
    target: integer('target').notNull(),
    loadKg: doublePrecision('load_kg'),
    restSeconds: integer('rest_seconds').notNull(),
    /**
     * The movement this one replaced, when the owner swapped mid-session. The
     * original is kept rather than overwritten: a substitution is a fact about
     * the session and the next proposal reads it.
     */
    substitutedFor: text('substituted_for'),
  },
  (table) => [
    index('session_movement_proposal').on(table.proposalId, table.position),
    unique('session_movement_slot').on(table.proposalId, table.position),
  ],
);

/**
 * One run of the player. Started when the owner taps start, finished when he
 * taps finish, and derived from wall-clock instants at both ends so a phone
 * call in the middle costs nothing.
 *
 * `screenAwake` records whether the Wake Lock was actually granted. It is
 * evidence and never a claim: a browser that refuses it makes the player say so
 * in a banner rather than pretend the screen will stay on.
 */
export const sessionRun = pgTable(
  'session_run',
  {
    id: text('id').primaryKey(),
    proposalId: text('proposal_id').references(() => sessionProposal.id),
    plannedSessionId: text('planned_session_id').references(() => plannedSession.id),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    state: text('state').notNull().default('running'),
    screenAwake: boolean('screen_awake').notNull().default(false),
    seed: boolean('seed').notNull().default(false),
  },
  (table) => [index('session_run_started').on(table.startedAt)],
);

/**
 * One set, as it was actually performed. This is the table the 2-for-2 trigger
 * reads and the table "last week" is drawn from, so it holds what was asked for
 * as well as what was done: a set of 12 against a target of 10 is the fact, and
 * 12 alone is half of it.
 */
export const setLog = pgTable(
  'set_log',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => sessionRun.id),
    movementId: text('movement_id')
      .notNull()
      .references(() => movement.id),
    setIndex: integer('set_index').notNull(),
    target: integer('target').notNull(),
    achieved: integer('achieved').notNull(),
    loadKg: doublePrecision('load_kg'),
    /** Reps in reserve, 1 to 10, or null when the question was not asked. */
    rir: integer('rir'),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('set_log_movement').on(table.movementId, table.completedAt),
    unique('set_log_slot').on(table.runId, table.movementId, table.setIndex),
  ],
);

/**
 * What the owner reported after the work, asked once, after the last set.
 *
 * Effort is reps in reserve for resistance and the CDC public-domain 0 to 10
 * relative intensity scale for cardio. Pain is the Silbernagel rule: the score
 * during, whether it had gone by the next morning, and the site, which is a
 * catalogue key rather than free text because the same site twice running is
 * what deloads the movement and two spellings of "knee" would break that.
 */
export const sessionReport = pgTable(
  'session_report',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => sessionRun.id)
      .unique(),
    effortScale: text('effort_scale').notNull(),
    effort: integer('effort'),
    painSite: text('pain_site').notNull().default('none'),
    painScore: integer('pain_score'),
    /** Null until the morning after, when the app asks the one follow-up question. */
    painSubsidedByMorning: boolean('pain_subsided_by_morning'),
    note: text('note').notNull().default(''),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('session_report_pain').on(table.painSite, table.recordedAt)],
);

/**
 * A proposed advancement. Proposed, never applied.
 *
 * The trigger is the 2-for-2 rule and it is defensible; the SIZE of the step is
 * convention, which the screen says in its own words beside the number. The two
 * sessions that fired it are kept in `trigger` so the card can name them, and
 * so a proposal the owner declines can still be read back a month later.
 */
export const progressionProposal = pgTable(
  'progression_proposal',
  {
    id: text('id').primaryKey(),
    movementId: text('movement_id')
      .notNull()
      .references(() => movement.id),
    lever: text('lever').notNull(),
    fromLoadKg: doublePrecision('from_load_kg'),
    toLoadKg: doublePrecision('to_load_kg'),
    fromTarget: integer('from_target').notNull(),
    toTarget: integer('to_target').notNull(),
    toMovementId: text('to_movement_id'),
    state: text('state').notNull().default('proposed'),
    trigger: jsonb('trigger').notNull(),
    proposedAt: timestamp('proposed_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    seed: boolean('seed').notNull().default(false),
  },
  (table) => [index('progression_proposal_state').on(table.state, table.proposedAt)],
);

/**
 * One answer to the screening gate: the three ACSM 2015 inputs, the symptoms
 * that were reported, and the referral decision that follows from them.
 *
 * There is no score in this table. That paper's output is a referral decision
 * and nothing else, and a number derived from it would be this product
 * inventing a measurement it does not have.
 */
export const readinessCheck = pgTable(
  'readiness_check',
  {
    id: text('id').primaryKey(),
    activity: text('activity').notNull(),
    knownDisease: boolean('known_disease').notNull(),
    symptoms: text('symptoms').array().notNull().default([]),
    desiredIntensity: text('desired_intensity').notNull(),
    outcome: text('outcome').notNull(),
    because: text('because').notNull(),
    answeredAt: timestamp('answered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('readiness_check_answered').on(table.answeredAt)],
);

/**
 * ---------------------------------------------------------------------------
 * Google Calendar. Slice 11.
 *
 * Six tables, and the rules that matter are between them rather than inside any
 * one of them:
 *
 * 1. NOTHING IS WRITTEN OUTSIDE A CONFIRMED PLAN. A plan is a row with rows of
 *    its own and a state. Every outbound write names the plan row it came from,
 *    and a plan row that was not ticked is stored `skipped` and never carries a
 *    write identifier.
 * 2. THE WRITE LOG IS PERMANENT AND APPEND ONLY. `calendar_write` refuses UPDATE
 *    and DELETE by trigger, exactly as `measurement` does, so undo is available
 *    on every past write for as long as the database exists. An undo is a new
 *    row naming the one it reverses, never an edit of the row it reverses.
 * 3. AVAILABILITY IS A CACHE AND SAYS SO. `calendar_busy` and
 *    `calendar_read_failure` hold the last successful free-busy read with the
 *    instant it happened, so a week can still be proposed with Google
 *    unreachable and the screen can name the age of what it used.
 * ---------------------------------------------------------------------------
 */

/**
 * One row, forever, holding everything about the Google connection that is not a
 * credential.
 *
 * THE CREDENTIAL IS NOT HERE. The token bundle lives sealed in
 * `integration_credential` under the provider `google_calendar`, encrypted with
 * the master key, the same split slice 5 made for Withings.
 *
 * `appCalendarId` is the ONLY handle to the calendar this app created. There is
 * no lookup path back to it under `calendar.app.created` alone, because
 * `calendarList.list` needs a calendarlist scope and the app-created scope does
 * not carry one. Losing it is unrecoverable, and creating a second calendar in
 * its place would orphan the first with the owner's history in it, so a missing
 * identifier beside a live grant is an ERROR STATE and never a signal to
 * recreate.
 *
 * `lastErrorRaw` is Google's answer, whole. F109 asks for the raw error body,
 * and `invalid_grant` plus "Token has been expired or revoked." are two
 * different facts: the first says what class of failure it is and the second
 * tells the owner what happened to him.
 */
export const googleConnection = pgTable('google_connection', {
  /** Always 'google_calendar'. One row, the way the owner is one row. */
  id: text('id').primaryKey(),
  /** 'demo' or 'live'. Read off the environment on every connect, stored so a screen can say it. */
  mode: text('mode').notNull(),
  /** 'disconnected', 'connecting', 'connected', 'revoked' or 'demo'. */
  state: text('state').notNull(),
  /** The calendar this app made. Unrecoverable if lost, never recreated. */
  appCalendarId: text('app_calendar_id'),
  appCalendarSummary: text('app_calendar_summary'),
  /**
   * When it was created, kept SEPARATELY from the identifier on purpose.
   *
   * The pair is what tells "this connection has never made a calendar" from
   * "this connection made one and the identifier is gone". The first offers to
   * create one. The second is F105's error state, and it must never become a
   * second calendar.
   */
  appCalendarCreatedAt: timestamp('app_calendar_created_at', { withTimezone: true }),
  /** The calendars the owner ticked in the picker, read for availability only. */
  watchedCalendarIds: jsonb('watched_calendar_ids').notNull().default([]),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  /** When Google refused the grant, with the raw body beside it. */
  disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
  lastErrorKind: text('last_error_kind'),
  lastErrorRaw: text('last_error_raw'),
  lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
  /** When availability was last read successfully. The age the stale line prints. */
  lastAvailabilityAt: timestamp('last_availability_at', { withTimezone: true }),
  lastSuccessfulWriteAt: timestamp('last_successful_write_at', { withTimezone: true }),
  /**
   * True the moment a permanent refusal lands, and it stops every scheduled
   * read. F109 asks for background synchronisation to stop rather than to keep
   * failing quietly against a grant that is dead.
   */
  backgroundSyncStopped: boolean('background_sync_stopped').notNull().default(false),
  /**
   * The SHA-256 of the `state` this app put on the authorize URL, never the
   * value, so a backup of this table carries nothing replayable.
   */
  authStateHash: text('auth_state_hash'),
  authStateIssuedAt: timestamp('auth_state_issued_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The last availability that was actually read, one row per busy interval.
 *
 * It is a cache and it is dated, which is the whole point: F111 asks that with
 * the provider unreachable the training week still proposes from the last stored
 * availability AND names the stale calendar by cause. A snapshot with no
 * timestamp could do the first half and not the second.
 */
export const calendarBusy = pgTable(
  'calendar_busy',
  {
    id: text('id').primaryKey(),
    /** Which of the owner's calendars this interval came from. */
    calendarId: text('calendar_id').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('calendar_busy_window').on(table.startAt, table.endAt)],
);

/**
 * A calendar the free-busy query could not answer for.
 *
 * THIS TABLE IS THE DEFECT CLASS, WRITTEN DOWN. A calendar the owner has been
 * unshared from comes back with an `errors` entry and an EMPTY busy list, which
 * is indistinguishable from a free day. Storing the failure is what lets the
 * diff say "this time is not confirmed clear" instead of scheduling a session
 * over a real meeting and reporting the calendar as clear while it does it.
 */
export const calendarReadFailure = pgTable(
  'calendar_read_failure',
  {
    id: text('id').primaryKey(),
    calendarId: text('calendar_id').notNull(),
    /** Google's own reason token, stored as a token. The words are in the catalogue. */
    reason: text('reason').notNull(),
    detail: text('detail').notNull().default(''),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('calendar_read_failure_read').on(table.readAt)],
);

/**
 * One set of changes, worked out and rendered, with nothing written yet.
 *
 * The plan exists as a row BEFORE the confirm screen draws it, so what the owner
 * confirms is a stored set rather than whatever the server recomputes when the
 * button arrives. A recomputed plan is a different plan, and applying it would
 * be writing something he never read.
 */
export const calendarPlan = pgTable(
  'calendar_plan',
  {
    id: text('id').primaryKey(),
    builtAt: timestamp('built_at', { withTimezone: true }).notNull().defaultNow(),
    windowFrom: timestamp('window_from', { withTimezone: true }).notNull(),
    windowTo: timestamp('window_to', { withTimezone: true }).notNull(),
    mode: text('mode').notNull(),
    /** The app calendar this plan targets, frozen at build time. */
    calendarId: text('calendar_id').notNull(),
    /** 'open', 'applied' or 'superseded'. Only an open plan can be confirmed. */
    state: text('state').notNull().default('open'),
    availabilityAt: timestamp('availability_at', { withTimezone: true }),
    /** True when the plan was built on stored availability rather than a fresh read. */
    availabilityStale: boolean('availability_stale').notNull().default(false),
    failures: integer('failures').notNull().default(0),
    /**
     * The app calendar's events at the moment the plan was built, which is the
     * "before" column the owner actually read.
     *
     * Stored rather than recomputed at render time, because a column recomputed
     * later is a different column: it would show what the calendar holds now
     * rather than what it held when the change was worked out, and the two
     * differ exactly when something went wrong.
     */
    beforeEvents: jsonb('before_events').notNull().default([]),
    /**
     * Sessions with nowhere free inside the search window.
     *
     * They are not changes, so they are not rows, and they are stored anyway
     * because the alternative is a session quietly missing from the diff. A
     * plan that drops something without saying so is the failure class this
     * whole slice is built against.
     */
    unplaceable: jsonb('unplaceable').notNull().default([]),
    totalChanges: integer('total_changes').notNull().default(0),
    heldBack: integer('held_back').notNull().default(0),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
  },
  (table) => [index('calendar_plan_built').on(table.builtAt)],
);

/**
 * One row of the diff: a verb, a before, an after and the cause in words.
 *
 * `cause` is the RENDERED sentence, frozen at build time the way `dedup_reason`
 * and the training week's cause are, and `causeKey` is the key it came from so a
 * later reading knows which rule placed it.
 *
 * `defaultSelected` is stored rather than derived, because F107 is a claim about
 * what the screen offered: additions and moves selected, removals unselected. A
 * value in the row can be read back months later; a rule in a component cannot.
 */
export const calendarPlanRow = pgTable(
  'calendar_plan_row',
  {
    id: text('id').primaryKey(),
    planId: text('plan_id')
      .notNull()
      .references(() => calendarPlan.id),
    position: integer('position').notNull(),
    /** 'added', 'moved' or 'removed'. What the row does, for the grouping. */
    verb: text('verb').notNull(),
    /**
     * WHICH ENUMERATED WRITE SITE THIS ROW WILL USE, as data rather than as
     * something the apply handler infers from the shape of the row. F110 asks
     * that every outbound write be one of an enumerated set, and a row that
     * names its site can be read back and checked against the log months later.
     */
    site: text('site').notNull(),
    sessionId: text('session_id'),
    /** The deterministic event identifier this row writes to. */
    eventId: text('event_id').notNull(),
    title: text('title').notNull(),
    beforeStart: timestamp('before_start', { withTimezone: true }),
    beforeEnd: timestamp('before_end', { withTimezone: true }),
    afterStart: timestamp('after_start', { withTimezone: true }),
    afterEnd: timestamp('after_end', { withTimezone: true }),
    cause: text('cause').notNull(),
    causeKey: text('cause_key').notNull(),
    defaultSelected: boolean('default_selected').notNull(),
    /** 'pending', 'applied', 'skipped' or 'failed'. */
    state: text('state').notNull().default('pending'),
    outcomeDetail: text('outcome_detail'),
    /** The write this row produced, when it produced one. */
    writeId: text('write_id'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (table) => [
    index('calendar_plan_row_plan').on(table.planId, table.position),
    unique('calendar_plan_row_slot').on(table.planId, table.position),
  ],
);

/**
 * THE PERMANENT WRITE LOG. One appended row per outbound write, whatever the
 * outcome, and the row is never edited and never deleted.
 *
 * F108 asks that undo stay available for EVERY past write, including one made
 * two sessions earlier. That is only true if the log keeps enough to reverse the
 * write without asking Google anything: the event identifier, the verb, and both
 * sides of the change. All four are here.
 *
 * An undo is a new row with `undoesWriteId` set. Whether a write can still be
 * undone is therefore a question about the presence of another row rather than
 * about a flag somebody remembered to set, and a trigger in
 * `drizzle/pending/11-calendar.sql` refuses UPDATE and DELETE so it stays that
 * way.
 */
export const calendarWrite = pgTable(
  'calendar_write',
  {
    id: text('id').primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    planId: text('plan_id'),
    planRowId: text('plan_row_id'),
    /** The enumerated call site: 'calendars.insert', 'events.insert', and so on. */
    site: text('site').notNull(),
    /** 'added', 'moved', 'removed' or 'undo'. */
    verb: text('verb').notNull(),
    eventId: text('event_id').notNull(),
    sessionId: text('session_id'),
    title: text('title').notNull(),
    beforeStart: timestamp('before_start', { withTimezone: true }),
    beforeEnd: timestamp('before_end', { withTimezone: true }),
    afterStart: timestamp('after_start', { withTimezone: true }),
    afterEnd: timestamp('after_end', { withTimezone: true }),
    /** 'written' or 'failed'. A failure is logged as loudly as a success. */
    outcome: text('outcome').notNull(),
    httpStatus: integer('http_status'),
    detail: text('detail'),
    mode: text('mode').notNull(),
    /** The write this one reverses, when it is an undo. */
    undoesWriteId: text('undoes_write_id'),
  },
  (table) => [
    index('calendar_write_at').on(table.at),
    index('calendar_write_undoes').on(table.undoesWriteId),
  ],
);

/**
 * The demonstration account's own calendar, stored on this machine.
 *
 * It exists so the demonstration is a calendar rather than a canned answer: an
 * event written here is read back by the next plan, counted before and after a
 * second apply, and taken out again by undo. None of that is provable against a
 * fixture that forgets.
 *
 * Every row carries `demonstration` in `mode`, so what is a demonstration event
 * is readable off the database rather than off a badge.
 */
export const googleDemoEvent = pgTable(
  'google_demo_event',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id'),
    summary: text('summary').notNull(),
    description: text('description').notNull().default(''),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    mode: text('mode').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('google_demo_event_start').on(table.startAt)],
);
