CREATE TABLE "personal_google_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"account_email" text NOT NULL,
	"calendar_id" text NOT NULL,
	"availability_calendar_ids" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"refresh_token_ciphertext" text,
	"refresh_token_iv" text,
	"refresh_token_tag" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "gcal_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "gcal_calendar_id" text;--> statement-breakpoint
ALTER TABLE "personal_google_connections" ADD CONSTRAINT "personal_google_connections_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_google_connections" ADD CONSTRAINT "personal_google_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "personal_google_connections_member_idx" ON "personal_google_connections" USING btree ("workspace_id","user_id");