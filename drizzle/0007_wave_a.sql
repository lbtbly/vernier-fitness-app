CREATE TABLE "dietary_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dietary_rule_kind_subject" UNIQUE("kind","subject")
);
--> statement-breakpoint
CREATE TABLE "food" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_ref" text NOT NULL,
	"name_fr" text NOT NULL,
	"group_code" text NOT NULL,
	"subgroup_code" text NOT NULL,
	"kcal_100g" double precision,
	"protein_g" double precision,
	"carb_g" double precision,
	"fat_g" double precision,
	"fibre_g" double precision,
	"energy_source" text,
	"censored_fields" text[] DEFAULT '{}' NOT NULL,
	"table_version" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_source_ref" UNIQUE("source","source_ref")
);
--> statement-breakpoint
CREATE TABLE "health_sample" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"origin" text NOT NULL,
	"metric" text NOT NULL,
	"grouping" text NOT NULL,
	"type" text NOT NULL,
	"value_raw" text NOT NULL,
	"value" double precision,
	"unit" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"offset_minutes" integer NOT NULL,
	"sample_source" text NOT NULL,
	"dedup_key" text NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"key_id" text NOT NULL,
	"device" text NOT NULL,
	"nonce" text NOT NULL,
	"window_start" timestamp with time zone,
	"window_end" timestamp with time zone,
	"generated_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" text NOT NULL,
	"series_count" integer DEFAULT 0 NOT NULL,
	"rows_received" integer DEFAULT 0 NOT NULL,
	"rows_accepted" integer DEFAULT 0 NOT NULL,
	"rows_duplicate" integer DEFAULT 0 NOT NULL,
	"readings_stored" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_credential" (
	"key_id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"live" boolean GENERATED ALWAYS AS ("revoked_at" is null) STORED NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_nonce" (
	"id" text PRIMARY KEY NOT NULL,
	"nonce" text NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_analyte" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"unit" text NOT NULL,
	"printed" jsonb NOT NULL,
	"low" double precision NOT NULL,
	"high" double precision NOT NULL,
	"reference_low" double precision,
	"reference_high" double precision,
	"source_url" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"position" integer NOT NULL,
	"built_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_document" (
	"id" text PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"page_count" integer NOT NULL,
	"mode" text NOT NULL,
	"state" text DEFAULT 'review' NOT NULL,
	"panel_date" timestamp with time zone,
	"laboratory" text DEFAULT '' NOT NULL,
	"stored_path" text,
	"checksum" text,
	"file_removed" boolean DEFAULT false NOT NULL,
	"retention" text,
	"retention_at" timestamp with time zone,
	"refusals" integer DEFAULT 0 NOT NULL,
	"census" jsonb NOT NULL,
	"extraction" jsonb NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"validated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "meal_plan" (
	"id" text PRIMARY KEY NOT NULL,
	"week_start" timestamp with time zone NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"max_cook_minutes" integer NOT NULL,
	"kcal_target" integer NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"generation" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_allowlist" (
	"host" text PRIMARY KEY NOT NULL,
	"embedding_mode" text NOT NULL,
	"reason_key" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movement" (
	"id" text PRIMARY KEY NOT NULL,
	"name_key" text NOT NULL,
	"cue_key" text NOT NULL,
	"modality" text NOT NULL,
	"pattern" text NOT NULL,
	"muscles" text[] DEFAULT '{}' NOT NULL,
	"equipment" text[] DEFAULT '{}' NOT NULL,
	"step" integer NOT NULL,
	"unit" text NOT NULL,
	"sets" integer NOT NULL,
	"low" integer NOT NULL,
	"high" integer NOT NULL,
	"rest_seconds" integer NOT NULL,
	"effort_scale" text NOT NULL,
	"loadable" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movement_media" (
	"id" text PRIMARY KEY NOT NULL,
	"movement_id" text NOT NULL,
	"url" text NOT NULL,
	"author" text NOT NULL,
	"licence" text NOT NULL,
	"licence_url" text DEFAULT '' NOT NULL,
	"attribution_url" text DEFAULT '' NOT NULL,
	"embedding_mode" text NOT NULL,
	"kind" text NOT NULL,
	"local_path" text DEFAULT '' NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"bytes" integer DEFAULT 0 NOT NULL,
	"checksum" text DEFAULT '' NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movement_media_url" UNIQUE("movement_id","url")
);
--> statement-breakpoint
CREATE TABLE "nutrition_target" (
	"id" text PRIMARY KEY NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	"sex" text NOT NULL,
	"age_years" integer NOT NULL,
	"height_cm" double precision NOT NULL,
	"weight_kg" double precision NOT NULL,
	"equation" text NOT NULL,
	"activity_level" text NOT NULL,
	"pal" double precision NOT NULL,
	"rmr_kcal" double precision NOT NULL,
	"tdee_kcal" double precision NOT NULL,
	"rate_kg_per_week" double precision NOT NULL,
	"kcal_target" integer NOT NULL,
	"protein_g" integer NOT NULL,
	"carb_g" integer NOT NULL,
	"fat_g" integer NOT NULL,
	"fibre_g" integer NOT NULL,
	"below_resting" boolean DEFAULT false NOT NULL,
	"hard_floor_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planned_meal" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"day_index" integer NOT NULL,
	"slot" text NOT NULL,
	"recipe_id" text NOT NULL,
	"snapshot_id" text,
	"state" text DEFAULT 'proposed' NOT NULL,
	"decided_at" timestamp with time zone,
	"lactose_free" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "planned_meal_slot" UNIQUE("plan_id","day_index","slot")
);
--> statement-breakpoint
CREATE TABLE "progression_proposal" (
	"id" text PRIMARY KEY NOT NULL,
	"movement_id" text NOT NULL,
	"lever" text NOT NULL,
	"from_load_kg" double precision,
	"to_load_kg" double precision,
	"from_target" integer NOT NULL,
	"to_target" integer NOT NULL,
	"to_movement_id" text,
	"state" text DEFAULT 'proposed' NOT NULL,
	"trigger" jsonb NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"seed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "readiness_check" (
	"id" text PRIMARY KEY NOT NULL,
	"activity" text NOT NULL,
	"known_disease" boolean NOT NULL,
	"symptoms" text[] DEFAULT '{}' NOT NULL,
	"desired_intensity" text NOT NULL,
	"outcome" text NOT NULL,
	"because" text NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe" (
	"id" text PRIMARY KEY NOT NULL,
	"name_key" text,
	"name" text,
	"servings" integer NOT NULL,
	"cook_minutes" integer NOT NULL,
	"slot" text NOT NULL,
	"origin" text NOT NULL,
	"origin_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredient" (
	"id" text PRIMARY KEY NOT NULL,
	"recipe_id" text NOT NULL,
	"alias_id" text NOT NULL,
	"food_id" text,
	"grams" double precision NOT NULL,
	"position" integer NOT NULL,
	"box_supplied" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_nutrition" (
	"id" text PRIMARY KEY NOT NULL,
	"recipe_id" text NOT NULL,
	"variant" text DEFAULT 'base' NOT NULL,
	"version" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"per_serving_kcal" double precision,
	"per_serving_protein_g" double precision,
	"per_serving_carb_g" double precision,
	"per_serving_fat_g" double precision,
	"per_serving_fibre_g" double precision,
	"provenance" text NOT NULL,
	"coverage_pct" double precision NOT NULL,
	"fibre_coverage_pct" double precision NOT NULL,
	"source_food_ids_hash" text NOT NULL,
	"computed_energy_count" integer DEFAULT 0 NOT NULL,
	"ingredient_count" integer NOT NULL,
	"unresolved_count" integer DEFAULT 0 NOT NULL,
	"superseded_at" timestamp with time zone,
	CONSTRAINT "recipe_nutrition_version" UNIQUE("recipe_id","variant","version")
);
--> statement-breakpoint
CREATE TABLE "recipe_question" (
	"id" text PRIMARY KEY NOT NULL,
	"recipe_id" text NOT NULL,
	"snapshot_id" text NOT NULL,
	"stored_hash" text NOT NULL,
	"incoming_hash" text NOT NULL,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"answered_at" timestamp with time zone,
	"answer" text
);
--> statement-breakpoint
CREATE TABLE "session_movement" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_id" text NOT NULL,
	"position" integer NOT NULL,
	"movement_id" text NOT NULL,
	"sets" integer NOT NULL,
	"target" integer NOT NULL,
	"load_kg" double precision,
	"rest_seconds" integer NOT NULL,
	"substituted_for" text,
	CONSTRAINT "session_movement_slot" UNIQUE("proposal_id","position")
);
--> statement-breakpoint
CREATE TABLE "session_proposal" (
	"id" text PRIMARY KEY NOT NULL,
	"week_start" text NOT NULL,
	"position" integer NOT NULL,
	"planned_for" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"kind" text NOT NULL,
	"place" text NOT NULL,
	"cause" text NOT NULL,
	"cause_key" text NOT NULL,
	"full_body" boolean DEFAULT false NOT NULL,
	"percent_longer" integer,
	"longest_minutes" integer,
	"state" text DEFAULT 'proposed' NOT NULL,
	"decided_at" timestamp with time zone,
	"planned_session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "session_proposal_slot" UNIQUE("week_start","position")
);
--> statement-breakpoint
CREATE TABLE "session_report" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"effort_scale" text NOT NULL,
	"effort" integer,
	"pain_site" text DEFAULT 'none' NOT NULL,
	"pain_score" integer,
	"pain_subsided_by_morning" boolean,
	"note" text DEFAULT '' NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_report_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE TABLE "session_run" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_id" text,
	"planned_session_id" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"state" text DEFAULT 'running' NOT NULL,
	"screen_awake" boolean DEFAULT false NOT NULL,
	"seed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "set_log" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"movement_id" text NOT NULL,
	"set_index" integer NOT NULL,
	"target" integer NOT NULL,
	"achieved" integer NOT NULL,
	"load_kg" double precision,
	"rir" integer,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "set_log_slot" UNIQUE("run_id","movement_id","set_index")
);
--> statement-breakpoint
CREATE TABLE "shopping_item" (
	"id" text PRIMARY KEY NOT NULL,
	"list_id" text NOT NULL,
	"alias_id" text NOT NULL,
	"aisle" text NOT NULL,
	"unit" text NOT NULL,
	"needed_quantity" double precision NOT NULL,
	"original_quantity" double precision NOT NULL,
	"quantity" double precision NOT NULL,
	"count_noun" text,
	"deduction" text DEFAULT 'none' NOT NULL,
	"deduction_day_index" integer,
	"checked" boolean DEFAULT false NOT NULL,
	"checked_at" timestamp with time zone,
	"removed" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "shopping_item_alias" UNIQUE("list_id","alias_id","deduction")
);
--> statement-breakpoint
CREATE TABLE "shopping_item_source" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"planned_meal_id" text NOT NULL,
	"grams" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_list" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_item" (
	"id" text PRIMARY KEY NOT NULL,
	"alias_id" text NOT NULL,
	"quantity" double precision NOT NULL,
	"unit" text NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "measurement" ADD COLUMN "reference_low" double precision;--> statement-breakpoint
ALTER TABLE "measurement" ADD COLUMN "reference_high" double precision;--> statement-breakpoint
ALTER TABLE "measurement" ADD COLUMN "reference_text" text;--> statement-breakpoint
ALTER TABLE "health_sample" ADD CONSTRAINT "health_sample_batch_id_ingest_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."ingest_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_media" ADD CONSTRAINT "movement_media_movement_id_movement_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_meal" ADD CONSTRAINT "planned_meal_plan_id_meal_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_meal" ADD CONSTRAINT "planned_meal_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_meal" ADD CONSTRAINT "planned_meal_snapshot_id_recipe_nutrition_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."recipe_nutrition"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progression_proposal" ADD CONSTRAINT "progression_proposal_movement_id_movement_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredient" ADD CONSTRAINT "recipe_ingredient_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredient" ADD CONSTRAINT "recipe_ingredient_food_id_food_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_nutrition" ADD CONSTRAINT "recipe_nutrition_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_question" ADD CONSTRAINT "recipe_question_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_question" ADD CONSTRAINT "recipe_question_snapshot_id_recipe_nutrition_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."recipe_nutrition"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_movement" ADD CONSTRAINT "session_movement_proposal_id_session_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."session_proposal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_movement" ADD CONSTRAINT "session_movement_movement_id_movement_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_proposal" ADD CONSTRAINT "session_proposal_planned_session_id_planned_session_id_fk" FOREIGN KEY ("planned_session_id") REFERENCES "public"."planned_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_report" ADD CONSTRAINT "session_report_run_id_session_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."session_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_run" ADD CONSTRAINT "session_run_proposal_id_session_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."session_proposal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_run" ADD CONSTRAINT "session_run_planned_session_id_planned_session_id_fk" FOREIGN KEY ("planned_session_id") REFERENCES "public"."planned_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_log" ADD CONSTRAINT "set_log_run_id_session_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."session_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_log" ADD CONSTRAINT "set_log_movement_id_movement_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_item" ADD CONSTRAINT "shopping_item_list_id_shopping_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."shopping_list"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_item_source" ADD CONSTRAINT "shopping_item_source_item_id_shopping_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."shopping_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_item_source" ADD CONSTRAINT "shopping_item_source_planned_meal_id_planned_meal_id_fk" FOREIGN KEY ("planned_meal_id") REFERENCES "public"."planned_meal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list" ADD CONSTRAINT "shopping_list_plan_id_meal_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_subgroup" ON "food" USING btree ("subgroup_code");--> statement-breakpoint
CREATE INDEX "food_energy_source" ON "food" USING btree ("energy_source");--> statement-breakpoint
CREATE UNIQUE INDEX "health_sample_dedup_key" ON "health_sample" USING btree ("dedup_key");--> statement-breakpoint
CREATE INDEX "health_sample_metric_start_at" ON "health_sample" USING btree ("metric","start_at");--> statement-breakpoint
CREATE INDEX "health_sample_batch" ON "health_sample" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "ingest_batch_received_at" ON "ingest_batch" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ingest_nonce_value" ON "ingest_nonce" USING btree ("nonce");--> statement-breakpoint
CREATE INDEX "ingest_nonce_expires_at" ON "ingest_nonce" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "lab_analyte_position" ON "lab_analyte" USING btree ("position");--> statement-breakpoint
CREATE INDEX "lab_document_state" ON "lab_document" USING btree ("state","uploaded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_plan_week" ON "meal_plan" USING btree ("week_start");--> statement-breakpoint
CREATE INDEX "meal_plan_generated" ON "meal_plan" USING btree ("generated_at");--> statement-breakpoint
CREATE INDEX "movement_pattern" ON "movement" USING btree ("pattern","step");--> statement-breakpoint
CREATE INDEX "movement_media_movement" ON "movement_media" USING btree ("movement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nutrition_target_singleton" ON "nutrition_target" USING btree ("singleton");--> statement-breakpoint
CREATE INDEX "planned_meal_plan" ON "planned_meal" USING btree ("plan_id","day_index","position");--> statement-breakpoint
CREATE INDEX "progression_proposal_state" ON "progression_proposal" USING btree ("state","proposed_at");--> statement-breakpoint
CREATE INDEX "readiness_check_answered" ON "readiness_check" USING btree ("answered_at");--> statement-breakpoint
CREATE INDEX "recipe_slot" ON "recipe" USING btree ("slot","cook_minutes");--> statement-breakpoint
CREATE INDEX "recipe_ingredient_recipe" ON "recipe_ingredient" USING btree ("recipe_id","position");--> statement-breakpoint
CREATE INDEX "recipe_nutrition_current" ON "recipe_nutrition" USING btree ("recipe_id","variant","superseded_at");--> statement-breakpoint
CREATE INDEX "recipe_question_state" ON "recipe_question" USING btree ("state","raised_at");--> statement-breakpoint
CREATE INDEX "session_movement_proposal" ON "session_movement" USING btree ("proposal_id","position");--> statement-breakpoint
CREATE INDEX "session_proposal_week" ON "session_proposal" USING btree ("week_start","position");--> statement-breakpoint
CREATE INDEX "session_report_pain" ON "session_report" USING btree ("pain_site","recorded_at");--> statement-breakpoint
CREATE INDEX "session_run_started" ON "session_run" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "set_log_movement" ON "set_log" USING btree ("movement_id","completed_at");--> statement-breakpoint
CREATE INDEX "shopping_item_list" ON "shopping_item" USING btree ("list_id","aisle","position");--> statement-breakpoint
CREATE INDEX "shopping_item_source_item" ON "shopping_item_source" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shopping_list_plan" ON "shopping_list" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_item_alias" ON "stock_item" USING btree ("alias_id");
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Slice 06-apple-health, appended on merge. Written in its own worktree, numbered here.
-- ---------------------------------------------------------------------------
-- Slice 6, Apple Health ingest. The DDL drizzle cannot express.
--
-- The four tables themselves are in src/db/schema.ts and drizzle generates
-- them on merge, numbered in order on main. What is here is what drizzle has
-- no builder for: a partial unique index, two check constraints over token
-- vocabularies, and the trigger that makes an append-only table append only in
-- the database rather than in a code review.
--
-- Ordered, and idempotent where Postgres allows it. Paste after the generated
-- CREATE TABLE statements for this slice, keeping the statement breakpoints.

-- 1. Exactly one ingest credential may be live at a time.
--
-- Revocation sets revoked_at rather than deleting the row, so the history of
-- which key existed and when it stopped survives. Without this index a second
-- create would leave two live tokens and the owner would have no way to tell
-- which one his phone is carrying. `live` is generated by the database from
-- revoked_at, and the predicate is what makes the index partial: any number of
-- revoked rows, never two live ones.
CREATE UNIQUE INDEX IF NOT EXISTS "ingest_credential_one_live"
  ON "ingest_credential" ("live") WHERE "live";--> statement-breakpoint

-- 2. The outcome of an arrival is one of a named set, not free text.
--
-- Same rule the provenance spine already applies to source, confidence and
-- dedup decision: a column whose values reach a screen through a lookup must
-- not be able to hold a value the lookup has no words for. `accepted` plus the
-- nine refusal codes in src/lib/health-ingest.ts, and nothing else.
ALTER TABLE "ingest_batch" ADD CONSTRAINT "ingest_batch_outcome_is_named"
  CHECK ("outcome" IN ('accepted','bad_schema','bad_token','bad_digest','stale_timestamp',
                       'replayed_nonce','forbidden_type','length_mismatch','too_large',
                       'bad_timestamp_format'));--> statement-breakpoint

-- 3. Every sample carries the one origin this table is for.
--
-- health_sample holds what the iPhone shortcut sent and nothing else. Naming
-- the origin in the row and constraining it here means a later importer cannot
-- quietly reuse this table for a different device and leave the provenance
-- chips on Health saying Health about something that never came from it.
ALTER TABLE "health_sample" ADD CONSTRAINT "health_sample_origin_is_the_shortcut"
  CHECK ("origin" = 'apple_health_shortcut');--> statement-breakpoint

-- 4. A sample ends when it ends or later, never before it began.
ALTER TABLE "health_sample" ADD CONSTRAINT "health_sample_window_runs_forwards"
  CHECK ("end_at" >= "start_at");--> statement-breakpoint

-- 5. health_sample is append only, and Postgres is what says so.
--
-- This is raw evidence of what a device reported. A correction belongs on the
-- measurement the roll-up wrote, where the correction chain lives and where the
-- original stays readable; rewriting the sample would destroy the thing the
-- correction is a correction OF. `measurement` has carried this trigger since
-- slice 3 and this is the same rule for the same reason, so it is worded the
-- same way and raises the same SQLSTATE.
CREATE FUNCTION health_sample_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'health_sample is append only: % is refused. A sample is what the phone reported; correct the reading it rolled up into instead, which keeps the original readable.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER health_sample_append_only BEFORE UPDATE OR DELETE ON "health_sample"
  FOR EACH ROW EXECUTE FUNCTION health_sample_append_only();
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Slice 07-blood, appended on merge. Written in its own worktree, numbered here.
-- ---------------------------------------------------------------------------
-- Slice 7. Blood tests: manual, PDF, and per-row validation.
--
-- This file holds what `drizzle-kit generate` cannot produce from
-- src/db/schema.ts: the check constraints, the append-only trigger for the new
-- review table, and the seed of the thirteen analytes F57 names. The tables and
-- columns themselves are modelled in schema.ts and are generated on main, in
-- order, at merge; nothing here creates a table or a column that drizzle already
-- knows about, so this file runs AFTER the generated migration for this slice.
--
-- Ordered, and idempotent where Postgres allows it. Every statement can be run
-- twice: the constraints are added inside a DO block that checks the catalogue
-- first, and the seed is an upsert. A migration that cannot be re-run is a
-- migration nobody dares re-run.
--
-- NOTHING HERE TOUCHES `measurement`'s EXISTING ROWS. The three columns slice 7
-- adds are nullable, which is what they have to be: a waist measurement has no
-- reference interval and a default of zero would be a claim about a laboratory
-- that never printed one.

-- ---------------------------------------------------------------------------
-- 1. The analyte catalogue's own rules.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- A band that is not a band cannot be caught by a type. `low < high` is the
  -- whole plausibility check every stored value passes through, and an analyte
  -- seeded backwards would accept nothing at all and look like a parser bug.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_analyte_band_is_a_band') THEN
    ALTER TABLE "lab_analyte"
      ADD CONSTRAINT "lab_analyte_band_is_a_band" CHECK ("low" < "high");
  END IF;

  -- The general reference range, when both bounds are present, has to sit the
  -- right way round too. Either bound may be absent: a sheet prints "below 3.0"
  -- for LDL and inventing a lower bound of zero would be this app writing a
  -- number the laboratory did not.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_analyte_reference_is_ordered') THEN
    ALTER TABLE "lab_analyte"
      ADD CONSTRAINT "lab_analyte_reference_is_ordered"
      CHECK ("reference_low" IS NULL OR "reference_high" IS NULL OR "reference_low" <= "reference_high");
  END IF;

  -- R2 requires every explanation to cite a public source, and the explanation
  -- is rendered from this column. An analyte with no citation would render a
  -- sentence with a hole in it, so the database refuses the row instead.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_analyte_cites_a_source') THEN
    ALTER TABLE "lab_analyte"
      ADD CONSTRAINT "lab_analyte_cites_a_source" CHECK ("source_url" LIKE 'http%://%');
  END IF;

  -- The printed-unit table is a list of objects and the conversion arithmetic
  -- reads it without checking. An empty list would mean an analyte no value can
  -- ever be stored against.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_analyte_has_a_printed_unit') THEN
    ALTER TABLE "lab_analyte"
      ADD CONSTRAINT "lab_analyte_has_a_printed_unit"
      CHECK (jsonb_typeof("printed") = 'array' AND jsonb_array_length("printed") > 0);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. The review holding's own rules.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_document_mode_is_named') THEN
    ALTER TABLE "lab_document"
      ADD CONSTRAINT "lab_document_mode_is_named" CHECK ("mode" IN ('text','ocr','manual'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_document_state_is_named') THEN
    ALTER TABLE "lab_document"
      ADD CONSTRAINT "lab_document_state_is_named" CHECK ("state" IN ('review','validated','abandoned'));
  END IF;

  -- F63. Retention is a decision, not a default, so the column is null until the
  -- question has been asked and holds one of exactly two answers afterwards.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_document_retention_is_named') THEN
    ALTER TABLE "lab_document"
      ADD CONSTRAINT "lab_document_retention_is_named"
      CHECK ("retention" IS NULL OR "retention" IN ('kept','deleted'));
  END IF;

  -- A deleted file has no path and is marked removed. The two facts are stored
  -- separately because a manually typed panel never had a file at all, so a
  -- null path alone cannot tell "never had one" from "had one and it is gone".
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_document_deleted_has_no_path') THEN
    ALTER TABLE "lab_document"
      ADD CONSTRAINT "lab_document_deleted_has_no_path"
      CHECK ("retention" IS DISTINCT FROM 'deleted' OR ("stored_path" IS NULL AND "file_removed"));
  END IF;

  -- A count of refused lines, never a value and never a label. F60 asks for a
  -- query across every table finding no blood-pressure row, and this is the
  -- column such a row would have lived in.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_document_refusals_are_a_count') THEN
    ALTER TABLE "lab_document"
      ADD CONSTRAINT "lab_document_refusals_are_a_count" CHECK ("refusals" >= 0);
  END IF;

  -- The holding is an ordered list of candidate rows and every reader indexes
  -- it as one.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_document_extraction_is_a_list') THEN
    ALTER TABLE "lab_document"
      ADD CONSTRAINT "lab_document_extraction_is_a_list" CHECK (jsonb_typeof("extraction") = 'array');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. The reference interval on `measurement`, checked the same way the value is.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'measurement_reference_is_ordered') THEN
    ALTER TABLE "measurement"
      ADD CONSTRAINT "measurement_reference_is_ordered"
      CHECK ("reference_low" IS NULL OR "reference_high" IS NULL OR "reference_low" <= "reference_high");
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. Blood pressure, refused by the database and not only by the parser.
--
-- The parser drops a blood-pressure line before any row is built, so nothing in
-- the application can write one. This is the second lock, and it is here because
-- F60 asks for a query across EVERY table and because the parser is code that
-- somebody will edit. No analyte may be seeded or added under a name that means
-- blood pressure, and no measurement may be stored under one.
--
-- Matched on the key rather than on the label, because the key is what a writer
-- controls and a label is the owner's own word. The names are the ones a French
-- or English sheet prints.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION refuse_blood_pressure() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  candidate text;
BEGIN
  -- The branch comes FIRST. This function is one body behind two triggers on
  -- two tables that do not share a column, and PL/pgSQL resolves a record field
  -- when it executes the assignment, not when it plans it. Assigning
  -- NEW.metric unconditionally therefore raised 'record "new" has no field
  -- "metric"' the moment the lab_analyte trigger fired, which is every seeded
  -- analyte, which is every boot. Touch only the column the firing table has.
  IF TG_TABLE_NAME = 'lab_analyte' THEN
    candidate := lower(coalesce(NEW.key, ''));
  ELSE
    candidate := lower(coalesce(NEW.metric, ''));
  END IF;
  IF candidate ~ '(blood_?pressure|tension_?arterielle|pression_?arterielle|systolic|diastolic|systolique|diastolique|mmhg)' THEN
    RAISE EXCEPTION 'blood pressure is refused at extraction and has no field in this database'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS measurement_refuses_blood_pressure ON "measurement";
CREATE TRIGGER measurement_refuses_blood_pressure
  BEFORE INSERT ON "measurement"
  FOR EACH ROW EXECUTE FUNCTION refuse_blood_pressure();

DROP TRIGGER IF EXISTS lab_analyte_refuses_blood_pressure ON "lab_analyte";
CREATE TRIGGER lab_analyte_refuses_blood_pressure
  BEFORE INSERT OR UPDATE ON "lab_analyte"
  FOR EACH ROW EXECUTE FUNCTION refuse_blood_pressure();

-- ---------------------------------------------------------------------------
-- 5. The thirteen F57 names, seeded.
--
-- Generated from `BUILT_IN_ANALYTES` in src/lib/labs.ts, which is where the
-- rules live and where the unit suite grades them. `built_in` is true here and
-- false on everything the owner adds through the interface, and that boolean is
-- what tells the closed-world string check on main which labels are copy this
-- repository wrote and which are the owner's own words.
--
-- The `label` column carries the English name as a fallback for anyone reading
-- this table at a psql prompt. IT IS NOT WHAT THE SCREENS RENDER: `analyteLabel`
-- in src/lib/lab-display.ts reads `strings.metrics[key]` for a built-in analyte,
-- because the name of one of the thirteen is copy and copy has a catalogue key.
-- tests/unit/labs.test.ts fails if any of the thirteen is missing that key, so
-- the fallback below is unreachable rather than merely unlikely.
--
-- Reference ranges are general adult ranges from the cited public source. They
-- are context and never a verdict: nothing in this product reads a stored value
-- against either bound, and every explanation says that the interval printed on
-- the owner's own sheet is the one that belongs with his number.
-- ---------------------------------------------------------------------------

INSERT INTO "lab_analyte"
  ("key", "label", "unit", "printed", "low", "high", "reference_low", "reference_high", "source_url", "aliases", "position", "built_in")
VALUES
  ('fasting_glucose', 'Fasting glucose', 'mmol/L', '[{"unit":"mmol/L","factor":1},{"unit":"g/L","factor":5.551},{"unit":"mg/dL","factor":0.05551}]'::jsonb, 1, 40, 3.9, 5.5, 'https://medlineplus.gov/lab-tests/', '{"glycemie a jeun","glycemie","glucose a jeun","glucose","fasting glucose"}', 1, true),
  ('hba1c', 'HbA1c', '%', '[{"unit":"%","factor":1}]'::jsonb, 2, 20, 4, 5.6, 'https://medlineplus.gov/lab-tests/', '{"hemoglobine glyquee hba1c","hemoglobine glyquee","hemoglobine a1c","hba1c","a1c"}', 2, true),
  ('total_cholesterol', 'Total cholesterol', 'mmol/L', '[{"unit":"mmol/L","factor":1},{"unit":"g/L","factor":2.586},{"unit":"mg/dL","factor":0.02586}]'::jsonb, 0.5, 20, NULL, 5, 'https://medlineplus.gov/lab-tests/', '{"cholesterol total","cholesterol totaux","total cholesterol","chol total"}', 3, true),
  ('hdl_cholesterol', 'HDL cholesterol', 'mmol/L', '[{"unit":"mmol/L","factor":1},{"unit":"g/L","factor":2.586},{"unit":"mg/dL","factor":0.02586}]'::jsonb, 0.1, 6, 1, NULL, 'https://medlineplus.gov/lab-tests/', '{"cholesterol hdl","hdl cholesterol","hdl"}', 4, true),
  ('ldl_cholesterol', 'LDL cholesterol', 'mmol/L', '[{"unit":"mmol/L","factor":1},{"unit":"g/L","factor":2.586},{"unit":"mg/dL","factor":0.02586}]'::jsonb, 0, 30, NULL, 3, 'https://medlineplus.gov/lab-tests/', '{"cholesterol ldl calcule","cholesterol ldl","ldl cholesterol","ldl"}', 5, true),
  ('non_hdl_cholesterol', 'Non-HDL cholesterol', 'mmol/L', '[{"unit":"mmol/L","factor":1},{"unit":"g/L","factor":2.586},{"unit":"mg/dL","factor":0.02586}]'::jsonb, 0, 20, NULL, 3.8, 'https://medlineplus.gov/lab-tests/', '{"cholesterol non hdl","non hdl cholesterol","non hdl"}', 6, true),
  ('triglycerides', 'Triglycerides', 'mmol/L', '[{"unit":"mmol/L","factor":1},{"unit":"g/L","factor":1.129},{"unit":"mg/dL","factor":0.01129}]'::jsonb, 0.1, 40, NULL, 1.7, 'https://medlineplus.gov/lab-tests/', '{"triglycerides","triglyceride"}', 7, true),
  ('alt', 'ALT', 'U/L', '[{"unit":"U/L","factor":1},{"unit":"IU/L","factor":1},{"unit":"UI/L","factor":1},{"unit":"µkat/L","factor":60}]'::jsonb, 1, 5000, 10, 40, 'https://medlineplus.gov/lab-tests/', '{"transaminases alat tgp","alat tgp","alat","alt sgpt","sgpt","alt","tgp"}', 8, true),
  ('ast', 'AST', 'U/L', '[{"unit":"U/L","factor":1},{"unit":"IU/L","factor":1},{"unit":"UI/L","factor":1},{"unit":"µkat/L","factor":60}]'::jsonb, 1, 5000, 10, 40, 'https://medlineplus.gov/lab-tests/', '{"transaminases asat tgo","asat tgo","asat","ast sgot","sgot","ast","tgo"}', 9, true),
  ('ggt', 'GGT', 'U/L', '[{"unit":"U/L","factor":1},{"unit":"IU/L","factor":1},{"unit":"UI/L","factor":1},{"unit":"µkat/L","factor":60}]'::jsonb, 1, 5000, 12, 64, 'https://medlineplus.gov/lab-tests/', '{"gamma glutamyl transferase","gamma gt","g g t","ggt"}', 10, true),
  ('creatinine', 'Creatinine', 'µmol/L', '[{"unit":"µmol/L","factor":1},{"unit":"mg/L","factor":8.84},{"unit":"mg/dL","factor":88.4}]'::jsonb, 10, 2000, 62, 106, 'https://medlineplus.gov/lab-tests/', '{"creatininemie","creatinine serique","creatinine"}', 11, true),
  ('crp', 'C-reactive protein', 'mg/L', '[{"unit":"mg/L","factor":1},{"unit":"mg/dL","factor":10}]'::jsonb, 0, 500, NULL, 5, 'https://medlineplus.gov/lab-tests/', '{"proteine c reactive crp","proteine c reactive","c reactive protein","crp"}', 12, true),
  ('ferritin', 'Ferritin', 'µg/L', '[{"unit":"µg/L","factor":1},{"unit":"ng/mL","factor":1},{"unit":"µg/dL","factor":10}]'::jsonb, 1, 20000, 30, 400, 'https://medlineplus.gov/lab-tests/', '{"ferritinemie","ferritine","ferritin"}', 13, true)
ON CONFLICT ("key") DO UPDATE SET
  "label" = EXCLUDED."label",
  "unit" = EXCLUDED."unit",
  "printed" = EXCLUDED."printed",
  "low" = EXCLUDED."low",
  "high" = EXCLUDED."high",
  "reference_low" = EXCLUDED."reference_low",
  "reference_high" = EXCLUDED."reference_high",
  "source_url" = EXCLUDED."source_url",
  "aliases" = EXCLUDED."aliases",
  "position" = EXCLUDED."position",
  "built_in" = true;
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Slice 09-nutrition, appended on merge. Written in its own worktree, numbered here.
-- ---------------------------------------------------------------------------
-- Slice 9, nutrition. The parts drizzle cannot express, in order.
--
-- Everything here is either a rule the database has to hold because a handler
-- can forget it, or an index drizzle has no expression form for. It is written
-- to be applied after the generated migration that creates the tables in
-- src/db/schema.ts, and every statement is idempotent so a re-run is a no-op.
--
-- Nothing in this file drops anything, and nothing in it touches a table
-- another slice owns.

-- ---------------------------------------------------------------------------
-- 1. The four dietary rules, held apart by the database.
--
-- F83 says allergy, intolerance, exclusion and preference are four distinct
-- stored rules and that no query path resolves one as the other. The code keeps
-- them apart by dispatching to four separate functions. This keeps a fifth kind
-- and a mistyped kind out of the column in the first place, so a handler that
-- forgets cannot write a rule nothing knows how to apply.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dietary_rule_kind_is_one_of_four') then
    alter table dietary_rule add constraint dietary_rule_kind_is_one_of_four
      check (kind in ('allergy', 'intolerance', 'exclusion', 'preference'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The nutrient columns are nullable and that is deliberate. What they may
-- not be is negative, and energy may not be a figure no food reaches.
--
-- 900 kcal per 100 g is pure fat plus rounding, and the highest row Anses
-- publishes is 900 for oil. Anything over it arrived from a unit confusion,
-- which the research names as the endemic failure of crowd-sourced food data
-- and which slice 10's barcode lookup will meet head on.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'food_nutrients_are_not_negative') then
    alter table food add constraint food_nutrients_are_not_negative
      check (
        (kcal_100g is null or kcal_100g >= 0) and
        (protein_g is null or protein_g >= 0) and
        (carb_g is null or carb_g >= 0) and
        (fat_g is null or fat_g >= 0) and
        (fibre_g is null or fibre_g >= 0)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'food_energy_is_plausible') then
    alter table food add constraint food_energy_is_plausible
      check (kcal_100g is null or kcal_100g <= 900);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'food_energy_source_is_known') then
    alter table food add constraint food_energy_source_is_known
      check (energy_source is null or energy_source in ('published', 'computed_atwater'));
  end if;
  -- An energy value with no source marker is a number that cannot say where it
  -- came from, which is the one thing this product does not ship.
  if not exists (select 1 from pg_constraint where conname = 'food_energy_carries_its_source') then
    alter table food add constraint food_energy_carries_its_source
      check ((kcal_100g is null) = (energy_source is null));
  end if;
end $$;

-- Name search, lower cased, because the alias layer resolves everyday English
-- to an Anses row by name and drizzle has no expression-index form.
create index if not exists food_name_lower on food (lower(name_fr));

-- ---------------------------------------------------------------------------
-- 3. A recipe carries its name in exactly one place.
--
-- `name_key` for the recipes Vernier ships, because a sentence this product
-- authored is copy with a key wherever it was written, a database column
-- included. `name` for one the owner imports in slice 10, which is his words.
-- Both set, or neither, is a recipe whose name has two answers.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recipe_has_exactly_one_name') then
    alter table recipe add constraint recipe_has_exactly_one_name
      check ((name_key is null) <> (name is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recipe_slot_is_known') then
    alter table recipe add constraint recipe_slot_is_known
      check (slot in ('breakfast', 'lunch', 'dinner', 'snack'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recipe_servings_are_positive') then
    alter table recipe add constraint recipe_servings_are_positive
      check (servings >= 1 and cook_minutes >= 0);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. The snapshot is append only, enforced by Postgres and not by a handler.
--
-- F87: a changed ingredient-source hash raises a question rather than replacing
-- the stored snapshot. `measurement` next door refuses UPDATE and DELETE
-- outright for the same reason and it is the precedent this follows, with one
-- deliberate difference: superseding a snapshot IS an update, of one column, so
-- the trigger allows `superseded_at` to be set once and refuses every other
-- change. A recompute writes a new version. The old figures stay readable, the
-- old row keeps its hash, and there is no code path anywhere, now or later,
-- that can quietly serve last month's macros as this month's.
create or replace function recipe_nutrition_is_append_only() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'recipe_nutrition is append only: version % of recipe % cannot be deleted',
      old.version, old.recipe_id
      using errcode = 'restrict_violation';
  end if;
  if new.recipe_id is distinct from old.recipe_id
     or new.variant is distinct from old.variant
     or new.version is distinct from old.version
     or new.per_serving_kcal is distinct from old.per_serving_kcal
     or new.per_serving_protein_g is distinct from old.per_serving_protein_g
     or new.per_serving_carb_g is distinct from old.per_serving_carb_g
     or new.per_serving_fat_g is distinct from old.per_serving_fat_g
     or new.per_serving_fibre_g is distinct from old.per_serving_fibre_g
     or new.provenance is distinct from old.provenance
     or new.coverage_pct is distinct from old.coverage_pct
     or new.fibre_coverage_pct is distinct from old.fibre_coverage_pct
     or new.source_food_ids_hash is distinct from old.source_food_ids_hash
     or new.computed_at is distinct from old.computed_at then
    raise exception 'recipe_nutrition is append only: recompute recipe % instead of rewriting version %',
      old.recipe_id, old.version
      using errcode = 'restrict_violation';
  end if;
  if old.superseded_at is not null and new.superseded_at is distinct from old.superseded_at then
    raise exception 'version % of recipe % was already superseded at %',
      old.version, old.recipe_id, old.superseded_at
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists recipe_nutrition_no_overwrite on recipe_nutrition;
create trigger recipe_nutrition_no_overwrite
  before update or delete on recipe_nutrition
  for each row execute function recipe_nutrition_is_append_only();

-- Exactly one live snapshot per recipe and variant. Drizzle has no partial
-- unique index, and the variant is part of the key: the base figures and the
-- lactose-free figures are two current snapshots of one recipe, not two
-- versions of one snapshot.
create unique index if not exists recipe_nutrition_one_current
  on recipe_nutrition (recipe_id, variant) where superseded_at is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recipe_nutrition_variant_is_known') then
    alter table recipe_nutrition add constraint recipe_nutrition_variant_is_known
      check (variant in ('base', 'lactose_free'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recipe_nutrition_provenance_is_known') then
    alter table recipe_nutrition add constraint recipe_nutrition_provenance_is_known
      check (provenance in (
        'computed_ciqual', 'computed_mixed', 'computed_partial',
        'user_entered', 'ai_estimate', 'label_scan'
      ));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recipe_nutrition_coverage_is_a_share') then
    alter table recipe_nutrition add constraint recipe_nutrition_coverage_is_a_share
      check (coverage_pct >= 0 and coverage_pct <= 100
             and fibre_coverage_pct >= 0 and fibre_coverage_pct <= 100);
  end if;
end $$;

-- One open question per recipe, so a hash that changes twice does not stack up
-- two identical questions the owner has to answer twice.
create unique index if not exists recipe_question_one_open
  on recipe_question (recipe_id) where state = 'open';

-- ---------------------------------------------------------------------------
-- 5. The target, and the floor that only an explicit confirmation opens.
--
-- F81's middle tier lives here as well as in the route. A target under the
-- floor for this owner's sex with no confirmation timestamp beside it is not a
-- row the database will hold, so there is no handler, now or later, that can
-- write one by forgetting to ask.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nutrition_target_sex_is_known') then
    alter table nutrition_target add constraint nutrition_target_sex_is_known
      check (sex in ('male', 'female'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nutrition_target_pal_is_published') then
    alter table nutrition_target add constraint nutrition_target_pal_is_published
      check (pal >= 1.40 and pal <= 1.90);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nutrition_target_hard_floor_is_confirmed') then
    alter table nutrition_target add constraint nutrition_target_hard_floor_is_confirmed
      check (
        kcal_target >= (case when sex = 'male' then 1500 else 1200 end)
        or hard_floor_confirmed_at is not null
      );
  end if;
  -- One percent of body weight a week, or one kilogram, whichever is stricter.
  -- F81 refuses above it and offers the nearest compliant rate instead, and the
  -- refusal is a plan that is never generated rather than a warning on one that
  -- was, so the row cannot exist either.
  if not exists (select 1 from pg_constraint where conname = 'nutrition_target_rate_is_compliant') then
    alter table nutrition_target add constraint nutrition_target_rate_is_compliant
      check (rate_kg_per_week <= least(1.0, weight_kg * 0.01) + 0.0001);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. The week and the list.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'planned_meal_state_is_known') then
    alter table planned_meal add constraint planned_meal_state_is_known
      check (state in ('proposed', 'accepted', 'edited', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'planned_meal_day_is_in_the_week') then
    alter table planned_meal add constraint planned_meal_day_is_in_the_week
      check (day_index >= 0 and day_index <= 6);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shopping_item_unit_is_known') then
    alter table shopping_item add constraint shopping_item_unit_is_known
      check (unit in ('g', 'kg', 'count'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shopping_item_deduction_is_known') then
    alter table shopping_item add constraint shopping_item_deduction_is_known
      check (deduction in ('none', 'box', 'stock'));
  end if;
  -- F89. A deducted line stays on the list with its original quantity, and a
  -- deducted line is not something you can tick off: it is already covered.
  if not exists (select 1 from pg_constraint where conname = 'shopping_item_deducted_is_not_checked') then
    alter table shopping_item add constraint shopping_item_deducted_is_not_checked
      check (deduction = 'none' or checked = false);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shopping_item_quantities_are_positive') then
    alter table shopping_item add constraint shopping_item_quantities_are_positive
      check (quantity > 0 and original_quantity > 0 and needed_quantity > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_item_unit_is_known') then
    alter table stock_item add constraint stock_item_unit_is_known
      check (unit in ('g', 'kg', 'count') and quantity > 0);
  end if;
end $$;

-- A count needs the noun it is counted in, because "12" on a shopping list is
-- not an instruction. The noun is a catalogue key and never the word itself.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shopping_item_count_names_its_noun') then
    alter table shopping_item add constraint shopping_item_count_names_its_noun
      check ((unit = 'count') = (count_noun is not null));
  end if;
end $$;
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Slice 08-train, appended on merge. Written in its own worktree, numbered here.
-- ---------------------------------------------------------------------------
-- Slice 8, Train. The DDL drizzle cannot express, in order, idempotent.
--
-- The tables themselves are in src/db/schema.ts and are generated on merge.
-- What is here is the part a schema builder has no syntax for: check
-- constraints, and one partial unique index. Every statement is guarded so a
-- second run is a no-op, because a migration that fails on re-application is a
-- migration nobody dares run.
--
-- THE FIRST CONSTRAINT IS THE ONE THAT MATTERS. F67 says a media record with a
-- null author is rejected at write. NOT NULL is half of that: it refuses NULL
-- and accepts the empty string, and an empty string is exactly what wger's API
-- returns for 87 of its 365 images, 84 of them under CC BY-SA, which cannot be
-- complied with because there is nobody to attribute. The other half is here.
-- Between them, the infringing aggregator sets cannot enter this database by
-- any path: not through the importer, not through the editorial screen, not
-- through a psql prompt at two in the morning.

-- 1. A media row names its author, or it does not exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movement_media_author_present') THEN
    ALTER TABLE movement_media
      ADD CONSTRAINT movement_media_author_present CHECK (btrim(author) <> '');
  END IF;
END $$;

-- 2. Two embedding modes and no third. `bundled` is a file this repository
--    serves; `youtube_nocookie` is an iframe the browser fetches for itself.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movement_media_mode') THEN
    ALTER TABLE movement_media
      ADD CONSTRAINT movement_media_mode
      CHECK (embedding_mode IN ('bundled', 'youtube_nocookie'));
  END IF;
END $$;

-- 3. AN EMBED HAS NO LOCAL COPY, AT THE DATABASE. Developer Policies III.E
--    forbids downloading, caching or storing copies of YouTube audiovisual
--    content, and forbids making it available for offline playback. A row that
--    is an embed and also names a file on this disk is that violation written
--    down, so the database refuses to hold one. A bundled row must have a path,
--    for the symmetric reason: a bundled record with nothing behind it is a
--    provenance record for a file that does not exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movement_media_local_path') THEN
    ALTER TABLE movement_media
      ADD CONSTRAINT movement_media_local_path
      CHECK (
        (embedding_mode = 'bundled' AND btrim(local_path) <> '')
        OR (embedding_mode = 'youtube_nocookie' AND btrim(local_path) = '')
      );
  END IF;
END $$;

-- 4. A proposal is one of four states. `edited` is still a proposal: it has been
--    moved but not accepted, and nothing is written to the plan until it is.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_proposal_state') THEN
    ALTER TABLE session_proposal
      ADD CONSTRAINT session_proposal_state
      CHECK (state IN ('proposed', 'edited', 'accepted', 'rejected'));
  END IF;
END $$;

-- 5. An accepted proposal points at the plan row it created, and a proposal in
--    any other state points at nothing. This is what stops a rejected session
--    leaving a planned session behind it, which would put a session the owner
--    said no to into the adherence denominator.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_proposal_accepted_has_plan') THEN
    ALTER TABLE session_proposal
      ADD CONSTRAINT session_proposal_accepted_has_plan
      CHECK (
        (state = 'accepted' AND planned_session_id IS NOT NULL)
        OR (state <> 'accepted' AND planned_session_id IS NULL)
      );
  END IF;
END $$;

-- 6. A set that was logged was performed: a count is never negative, and a
--    target of zero is a target nobody set.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'set_log_counts') THEN
    ALTER TABLE set_log
      ADD CONSTRAINT set_log_counts CHECK (achieved >= 0 AND target > 0 AND set_index >= 0);
  END IF;
END $$;

-- 7. Reps in reserve is 1 to 10 on one question. Zourdos 2016's scale, described
--    in the app's own words; the table itself is copyright NSCA and Wolters
--    Kluwer and is not reproduced.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'set_log_rir_band') THEN
    ALTER TABLE set_log
      ADD CONSTRAINT set_log_rir_band CHECK (rir IS NULL OR (rir >= 1 AND rir <= 10));
  END IF;
END $$;

-- 8. Effort is 0 to 10 on the CDC public-domain scale, and pain is 0 to 10 on
--    the visual analogue scale Silbernagel 2007 used. Both are bands with ends,
--    and a value outside one is a unit mistake rather than a strong session.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_report_bands') THEN
    ALTER TABLE session_report
      ADD CONSTRAINT session_report_bands
      CHECK (
        (effort IS NULL OR (effort >= 0 AND effort <= 10))
        AND (pain_score IS NULL OR (pain_score >= 0 AND pain_score <= 10))
      );
  END IF;
END $$;

-- 9. A progression is proposed, then confirmed or declined. There is no state
--    in which it applied itself.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'progression_proposal_state') THEN
    ALTER TABLE progression_proposal
      ADD CONSTRAINT progression_proposal_state
      CHECK (state IN ('proposed', 'confirmed', 'declined'));
  END IF;
END $$;

-- 10. One open proposal per movement at a time. A partial unique index, because
--     the constraint is on the rows in one state and not on the table: a
--     movement may have a hundred confirmed advancements behind it and exactly
--     one question in front of the owner.
CREATE UNIQUE INDEX IF NOT EXISTS progression_proposal_one_open
  ON progression_proposal (movement_id)
  WHERE state = 'proposed';

-- 11. The screening gate's three outcomes, and there is no fourth. No score, no
--     band, no percentage: ACSM 2015 removed risk-factor profiling deliberately
--     because it "may be overly conservative and unnecessarily refer adults for
--     medical clearance", and a number invented on top of a referral decision
--     would put it straight back.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'readiness_check_outcome') THEN
    ALTER TABLE readiness_check
      ADD CONSTRAINT readiness_check_outcome
      CHECK (outcome IN ('proceed', 'proceedGradually', 'clearanceFirst'));
  END IF;
END $$;
