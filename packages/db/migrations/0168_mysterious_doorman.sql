ALTER TABLE "recruitcrm_import_batches" ADD COLUMN "import_all" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recruitcrm_import_batches" ADD COLUMN "discovery_status" text DEFAULT 'preview' NOT NULL;--> statement-breakpoint
ALTER TABLE "recruitcrm_import_batches" ADD COLUMN "next_page" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "recruitcrm_import_batches" ADD COLUMN "has_more" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recruitcrm_import_batches" ADD COLUMN "discovery_lease_id" uuid;--> statement-breakpoint
ALTER TABLE "recruitcrm_import_batches" ADD COLUMN "discovery_locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recruitcrm_import_batches" ADD COLUMN "discovery_retry_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "recruitcrm_import_batches" ADD COLUMN "discovery_error" text;--> statement-breakpoint
CREATE INDEX "recruitcrm_batches_discovery_idx" ON "recruitcrm_import_batches" USING btree ("discovery_status","discovery_retry_at");