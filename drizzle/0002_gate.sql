CREATE TABLE "auth_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"method" text NOT NULL,
	"outcome" text NOT NULL,
	"reason" text NOT NULL,
	"peer" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_credential" (
	"provider" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"scope" text NOT NULL,
	"secret_ciphertext" text,
	"secret_nonce" text,
	"secret_tag" text,
	"key_fingerprint" text,
	"last_successful_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"password_tag" text NOT NULL,
	"password_nonce" text NOT NULL,
	"password_algorithm" text NOT NULL,
	"password_memory" integer NOT NULL,
	"password_passes" integer NOT NULL,
	"password_parallelism" integer NOT NULL,
	"password_tag_length" integer NOT NULL,
	"password_updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"csrf_token" text NOT NULL,
	"method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webauthn_challenge" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge" text NOT NULL,
	"ceremony" text NOT NULL,
	"owner_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webauthn_credential" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" bigint NOT NULL,
	"transports" text[] DEFAULT '{}' NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"aaguid" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_owner_id_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webauthn_credential" ADD CONSTRAINT "webauthn_credential_owner_id_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_attempt_at" ON "auth_attempt" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "owner_singleton" ON "owner" USING btree ("singleton");