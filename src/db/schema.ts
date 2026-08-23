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
 * ---------------------------------------------------------------------------
 */

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
