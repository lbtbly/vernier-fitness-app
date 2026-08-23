CREATE TABLE "ai_call" (
	"id" text PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"mode" text NOT NULL,
	"model" text NOT NULL,
	"photo_id" text,
	"request" jsonb NOT NULL,
	"reply" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	"photo_analysis" boolean DEFAULT false NOT NULL,
	"menu_generation" boolean DEFAULT false NOT NULL,
	"health_explanations" boolean DEFAULT false NOT NULL,
	"calendar_titles" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_busy" (
	"id" text PRIMARY KEY NOT NULL,
	"calendar_id" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_plan" (
	"id" text PRIMARY KEY NOT NULL,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL,
	"window_from" timestamp with time zone NOT NULL,
	"window_to" timestamp with time zone NOT NULL,
	"mode" text NOT NULL,
	"calendar_id" text NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"availability_at" timestamp with time zone,
	"availability_stale" boolean DEFAULT false NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"before_events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unplaceable" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_changes" integer DEFAULT 0 NOT NULL,
	"held_back" integer DEFAULT 0 NOT NULL,
	"applied_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "calendar_plan_row" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"position" integer NOT NULL,
	"verb" text NOT NULL,
	"site" text NOT NULL,
	"session_id" text,
	"event_id" text NOT NULL,
	"title" text NOT NULL,
	"before_start" timestamp with time zone,
	"before_end" timestamp with time zone,
	"after_start" timestamp with time zone,
	"after_end" timestamp with time zone,
	"cause" text NOT NULL,
	"cause_key" text NOT NULL,
	"default_selected" boolean NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"outcome_detail" text,
	"write_id" text,
	"decided_at" timestamp with time zone,
	CONSTRAINT "calendar_plan_row_slot" UNIQUE("plan_id","position")
);
--> statement-breakpoint
CREATE TABLE "calendar_read_failure" (
	"id" text PRIMARY KEY NOT NULL,
	"calendar_id" text NOT NULL,
	"reason" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_write" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"plan_id" text,
	"plan_row_id" text,
	"site" text NOT NULL,
	"verb" text NOT NULL,
	"event_id" text NOT NULL,
	"session_id" text,
	"title" text NOT NULL,
	"before_start" timestamp with time zone,
	"before_end" timestamp with time zone,
	"after_start" timestamp with time zone,
	"after_end" timestamp with time zone,
	"outcome" text NOT NULL,
	"http_status" integer,
	"detail" text,
	"mode" text NOT NULL,
	"undoes_write_id" text
);
--> statement-breakpoint
CREATE TABLE "google_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"state" text NOT NULL,
	"app_calendar_id" text,
	"app_calendar_summary" text,
	"app_calendar_created_at" timestamp with time zone,
	"watched_calendar_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"connected_at" timestamp with time zone,
	"disconnected_at" timestamp with time zone,
	"last_error_kind" text,
	"last_error_raw" text,
	"last_error_at" timestamp with time zone,
	"last_availability_at" timestamp with time zone,
	"last_successful_write_at" timestamp with time zone,
	"background_sync_stopped" boolean DEFAULT false NOT NULL,
	"auth_state_hash" text,
	"auth_state_issued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_demo_event" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text,
	"summary" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"mode" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_run" (
	"id" text PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"period_start" text NOT NULL,
	"state" text DEFAULT 'running' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"detail" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"eaten_at" timestamp with time zone,
	"time_zone" text NOT NULL,
	"slot" text NOT NULL,
	"origin" text NOT NULL,
	"state" text DEFAULT 'eaten' NOT NULL,
	"source" text NOT NULL,
	"confidence" text NOT NULL,
	"kcal" double precision,
	"kcal_low" double precision,
	"kcal_high" double precision,
	"protein_g" double precision,
	"carb_g" double precision,
	"fat_g" double precision,
	"fibre_g" double precision,
	"unresolved_count" integer DEFAULT 0 NOT NULL,
	"coverage_pct" double precision,
	"recipe_id" text,
	"photo_id" text,
	"ai_call_id" text,
	"source_record_id" text NOT NULL,
	"import_version" text NOT NULL,
	"root_id" text NOT NULL,
	"corrects_id" text,
	"correction_index" integer DEFAULT 0 NOT NULL,
	"correction_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_entry_item" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"alias_id" text NOT NULL,
	"food_id" text,
	"grams_low" double precision NOT NULL,
	"grams_high" double precision NOT NULL,
	"exact_grams" double precision,
	"evidence" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"endpoint_tail" text NOT NULL,
	"kind" text NOT NULL,
	"status" integer NOT NULL,
	"apns_id" text,
	"detail" text DEFAULT '' NOT NULL,
	"removed" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"application_server_key" text NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_status" integer,
	"last_status_at" timestamp with time zone,
	"last_apns_id" text
);
--> statement-breakpoint
CREATE TABLE "recipe_box_item" (
	"id" text PRIMARY KEY NOT NULL,
	"recipe_id" text NOT NULL,
	"week_start" timestamp with time zone NOT NULL,
	"portions" integer DEFAULT 2 NOT NULL,
	"artifact_kind" text NOT NULL,
	"second_portion_answer" text,
	"answered_at" timestamp with time zone,
	"source_record_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_box_item_recipe_week" UNIQUE("recipe_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "reminder_item" (
	"id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"subject_id" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"line" text NOT NULL,
	"detail" text NOT NULL,
	"route" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"window_key" text,
	"sent_at" timestamp with time zone,
	"suppressed_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_item_subject" UNIQUE("category","subject_id")
);
--> statement-breakpoint
CREATE TABLE "reminder_preference" (
	"id" text PRIMARY KEY NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	"quiet_from" text DEFAULT '22:00' NOT NULL,
	"quiet_to" text DEFAULT '07:00' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_setting" (
	"category" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"lead_minutes" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_decision" (
	"id" text PRIMARY KEY NOT NULL,
	"week_start" text NOT NULL,
	"block" text NOT NULL,
	"state" text DEFAULT 'proposed' NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "review_decision_block" UNIQUE("week_start","block")
);
--> statement-breakpoint
CREATE TABLE "takeaway_proposal" (
	"id" text PRIMARY KEY NOT NULL,
	"week_start" timestamp with time zone NOT NULL,
	"position" integer NOT NULL,
	"dish_id" text NOT NULL,
	"search_url" text NOT NULL,
	"kcal_low" double precision,
	"kcal_high" double precision,
	"budget_kcal" integer,
	"state" text DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "takeaway_proposal_slot" UNIQUE("week_start","position")
);
--> statement-breakpoint
CREATE TABLE "usage_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"month_key" text NOT NULL,
	"purpose" text NOT NULL,
	"mode" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cost_usd" double precision NOT NULL,
	"outcome" text NOT NULL,
	"call_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_review" (
	"id" text PRIMARY KEY NOT NULL,
	"week_start" text NOT NULL,
	"period_start" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email_state" text DEFAULT 'preview' NOT NULL,
	"email_at" timestamp with time zone,
	"email_detail" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_plan_row" ADD CONSTRAINT "calendar_plan_row_plan_id_calendar_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."calendar_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_entry" ADD CONSTRAINT "meal_entry_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_entry" ADD CONSTRAINT "meal_entry_ai_call_id_ai_call_id_fk" FOREIGN KEY ("ai_call_id") REFERENCES "public"."ai_call"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_entry" ADD CONSTRAINT "meal_entry_source_record_id_source_record_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_record"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_entry_item" ADD CONSTRAINT "meal_entry_item_entry_id_meal_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."meal_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_entry_item" ADD CONSTRAINT "meal_entry_item_food_id_food_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_box_item" ADD CONSTRAINT "recipe_box_item_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_box_item" ADD CONSTRAINT "recipe_box_item_source_record_id_source_record_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_record"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_call_id_ai_call_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."ai_call"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_call_created" ON "ai_call" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_call_purpose" ON "ai_call" USING btree ("purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_consent_singleton" ON "ai_consent" USING btree ("singleton");--> statement-breakpoint
CREATE INDEX "calendar_busy_window" ON "calendar_busy" USING btree ("start_at","end_at");--> statement-breakpoint
CREATE INDEX "calendar_plan_built" ON "calendar_plan" USING btree ("built_at");--> statement-breakpoint
CREATE INDEX "calendar_plan_row_plan" ON "calendar_plan_row" USING btree ("plan_id","position");--> statement-breakpoint
CREATE INDEX "calendar_read_failure_read" ON "calendar_read_failure" USING btree ("read_at");--> statement-breakpoint
CREATE INDEX "calendar_write_at" ON "calendar_write" USING btree ("at");--> statement-breakpoint
CREATE INDEX "calendar_write_undoes" ON "calendar_write" USING btree ("undoes_write_id");--> statement-breakpoint
CREATE INDEX "google_demo_event_start" ON "google_demo_event" USING btree ("start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_run_period" ON "job_run" USING btree ("job_name","period_start");--> statement-breakpoint
CREATE INDEX "job_run_state" ON "job_run" USING btree ("state","claimed_at");--> statement-breakpoint
CREATE INDEX "meal_entry_eaten" ON "meal_entry" USING btree ("eaten_at");--> statement-breakpoint
CREATE INDEX "meal_entry_root" ON "meal_entry" USING btree ("root_id","correction_index");--> statement-breakpoint
CREATE INDEX "meal_entry_origin" ON "meal_entry" USING btree ("origin");--> statement-breakpoint
CREATE INDEX "meal_entry_item_entry" ON "meal_entry_item" USING btree ("entry_id","position");--> statement-breakpoint
CREATE INDEX "push_delivery_subscription" ON "push_delivery" USING btree ("subscription_id","at");--> statement-breakpoint
CREATE INDEX "push_delivery_at" ON "push_delivery" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscription_endpoint" ON "push_subscription" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "recipe_box_item_week" ON "recipe_box_item" USING btree ("week_start");--> statement-breakpoint
CREATE INDEX "reminder_item_state" ON "reminder_item" USING btree ("state","due_at");--> statement-breakpoint
CREATE INDEX "reminder_item_window" ON "reminder_item" USING btree ("window_key");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_preference_singleton" ON "reminder_preference" USING btree ("singleton");--> statement-breakpoint
CREATE INDEX "usage_ledger_month" ON "usage_ledger" USING btree ("month_key","created_at");--> statement-breakpoint
CREATE INDEX "usage_ledger_call" ON "usage_ledger" USING btree ("call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_review_week" ON "weekly_review" USING btree ("week_start");--> statement-breakpoint
CREATE INDEX "weekly_review_generated" ON "weekly_review" USING btree ("generated_at");
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Slice 10-meals, appended on merge. Written in its own worktree, numbered here.
-- ---------------------------------------------------------------------------
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
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Slice 11-calendar, appended on merge. Written in its own worktree, numbered here.
-- ---------------------------------------------------------------------------
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
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Slice 12-push, appended on merge. Written in its own worktree, numbered here.
-- ---------------------------------------------------------------------------
-- Slice 12. Push, the weekly review and the Sunday run.
--
-- Everything drizzle can model is in src/db/schema.ts and is generated on merge.
-- What is here is what it cannot say: the state vocabularies as CHECK
-- constraints, the partial index the sweep reads, and the four reminder rows
-- plus the quiet-hours row that a fresh install needs in order to have a
-- settings screen at all.
--
-- Ordered, and idempotent where Postgres allows it. Appended to this slice's
-- generated migration on merge, on main, in order.

-- ---------------------------------------------------------------------------
-- 1. The state vocabularies, enforced by the database rather than by a handler.
--
-- Every one of these columns is read back and rendered through a catalogue key,
-- so a value outside the set is not a bad row, it is a screen with nothing to
-- print. `measurement.source` already carries this treatment in
-- 0003_provenance.sql and this follows it.

ALTER TABLE "reminder_item"
  DROP CONSTRAINT IF EXISTS "reminder_item_category_known";
ALTER TABLE "reminder_item"
  ADD CONSTRAINT "reminder_item_category_known"
  CHECK ("category" IN ('session', 'measurements', 'menu', 'missing_data'));

ALTER TABLE "reminder_item"
  DROP CONSTRAINT IF EXISTS "reminder_item_state_known";
ALTER TABLE "reminder_item"
  ADD CONSTRAINT "reminder_item_state_known"
  CHECK ("state" IN ('pending', 'sent', 'done', 'suppressed', 'expired'));

ALTER TABLE "reminder_setting"
  DROP CONSTRAINT IF EXISTS "reminder_setting_category_known";
ALTER TABLE "reminder_setting"
  ADD CONSTRAINT "reminder_setting_category_known"
  CHECK ("category" IN ('session', 'measurements', 'menu', 'missing_data'));

-- Four hours, and a whole number of minutes. src/lib/reminders.ts states the
-- same bound; this is the one a bad write actually hits.
ALTER TABLE "reminder_setting"
  DROP CONSTRAINT IF EXISTS "reminder_setting_lead_bounded";
ALTER TABLE "reminder_setting"
  ADD CONSTRAINT "reminder_setting_lead_bounded"
  CHECK ("lead_minutes" >= 0 AND "lead_minutes" <= 240);

-- A quiet hour is a 24-hour wall clock and nothing else. Stored as text because
-- 22:00 means 22:00 on both sides of a clock change; this is what stops the
-- text being anything at all.
ALTER TABLE "reminder_preference"
  DROP CONSTRAINT IF EXISTS "reminder_preference_wall_times";
ALTER TABLE "reminder_preference"
  ADD CONSTRAINT "reminder_preference_wall_times"
  CHECK ("quiet_from" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     AND "quiet_to"   ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE "job_run"
  DROP CONSTRAINT IF EXISTS "job_run_state_known";
ALTER TABLE "job_run"
  ADD CONSTRAINT "job_run_state_known"
  CHECK ("state" IN ('running', 'done', 'failed'));

-- THE PERIOD KEY IS A LOCAL CALENDAR KEY AND THE DATABASE SAYS SO.
--
-- `2026-10-25T20:00`. No zone, no offset, no seconds. This is the constraint
-- that makes the October fallback impossible to reintroduce: a key computed by
-- arithmetic on an instant would arrive here as an ISO timestamp with a Z or an
-- offset on the end, and the insert would fail rather than quietly claiming a
-- second period for one Sunday evening.
ALTER TABLE "job_run"
  DROP CONSTRAINT IF EXISTS "job_run_period_is_local";
ALTER TABLE "job_run"
  ADD CONSTRAINT "job_run_period_is_local"
  CHECK ("period_start" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE "weekly_review"
  DROP CONSTRAINT IF EXISTS "weekly_review_email_state_known";
ALTER TABLE "weekly_review"
  ADD CONSTRAINT "weekly_review_email_state_known"
  CHECK ("email_state" IN ('preview', 'sent', 'failed'));

ALTER TABLE "weekly_review"
  DROP CONSTRAINT IF EXISTS "weekly_review_week_is_a_day_key";
ALTER TABLE "weekly_review"
  ADD CONSTRAINT "weekly_review_week_is_a_day_key"
  CHECK ("week_start" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');

ALTER TABLE "review_decision"
  DROP CONSTRAINT IF EXISTS "review_decision_block_known";
ALTER TABLE "review_decision"
  ADD CONSTRAINT "review_decision_block_known"
  CHECK ("block" IN ('training', 'nutrition', 'shopping'));

ALTER TABLE "review_decision"
  DROP CONSTRAINT IF EXISTS "review_decision_state_known";
ALTER TABLE "review_decision"
  ADD CONSTRAINT "review_decision_state_known"
  CHECK ("state" IN ('proposed', 'accepted', 'rejected'));

-- A delivery carries a real push-service status, or a zero meaning the request
-- never got one. Never a negative, never something invented.
ALTER TABLE "push_delivery"
  DROP CONSTRAINT IF EXISTS "push_delivery_status_plausible";
ALTER TABLE "push_delivery"
  ADD CONSTRAINT "push_delivery_status_plausible"
  CHECK ("status" >= 0 AND "status" < 600);

-- A subscription endpoint is an absolute HTTPS URL from a push service. A row
-- that is not one is a row nothing can ever be sent to.
ALTER TABLE "push_subscription"
  DROP CONSTRAINT IF EXISTS "push_subscription_endpoint_is_https";
ALTER TABLE "push_subscription"
  ADD CONSTRAINT "push_subscription_endpoint_is_https"
  CHECK ("endpoint" LIKE 'https://%');

-- ---------------------------------------------------------------------------
-- 2. The partial index the five-minute sweep reads.
--
-- The sweep asks one question, 288 times a day, forever: which reminders are
-- still pending and due. Almost every row in this table is 'done' or 'expired'
-- within a week of being written, so the index that matters covers the small
-- live set rather than the whole history.

DROP INDEX IF EXISTS "reminder_item_pending";
CREATE INDEX "reminder_item_pending"
  ON "reminder_item" ("due_at")
  WHERE "state" = 'pending';

-- The same shape for the ledger: the startup sweep looks for runs still marked
-- running, and there is normally exactly one of those or none at all.
DROP INDEX IF EXISTS "job_run_running";
CREATE INDEX "job_run_running"
  ON "job_run" ("claimed_at")
  WHERE "state" = 'running';

-- ---------------------------------------------------------------------------
-- 3. Seed: the four reminder categories and the one quiet-hours row.
--
-- Not a demonstration. A settings screen with no rows on it reads as broken,
-- and the defaults here are the ones src/lib/reminders.ts names:
-- DEFAULT_LEAD_MINUTES and DEFAULT_QUIET_HOURS. Session speaks thirty minutes
-- before; the other three speak when the thing is true.
--
-- ON CONFLICT DO NOTHING, so a second run of this file changes nothing and no
-- setting the owner has already touched is reset by a redeploy.

INSERT INTO "reminder_setting" ("category", "enabled", "lead_minutes")
VALUES
  ('session', true, 30),
  ('measurements', true, 0),
  ('menu', true, 0),
  ('missing_data', true, 0)
ON CONFLICT ("category") DO NOTHING;

INSERT INTO "reminder_preference" ("id", "singleton", "quiet_from", "quiet_to")
VALUES ('quiet-hours', true, '22:00', '07:00')
ON CONFLICT ("singleton") DO NOTHING;
