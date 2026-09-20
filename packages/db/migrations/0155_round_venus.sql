CREATE TABLE "application_merges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"source_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"inbound_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_merges_source_id_unique" UNIQUE("source_id"),
	CONSTRAINT "application_merges_inbound_token_unique" UNIQUE("inbound_token")
);
--> statement-breakpoint
CREATE TABLE "candidate_duplicate_dismissals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"candidate_id" uuid NOT NULL,
	"other_candidate_id" uuid NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_merges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"source_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"original_emails" jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_merges_source_id_unique" UNIQUE("source_id")
);
--> statement-breakpoint
ALTER TABLE "client_offers" DROP CONSTRAINT "client_offers_workspace_id_application_id_candidate_id_job_id_applications_workspace_id_id_candidate_id_job_id_fk";
--> statement-breakpoint
ALTER TABLE "interviews" DROP CONSTRAINT "interviews_application_context_fk";
--> statement-breakpoint
ALTER TABLE "offers" DROP CONSTRAINT "offers_application_context_fk";
--> statement-breakpoint
ALTER TABLE "application_merges" ADD CONSTRAINT "application_merges_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_merges" ADD CONSTRAINT "application_merges_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_duplicate_dismissals" ADD CONSTRAINT "candidate_duplicate_dismissals_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_duplicate_dismissals" ADD CONSTRAINT "candidate_duplicate_dismissals_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_duplicate_dismissals" ADD CONSTRAINT "candidate_duplicate_dismissals_other_candidate_id_candidates_id_fk" FOREIGN KEY ("other_candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_duplicate_dismissals" ADD CONSTRAINT "candidate_duplicate_dismissals_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_merges" ADD CONSTRAINT "candidate_merges_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_merges" ADD CONSTRAINT "candidate_merges_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_merges" ADD CONSTRAINT "candidate_merges_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_duplicate_dismissals_pair_idx" ON "candidate_duplicate_dismissals" USING btree ("workspace_id","candidate_id","other_candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_merges_target_idx" ON "candidate_merges" USING btree ("workspace_id","candidate_id");--> statement-breakpoint
ALTER TABLE "client_offers" ADD CONSTRAINT "client_offers_workspace_id_application_id_candidate_id_job_id_applications_workspace_id_id_candidate_id_job_id_fk" FOREIGN KEY ("workspace_id","application_id","candidate_id","job_id") REFERENCES "public"."applications"("workspace_id","id","candidate_id","job_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_context_fk" FOREIGN KEY ("workspace_id","application_id","candidate_id","job_id") REFERENCES "public"."applications"("workspace_id","id","candidate_id","job_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_application_context_fk" FOREIGN KEY ("workspace_id","application_id","candidate_id","job_id") REFERENCES "public"."applications"("workspace_id","id","candidate_id","job_id") ON DELETE cascade ON UPDATE cascade;