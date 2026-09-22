CREATE TABLE "talentsourcer_candidate_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"external_candidate_id" text NOT NULL,
	"candidate_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "talentsourcer_connections" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"organization_name" text NOT NULL,
	"token" jsonb,
	"connected_by_id" text,
	"revision" uuid DEFAULT gen_random_uuid() NOT NULL,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "talentsourcer_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"connection_revision" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"source" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "talentsourcer_import_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"external_candidate_id" text NOT NULL,
	"candidate_id" uuid,
	"application_id" uuid,
	"status" text DEFAULT 'ready' NOT NULL,
	"reason" text,
	"profile" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidates" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "talentsourcer_candidate_links" ADD CONSTRAINT "talentsourcer_candidate_links_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talentsourcer_candidate_links" ADD CONSTRAINT "talentsourcer_candidate_links_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talentsourcer_connections" ADD CONSTRAINT "talentsourcer_connections_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talentsourcer_connections" ADD CONSTRAINT "talentsourcer_connections_connected_by_id_user_id_fk" FOREIGN KEY ("connected_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talentsourcer_import_batches" ADD CONSTRAINT "talentsourcer_import_batches_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talentsourcer_import_batches" ADD CONSTRAINT "talentsourcer_import_batches_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talentsourcer_import_batches" ADD CONSTRAINT "talentsourcer_import_batches_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talentsourcer_import_batches" ADD CONSTRAINT "talentsourcer_import_batches_stage_id_job_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."job_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talentsourcer_import_items" ADD CONSTRAINT "talentsourcer_import_items_batch_id_talentsourcer_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."talentsourcer_import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talentsourcer_import_items" ADD CONSTRAINT "talentsourcer_import_items_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talentsourcer_import_items" ADD CONSTRAINT "talentsourcer_import_items_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "talentsourcer_candidate_identity_idx" ON "talentsourcer_candidate_links" USING btree ("workspace_id","organization_id","external_candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "talentsourcer_batch_candidate_idx" ON "talentsourcer_import_items" USING btree ("batch_id","external_candidate_id");