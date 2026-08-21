CREATE TABLE "device_observation" (
	"signal" text PRIMARY KEY NOT NULL,
	"observed" boolean NOT NULL,
	"first_observed_at" timestamp with time zone,
	"last_reported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_origin" (
	"peer_address" text PRIMARY KEY NOT NULL,
	"via_tailscale" boolean NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
