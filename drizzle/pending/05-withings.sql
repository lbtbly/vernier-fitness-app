-- Slice 5, Withings. Raw DDL that drizzle cannot express.
--
-- Everything drizzle CAN express is in src/db/schema.ts and will be generated
-- into a numbered migration on main, at merge, in order: the two new columns on
-- `measurement`, the unique index over (source, external_key), and the whole of
-- `withings_connection`. What is below is the rest, and it must be appended to
-- that generated migration in this order, after the table exists.
--
-- Ordered, and idempotent where Postgres allows it. Every CHECK is guarded so a
-- re-run is a no-op rather than a duplicate-object error, because this file is
-- applied by hand at merge and a merge is a thing people repeat.

-- ---------------------------------------------------------------------------
-- 1. The connection's state and mode are closed sets, enforced by the database.
--
-- Same reasoning as the six sources on `measurement`: a state the settings
-- screen has no word for must not be storable, because the failure that
-- produces is a chip printing a column value at a person, which is the defect
-- C6 was rewritten over.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'withings_connection_state_is_named'
  ) THEN
    ALTER TABLE "withings_connection"
      ADD CONSTRAINT "withings_connection_state_is_named"
      CHECK ("state" IN ('disconnected','connecting','connected','expiring','revoked','demo'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'withings_connection_mode_is_named'
  ) THEN
    ALTER TABLE "withings_connection"
      ADD CONSTRAINT "withings_connection_mode_is_named"
      CHECK ("mode" IN ('demo','live'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'withings_connection_demo_stage_is_named'
  ) THEN
    ALTER TABLE "withings_connection"
      ADD CONSTRAINT "withings_connection_demo_stage_is_named"
      CHECK ("demo_stage" IS NULL OR "demo_stage" IN ('initial','revised'));
  END IF;
END
$$;

-- One row, forever, the same way the owner is one row and the goal is one row.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'withings_connection_singleton'
  ) THEN
    ALTER TABLE "withings_connection"
      ADD CONSTRAINT "withings_connection_singleton" CHECK ("id" = 'withings');
  END IF;
END
$$;

-- The cursor is a unix second and it only ever moves forward past zero. A
-- negative one would be a clock that went backwards, and this table is what the
-- next sync reads to decide what it has already seen.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'withings_connection_cursor_is_positive'
  ) THEN
    ALTER TABLE "withings_connection"
      ADD CONSTRAINT "withings_connection_cursor_is_positive"
      CHECK ("cursor" IS NULL OR "cursor" > 0);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. The external key is a key, not a sentence.
--
-- Withings writes `grpid:type`, and a revision writes `grpid:type@modified`.
-- Anything else in that column is a writer that has not read A1, and the point
-- of the constraint is that the next importer cannot quietly widen the shape
-- and lose the unique index's meaning along with it.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'measurement_external_key_shape'
  ) THEN
    ALTER TABLE "measurement"
      ADD CONSTRAINT "measurement_external_key_shape"
      CHECK ("external_key" IS NULL OR "external_key" ~ '^[A-Za-z0-9_.:@-]+$');
  END IF;
END
$$;

-- A row with a key carries the modification instant it was written from, and a
-- row without one carries neither. Half of a pair is how "arriving with a newer
-- modification time" quietly starts comparing against null.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'measurement_external_pair'
  ) THEN
    ALTER TABLE "measurement"
      ADD CONSTRAINT "measurement_external_pair"
      CHECK (("external_key" IS NULL) = ("external_modified" IS NULL));
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Blood pressure, refused by the database as well.
--
-- The fetch layer drops a measure group carrying type 9 or 10 whole. The
-- storage layer in src/db/withings.ts refuses any type outside the eight this
-- product asks for. This is the third net and it is the only one no code path
-- can be refactored past: a metric name this product has no chart, no field and
-- no setting for cannot be inserted at all.
--
-- It names the two metrics rather than pattern matching on the word, because a
-- CHECK that reads `metric NOT LIKE '%pressure%'` would also refuse a metric
-- called `pressure_ulcer_score` some day and would miss one called `sbp`.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'measurement_no_blood_pressure'
  ) THEN
    ALTER TABLE "measurement"
      ADD CONSTRAINT "measurement_no_blood_pressure"
      CHECK ("metric" NOT IN (
        'systolic_blood_pressure',
        'diastolic_blood_pressure',
        'blood_pressure',
        'systolic',
        'diastolic'
      ));
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. The connection row exists from the first boot after this migration, so
--    every read has something to read and the settings screen never has to
--    tell an absent row from a disconnected one.
-- ---------------------------------------------------------------------------

INSERT INTO "withings_connection" ("id", "mode", "state")
VALUES ('withings', 'demo', 'disconnected')
ON CONFLICT ("id") DO NOTHING;
