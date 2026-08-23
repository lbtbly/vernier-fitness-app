-- ---------------------------------------------------------------------------
-- Slice 11. Google Calendar and the confirmed diff.
--
-- Everything drizzle can model is in src/db/schema.ts. What is here is what it
-- cannot express: the append-only trigger that makes the write log permanent,
-- the check constraints that keep a verb and a state to their own small sets,
-- the partial index that stops one write being undone twice, and the connection
-- row that must exist from the first boot after this migration.
--
-- Ordered, and idempotent where SQL allows it. Appended to this slice's
-- generated migration on merge, on main.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. THE WRITE LOG IS PERMANENT.
--
-- F108 asks that undo stay available for every past write, including one made
-- two sessions earlier. A log that can be edited is a log that can be made to
-- say a write never happened, and then the calendar holds an event nothing in
-- this database knows how to take back out.
--
-- So calendar_write refuses UPDATE and DELETE, exactly the way `measurement`
-- does and for the same reason. An undo is a NEW row naming the one it reverses
-- in undoes_write_id, never an edit of the row it reverses.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION calendar_write_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'calendar_write is append only: % is refused. Reverse a write by inserting an undo row that names it in undoes_write_id.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS calendar_write_append_only ON "calendar_write";
CREATE TRIGGER calendar_write_append_only
  BEFORE UPDATE OR DELETE ON "calendar_write"
  FOR EACH ROW EXECUTE FUNCTION calendar_write_append_only();

-- ---------------------------------------------------------------------------
-- 2. One undo per write, enforced by the database.
--
-- A partial unique index rather than a constraint on the table: most rows carry
-- no undoes_write_id at all, and the rule is about the ones that do. Two undos
-- of the same write would delete an event twice, or re-insert one twice, and
-- the second attempt would be a write the owner confirmed once.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS calendar_write_one_undo
  ON "calendar_write" (undoes_write_id)
  WHERE undoes_write_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. The verbs and the outcomes, each to its own set.
--
-- The diff has three verbs and the log has those three plus the undo that
-- reverses one. A fourth verb arriving from a refactor would render as an
-- unknown chip on the confirm screen, which is a screen that must never show a
-- word the owner cannot act on.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_plan_row_verb') THEN
    ALTER TABLE "calendar_plan_row"
      ADD CONSTRAINT "calendar_plan_row_verb"
      CHECK (verb IN ('added', 'moved', 'removed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_plan_row_state') THEN
    ALTER TABLE "calendar_plan_row"
      ADD CONSTRAINT "calendar_plan_row_state"
      CHECK (state IN ('pending', 'applied', 'skipped', 'failed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_plan_state') THEN
    ALTER TABLE "calendar_plan"
      ADD CONSTRAINT "calendar_plan_state"
      CHECK (state IN ('open', 'applied', 'superseded'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_write_verb') THEN
    ALTER TABLE "calendar_write"
      ADD CONSTRAINT "calendar_write_verb"
      CHECK (verb IN ('added', 'moved', 'removed', 'undo'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_write_outcome') THEN
    ALTER TABLE "calendar_write"
      ADD CONSTRAINT "calendar_write_outcome"
      CHECK (outcome IN ('written', 'failed'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. A write names the call site it left from, and there are five of them.
--
-- F110 and C14 turn on the claim that every outbound write is one of an
-- enumerated set. The enumeration lives in src/lib/google/write-sites.ts, and
-- this is the same list stated where a refactor cannot quietly extend it: a
-- sixth site would have to be added here as well as there, in one commit, by
-- somebody who read both.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_write_site') THEN
    ALTER TABLE "calendar_write"
      ADD CONSTRAINT "calendar_write_site"
      CHECK (site IN (
        'calendars.insert',
        'calendars.delete',
        'events.insert',
        'events.update',
        'events.delete'
      ));
  END IF;
END $$;

-- And the same list on the plan row, which names the site it WILL use before
-- anything is written. A plan row and its write agree on the site or the
-- database refuses one of them.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_plan_row_site') THEN
    ALTER TABLE "calendar_plan_row"
      ADD CONSTRAINT "calendar_plan_row_site"
      CHECK (site IN (
        'calendars.insert',
        'calendars.delete',
        'events.insert',
        'events.update',
        'events.delete'
      ));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. NO EVENT WRITE MAY NAME THE PRIMARY CALENDAR.
--
-- The URL builders refuse it, `callGoogle` reads the finished URL back and
-- refuses it again, and this is the third net: an event identifier is derived
-- from the app's own record, so a row whose event id is the word every Google
-- account uses for "the owner's own calendar" is a row that came from somewhere
-- this product does not write.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_write_not_primary') THEN
    ALTER TABLE "calendar_write"
      ADD CONSTRAINT "calendar_write_not_primary"
      CHECK (event_id <> 'primary');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. The connection row exists from the first boot after this migration, so
--    every read has something to read and the settings screen never has to tell
--    an absent row from a disconnected one.
-- ---------------------------------------------------------------------------

INSERT INTO "google_connection" ("id", "mode", "state")
VALUES ('google_calendar', 'demo', 'disconnected')
ON CONFLICT ("id") DO NOTHING;
