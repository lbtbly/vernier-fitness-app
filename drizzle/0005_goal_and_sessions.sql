CREATE TABLE "goal" (
	"id" text PRIMARY KEY NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	"metric" text NOT NULL,
	"unit" text NOT NULL,
	"start_value" double precision NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"target_value" double precision NOT NULL,
	"target_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planned_session" (
	"id" text PRIMARY KEY NOT NULL,
	"planned_for" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"title" text NOT NULL,
	"place" text NOT NULL,
	"cause" text NOT NULL,
	"state" text NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "goal_singleton" ON "goal" USING btree ("singleton");--> statement-breakpoint
CREATE INDEX "planned_session_planned_for" ON "planned_session" USING btree ("planned_for");