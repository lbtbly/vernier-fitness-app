CREATE TABLE "idempotency_key" (
	"key" text PRIMARY KEY NOT NULL,
	"route" text NOT NULL,
	"status" integer NOT NULL,
	"body" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replays" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_question" (
	"id" text PRIMARY KEY NOT NULL,
	"metric" text NOT NULL,
	"measurement_id" text NOT NULL,
	"stored_raw_value" text NOT NULL,
	"stored_unit" text NOT NULL,
	"stored_source" text NOT NULL,
	"stored_measured_at" timestamp with time zone NOT NULL,
	"incoming_raw_value" text NOT NULL,
	"incoming_unit" text NOT NULL,
	"incoming_source" text NOT NULL,
	"incoming_measured_at" timestamp with time zone NOT NULL,
	"incoming_import_version" text NOT NULL,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"answered_at" timestamp with time zone,
	"answer" text
);
--> statement-breakpoint
CREATE TABLE "measurement" (
	"id" text PRIMARY KEY NOT NULL,
	"metric" text NOT NULL,
	"raw_value" text NOT NULL,
	"raw_unit" text NOT NULL,
	"value" double precision,
	"unit" text NOT NULL,
	"conversion_factor" double precision,
	"time_zone" text NOT NULL,
	"source" text NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confidence" text NOT NULL,
	"import_version" text NOT NULL,
	"dedup_decision" text NOT NULL,
	"dedup_reason" text NOT NULL,
	"source_record_id" text NOT NULL,
	"root_id" text NOT NULL,
	"corrects_id" text,
	"correction_index" integer DEFAULT 0 NOT NULL,
	"correction_reason" text
);
--> statement-breakpoint
CREATE TABLE "source_record" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"kind" text NOT NULL,
	"reference" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"import_version" text NOT NULL,
	"detail" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "write_request" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"route" text NOT NULL,
	"outcome" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_question" ADD CONSTRAINT "import_question_measurement_id_measurement_id_fk" FOREIGN KEY ("measurement_id") REFERENCES "public"."measurement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement" ADD CONSTRAINT "measurement_source_record_id_source_record_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_record"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_question_state" ON "import_question" USING btree ("state","raised_at");--> statement-breakpoint
CREATE INDEX "measurement_metric_measured_at" ON "measurement" USING btree ("metric","measured_at");--> statement-breakpoint
CREATE INDEX "measurement_root" ON "measurement" USING btree ("root_id","correction_index");--> statement-breakpoint
CREATE INDEX "measurement_source" ON "measurement" USING btree ("source");--> statement-breakpoint
CREATE INDEX "source_record_occurred_at" ON "source_record" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "write_request_key" ON "write_request" USING btree ("key");--> statement-breakpoint
ALTER TABLE "measurement" ADD CONSTRAINT "measurement_root_id_measurement_id_fk" FOREIGN KEY ("root_id") REFERENCES "public"."measurement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement" ADD CONSTRAINT "measurement_corrects_id_measurement_id_fk" FOREIGN KEY ("corrects_id") REFERENCES "public"."measurement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement" ADD CONSTRAINT "measurement_source_is_one_of_six" CHECK ("source" IN ('withings','apple_health_shortcut','manual','lab_pdf','derived','demo'));--> statement-breakpoint
ALTER TABLE "source_record" ADD CONSTRAINT "source_record_source_is_one_of_six" CHECK ("source" IN ('withings','apple_health_shortcut','manual','lab_pdf','derived','demo'));--> statement-breakpoint
ALTER TABLE "measurement" ADD CONSTRAINT "measurement_confidence_is_named" CHECK ("confidence" IN ('measured_device','measured_manual','reported','printed','estimated','derived','demo'));--> statement-breakpoint
ALTER TABLE "measurement" ADD CONSTRAINT "measurement_dedup_decision_is_named" CHECK ("dedup_decision" IN ('unique','kept_over_duplicate','correction'));--> statement-breakpoint
ALTER TABLE "measurement" ADD CONSTRAINT "measurement_number_or_text" CHECK ("value" IS NOT NULL OR "unit" = 'text');--> statement-breakpoint
ALTER TABLE "measurement" ADD CONSTRAINT "measurement_correction_chain" CHECK (("correction_index" = 0 AND "corrects_id" IS NULL AND "root_id" = "id") OR ("correction_index" > 0 AND "corrects_id" IS NOT NULL AND "root_id" <> "id"));--> statement-breakpoint
ALTER TABLE "import_question" ADD CONSTRAINT "import_question_state_is_named" CHECK ("state" IN ('open','answered'));--> statement-breakpoint
ALTER TABLE "write_request" ADD CONSTRAINT "write_request_outcome_is_named" CHECK ("outcome" IN ('applied','replayed','deduplicated','held_for_question','refused'));--> statement-breakpoint
CREATE FUNCTION measurement_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'measurement is append only: % is refused. Correct a value by inserting a new row that names it in corrects_id, and re-import by deciding a dedup outcome or raising an import_question.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER measurement_append_only BEFORE UPDATE OR DELETE ON "measurement" FOR EACH ROW EXECUTE FUNCTION measurement_append_only();
