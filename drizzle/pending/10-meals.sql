-- ---------------------------------------------------------------------------
-- Slice 10. HelloFresh, Uber Eats and the meal estimate.
-- ---------------------------------------------------------------------------
-- What `drizzle-kit generate` cannot produce from src/db/schema.ts: the check
-- constraints that close each token column, the append-only triggers on the two
-- meal tables, the trigger that refuses a correction which would scrub an
-- origin, and the one consent row that always exists.
--
-- The tables and columns themselves are modelled in schema.ts and are generated
-- on main, in order, at merge. Nothing here creates a table or a column drizzle
-- already knows about, so this file runs AFTER the generated migration for this
-- slice.
--
-- Ordered, and idempotent where Postgres allows it. Every statement can be run
-- twice: constraints are added inside a DO block that reads the catalogue
-- first, functions are CREATE OR REPLACE, triggers are dropped before they are
-- created, and the consent row is an upsert. A migration nobody dares re-run is
-- a migration that stops being run.
--
-- NOTHING HERE DELETES ANYTHING AND THERE IS NO TRUNCATE IN THIS FILE.

-- ---------------------------------------------------------------------------
-- 1. The consent row, which always exists.
-- ---------------------------------------------------------------------------
-- Four falses. An installation that has never opened the consent screen sends
-- nothing, and F94's "before the first send" is a property of the default row
-- rather than of a code path that remembers to check.

INSERT INTO "ai_consent" ("id", "singleton", "photo_analysis", "menu_generation",
                          "health_explanations", "calendar_titles")
