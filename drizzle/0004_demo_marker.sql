ALTER TABLE "source_record" ADD COLUMN "seed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "source_record" SET "seed" = true WHERE "id" IN (SELECT "source_record_id" FROM "measurement" WHERE "source" = 'demo');--> statement-breakpoint
ALTER TABLE "source_record" ADD CONSTRAINT "source_record_id_seed" UNIQUE("id","seed");--> statement-breakpoint
ALTER TABLE "measurement" ADD COLUMN "seed" boolean GENERATED ALWAYS AS ("source" = 'demo') STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "measurement" ADD CONSTRAINT "measurement_seed_matches_source_record" FOREIGN KEY ("source_record_id","seed") REFERENCES "public"."source_record"("id","seed") ON DELETE no action ON UPDATE no action;
