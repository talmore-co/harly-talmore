CREATE TABLE "recruitcrm_candidate_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_slug" text NOT NULL,
	"candidate_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruitcrm_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"account_anchor" text NOT NULL,
	"token" jsonb,
	"revision" uuid DEFAULT gen_random_uuid() NOT NULL,
	"checked_at" timestamp with time zone,
	"rate_window_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rate_count" integer DEFAULT 0 NOT NULL,
	"retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruitcrm_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"connection_id" uuid NOT NULL,
	"connection_revision" uuid NOT NULL,
	"job_id" uuid,
	"stage_id" uuid,
	"include_notes" boolean DEFAULT false NOT NULL,
	"include_cv" boolean DEFAULT true NOT NULL,
	"source" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruitcrm_import_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"external_slug" text NOT NULL,
	"candidate_id" uuid,
	"application_id" uuid,
	"status" text DEFAULT 'ready' NOT NULL,
	"step" text DEFAULT 'profile' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reason" text,
	"retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_id" uuid,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "email_opted_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "contact_off_limits" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "contact_off_limits_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "contact_restriction_reason" text;--> statement-breakpoint
ALTER TABLE "recruitcrm_candidate_links" ADD CONSTRAINT "recruitcrm_candidate_links_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitcrm_candidate_links" ADD CONSTRAINT "recruitcrm_candidate_links_connection_id_recruitcrm_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."recruitcrm_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitcrm_candidate_links" ADD CONSTRAINT "recruitcrm_candidate_links_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitcrm_connections" ADD CONSTRAINT "recruitcrm_connections_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitcrm_import_batches" ADD CONSTRAINT "recruitcrm_import_batches_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitcrm_import_batches" ADD CONSTRAINT "recruitcrm_import_batches_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitcrm_import_batches" ADD CONSTRAINT "recruitcrm_import_batches_connection_id_recruitcrm_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."recruitcrm_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitcrm_import_batches" ADD CONSTRAINT "recruitcrm_import_batches_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitcrm_import_batches" ADD CONSTRAINT "recruitcrm_import_batches_stage_id_job_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."job_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitcrm_import_items" ADD CONSTRAINT "recruitcrm_import_items_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitcrm_import_items" ADD CONSTRAINT "recruitcrm_import_items_batch_id_recruitcrm_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."recruitcrm_import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitcrm_import_items" ADD CONSTRAINT "recruitcrm_import_items_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitcrm_import_items" ADD CONSTRAINT "recruitcrm_import_items_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recruitcrm_candidate_identity_idx" ON "recruitcrm_candidate_links" USING btree ("workspace_id","connection_id","external_slug");--> statement-breakpoint
CREATE INDEX "recruitcrm_links_candidate_idx" ON "recruitcrm_candidate_links" USING btree ("workspace_id","candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recruitcrm_workspace_account_idx" ON "recruitcrm_connections" USING btree ("workspace_id","account_anchor");--> statement-breakpoint
CREATE INDEX "recruitcrm_batches_workspace_idx" ON "recruitcrm_import_batches" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recruitcrm_batch_slug_idx" ON "recruitcrm_import_items" USING btree ("batch_id","external_slug");--> statement-breakpoint
CREATE INDEX "recruitcrm_items_due_idx" ON "recruitcrm_import_items" USING btree ("status","retry_at");--> statement-breakpoint
CREATE INDEX "recruitcrm_items_candidate_idx" ON "recruitcrm_import_items" USING btree ("workspace_id","candidate_id");