VALUES ('consent', true, false, false, false, false)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Every token column, closed by the database.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- The four things Claude may be asked to do, and there is no fifth. A handler
  -- that invented one would be refused here rather than writing a row that no
  -- consent switch governs.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_call_purpose_is_named') THEN
    ALTER TABLE "ai_call" ADD CONSTRAINT "ai_call_purpose_is_named"
      CHECK ("purpose" IN ('photo_analysis','menu_generation','health_explanations','calendar_titles'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_call_mode_is_named') THEN
    ALTER TABLE "ai_call" ADD CONSTRAINT "ai_call_mode_is_named"
      CHECK ("mode" IN ('demo','live'));
  END IF;

  -- Token counts are counts. A negative one is an arithmetic error upstream and
  -- it would silently reduce the month's spend, which is the one direction an
  -- error in this table must never go.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_call_tokens_are_counts') THEN
    ALTER TABLE "ai_call" ADD CONSTRAINT "ai_call_tokens_are_counts"
      CHECK ("input_tokens" >= 0 AND "output_tokens" >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usage_ledger_purpose_is_named') THEN
    ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_purpose_is_named"
      CHECK ("purpose" IN ('photo_analysis','menu_generation','health_explanations','calendar_titles'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usage_ledger_mode_is_named') THEN
    ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_mode_is_named"
      CHECK ("mode" IN ('demo','live'));
  END IF;

  -- Two outcomes, and the second one is why the ceiling is visible at all: a
  -- month that refused six calls must not read like a month nobody used.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usage_ledger_outcome_is_named') THEN
    ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_outcome_is_named"
      CHECK ("outcome" IN ('charged','refused_over_ceiling'));
  END IF;

  -- "2026-08". A month key of any other shape would put spend in a month that
  -- no query sums, and the ceiling would read low for ever after.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usage_ledger_month_is_a_month') THEN
    ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_month_is_a_month"
      CHECK ("month_key" ~ '^[0-9]{4}-[0-9]{2}$');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usage_ledger_cost_is_not_negative') THEN
    ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_cost_is_not_negative"
      CHECK ("cost_usd" >= 0);
  END IF;

  -- A refused call cost nothing and produced nothing. Anything else on that row
  -- would be a charge the ceiling let through while claiming it had not.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usage_ledger_refusal_costs_nothing') THEN
    ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_refusal_costs_nothing"
      CHECK ("outcome" <> 'refused_over_ceiling' OR ("cost_usd" = 0 AND "output_tokens" = 0));
  END IF;

  -- The same six sources the provenance spine uses, unchanged. Amendment A3:
  -- a photo estimate the owner confirmed came from the owner, so it is
  -- 'manual', and the model's involvement is the confidence and the record.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meal_entry_source_is_named') THEN
    ALTER TABLE "meal_entry" ADD CONSTRAINT "meal_entry_source_is_named"
      CHECK ("source" IN ('withings','apple_health_shortcut','manual','lab_pdf','derived','demo'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meal_entry_confidence_is_named') THEN
    ALTER TABLE "meal_entry" ADD CONSTRAINT "meal_entry_confidence_is_named"
      CHECK ("confidence" IN ('measured_device','measured_manual','reported','printed','estimated','derived','demo'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meal_entry_origin_is_named') THEN
    ALTER TABLE "meal_entry" ADD CONSTRAINT "meal_entry_origin_is_named"
      CHECK ("origin" IN ('photo_estimate','typed','recipe_box','planned'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meal_entry_state_is_named') THEN
    ALTER TABLE "meal_entry" ADD CONSTRAINT "meal_entry_state_is_named"
      CHECK ("state" IN ('eaten','frozen'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meal_entry_slot_is_named') THEN
    ALTER TABLE "meal_entry" ADD CONSTRAINT "meal_entry_slot_is_named"
      CHECK ("slot" IN ('breakfast','lunch','dinner','snack'));
  END IF;

  -- F97, HALF OF IT, IN A CHECK CONSTRAINT. An entry that came from a
  -- photograph is an estimate, names the call that produced it and names the
  -- photograph itself. There is no row shape in which a photo estimate has lost
  -- its badge, so no future handler can write one.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meal_entry_photo_estimate_is_badged') THEN
    ALTER TABLE "meal_entry" ADD CONSTRAINT "meal_entry_photo_estimate_is_badged"
      CHECK ("origin" <> 'photo_estimate'
             OR ("confidence" = 'estimated' AND "ai_call_id" IS NOT NULL AND "photo_id" IS NOT NULL));
  END IF;

  -- A range is a range, and the stored midpoint sits inside it. A row that said
  -- 750 kcal with a range of 800 to 900 would be two different claims about the
  -- same meal.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meal_entry_range_is_a_range') THEN
    ALTER TABLE "meal_entry" ADD CONSTRAINT "meal_entry_range_is_a_range"
      CHECK ("kcal_low" IS NULL OR "kcal_high" IS NULL
             OR ("kcal_low" <= "kcal_high"
                 AND ("kcal" IS NULL OR ("kcal" >= "kcal_low" AND "kcal" <= "kcal_high"))));
  END IF;

  -- The same chain shape `measurement` carries: an original names itself, a
  -- correction names what it corrects and is not its own root.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meal_entry_correction_chain') THEN
    ALTER TABLE "meal_entry" ADD CONSTRAINT "meal_entry_correction_chain"
      CHECK (("correction_index" = 0 AND "corrects_id" IS NULL AND "root_id" = "id")
             OR ("correction_index" > 0 AND "corrects_id" IS NOT NULL AND "root_id" <> "id"));
  END IF;

  -- A frozen portion has not been eaten, so it has no instant. An eaten one
  -- does. Absence is drawn as absence here too: a frozen row does not get a
  -- date that would put it in a day total.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meal_entry_frozen_has_no_instant') THEN
    ALTER TABLE "meal_entry" ADD CONSTRAINT "meal_entry_frozen_has_no_instant"
      CHECK (("state" = 'frozen' AND "eaten_at" IS NULL) OR ("state" = 'eaten' AND "eaten_at" IS NOT NULL));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meal_entry_item_evidence_is_named') THEN
    ALTER TABLE "meal_entry_item" ADD CONSTRAINT "meal_entry_item_evidence_is_named"
      CHECK ("evidence" IN ('photo','named_portion','weighed'));
  END IF;

  -- The band is ordered and it is real grams. A weighed line has the same
  -- number at both ends and says so in `exact_grams`, which is how a screen
  -- knows to stop drawing it as an estimate.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meal_entry_item_band_is_a_band') THEN
    ALTER TABLE "meal_entry_item" ADD CONSTRAINT "meal_entry_item_band_is_a_band"
      CHECK ("grams_low" > 0 AND "grams_high" >= "grams_low"
             AND ("exact_grams" IS NULL
                  OR ("evidence" = 'weighed' AND "grams_low" = "exact_grams" AND "grams_high" = "exact_grams")));
  END IF;

  -- Four lawful imports and no fifth. There is no credential column on this
  -- table and there is nothing to sign in to.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipe_box_item_artifact_is_named') THEN
    ALTER TABLE "recipe_box_item" ADD CONSTRAINT "recipe_box_item_artifact_is_named"
      CHECK ("artifact_kind" IN ('link','document','photo','manual'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipe_box_item_answer_is_named') THEN
    ALTER TABLE "recipe_box_item" ADD CONSTRAINT "recipe_box_item_answer_is_named"
      CHECK ("second_portion_answer" IS NULL
             OR "second_portion_answer" IN ('next_day','moved','frozen'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipe_box_item_portions_are_portions') THEN
    ALTER TABLE "recipe_box_item" ADD CONSTRAINT "recipe_box_item_portions_are_portions"
      CHECK ("portions" >= 1 AND "portions" <= 8);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'takeaway_proposal_state_is_named') THEN
    ALTER TABLE "takeaway_proposal" ADD CONSTRAINT "takeaway_proposal_state_is_named"
      CHECK ("state" IN ('proposed','accepted','rejected'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'takeaway_proposal_position_is_a_slot') THEN
    ALTER TABLE "takeaway_proposal" ADD CONSTRAINT "takeaway_proposal_position_is_a_slot"
      CHECK ("position" IN (1,2));
  END IF;

  -- F92 AS A CONSTRAINT. The stored link is a SEARCH page on the provider's own
  -- host and nothing else. An item-level link cannot be written here, because
  -- no item-level format is documented and constructing one would be a guess
  -- against terms that prohibit exactly that.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'takeaway_proposal_link_is_a_search') THEN
    ALTER TABLE "takeaway_proposal" ADD CONSTRAINT "takeaway_proposal_link_is_a_search"
      CHECK ("search_url" LIKE 'https://www.ubereats.com/search?%');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'takeaway_proposal_band_is_a_band') THEN
    ALTER TABLE "takeaway_proposal" ADD CONSTRAINT "takeaway_proposal_band_is_a_band"
      CHECK ("kcal_low" IS NULL OR "kcal_high" IS NULL OR "kcal_low" <= "kcal_high");
  END IF;
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. The two meal tables are append only.
-- ---------------------------------------------------------------------------
-- The same rule `measurement` has carried since slice 3, for the same reason: a
-- number that changes without saying so makes every other number on the
-- dashboard not worth reading. A correction is an insert into the chain or it
-- does not happen, and the original stays readable after three of them.

CREATE OR REPLACE FUNCTION meal_entry_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'meal_entry is append only: % is refused. Correct an entry by inserting a new row that names it in corrects_id, which keeps the estimate and its origin readable.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS meal_entry_append_only ON "meal_entry";
--> statement-breakpoint
CREATE TRIGGER meal_entry_append_only BEFORE UPDATE OR DELETE ON "meal_entry"
  FOR EACH ROW EXECUTE FUNCTION meal_entry_append_only();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION meal_entry_item_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'meal_entry_item is append only: % is refused. A corrected plate is a new entry in the chain with its own lines; the lines that were confirmed stay readable.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS meal_entry_item_append_only ON "meal_entry_item";
--> statement-breakpoint
CREATE TRIGGER meal_entry_item_append_only BEFORE UPDATE OR DELETE ON "meal_entry_item"
  FOR EACH ROW EXECUTE FUNCTION meal_entry_item_append_only();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. A correction may not scrub the origin.
-- ---------------------------------------------------------------------------
-- THE OTHER HALF OF F97, AND THE HALF A CHECK CONSTRAINT CANNOT REACH, because
-- it is a statement about two rows. A correction inherits the origin, the
-- confidence, the call and the photograph of the row it corrects. Three edits
-- later the entry still says estimate and still reaches the model reply, and
-- the reason is not that every handler remembered: it is that this refuses the
-- insert.
--
-- What would make this go red: write a correction with confidence 'reported'
-- against a row whose confidence is 'estimated', which is exactly what an
-- innocent-looking "the owner typed a number so it is his now" change would do.

CREATE OR REPLACE FUNCTION meal_entry_keeps_its_origin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent RECORD;
BEGIN
  IF NEW."corrects_id" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "origin", "confidence", "ai_call_id", "photo_id", "root_id", "source_record_id"
    INTO parent
    FROM "meal_entry"
   WHERE "id" = NEW."corrects_id";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'meal_entry correction names % , which is not an entry.', NEW."corrects_id"
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW."origin" IS DISTINCT FROM parent."origin" THEN
    RAISE EXCEPTION 'meal_entry correction may not change origin from % to %. An estimate stays an estimate after it is edited.', parent."origin", NEW."origin"
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW."confidence" IS DISTINCT FROM parent."confidence" THEN
    RAISE EXCEPTION 'meal_entry correction may not change confidence from % to %. Provenance is never scrubbed.', parent."confidence", NEW."confidence"
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW."ai_call_id" IS DISTINCT FROM parent."ai_call_id"
     OR NEW."photo_id" IS DISTINCT FROM parent."photo_id" THEN
    RAISE EXCEPTION 'meal_entry correction may not drop the photo or the model reply it came from.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW."root_id" IS DISTINCT FROM parent."root_id" THEN
    RAISE EXCEPTION 'meal_entry correction must stay in the chain it corrects.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS meal_entry_keeps_its_origin ON "meal_entry";
--> statement-breakpoint
CREATE TRIGGER meal_entry_keeps_its_origin BEFORE INSERT ON "meal_entry"
  FOR EACH ROW EXECUTE FUNCTION meal_entry_keeps_its_origin();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 5. Blood pressure, refused here too.
-- ---------------------------------------------------------------------------
-- 0007 put this on `measurement` and on `lab_analyte`. A meal entry has no
-- reading and no analyte, so there is nothing here to refuse and no constraint
-- is added: naming one would be a check that passes by not checking. This
-- comment exists so the next reader knows the question was asked.

-- ---------------------------------------------------------------------------
-- 6. The day index the Eat screen reads.
-- ---------------------------------------------------------------------------
-- One partial index, over the entries that stand: the current row of each chain
-- for a day. drizzle cannot express the WHERE, and without it every render of
-- the day card sorts the whole table.

CREATE INDEX IF NOT EXISTS "meal_entry_eaten_day"
  ON "meal_entry" ("eaten_at" DESC)
  WHERE "state" = 'eaten' AND "eaten_at" IS NOT NULL;
