CREATE TABLE "changes" (
	"store_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"seq" bigserial NOT NULL,
	"device_id" uuid NOT NULL,
	"iv" text NOT NULL,
	"ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "changes_store_id_id_pk" PRIMARY KEY("store_id","id"),
	CONSTRAINT "changes_iv_len" CHECK (char_length("changes"."iv") = 16),
	CONSTRAINT "changes_ct_len" CHECK (char_length("changes"."ciphertext") between 24 and 16384)
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "devices_name_len" CHECK (char_length("devices"."name") between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code_lookup" text NOT NULL,
	"auth_verifier" text NOT NULL,
	"wrapped_key" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "changes" ADD CONSTRAINT "changes_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "changes_seq_uq" ON "changes" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "changes_store_seq_idx" ON "changes" USING btree ("store_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_token_hash_uq" ON "devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "devices_store_idx" ON "devices" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stores_code_lookup_uq" ON "stores" USING btree ("code_lookup");