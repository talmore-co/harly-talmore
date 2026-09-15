ALTER TABLE "personal_fathom_connections" ADD COLUMN "api_key" jsonb;--> statement-breakpoint
ALTER TABLE "personal_fathom_connections" ADD COLUMN "webhook_id" text;--> statement-breakpoint
ALTER TABLE "personal_fathom_connections" ADD COLUMN "setup_pending" boolean DEFAULT false NOT NULL;