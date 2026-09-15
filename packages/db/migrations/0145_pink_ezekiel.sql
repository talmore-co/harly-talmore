CREATE TABLE "interview_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"interview_id" uuid NOT NULL,
	"provider" text DEFAULT 'fathom' NOT NULL,
	"recording_id" text NOT NULL,
	"recording_url" text NOT NULL,
	"summary" text,
	"transcript" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_fathom_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"recorder_email" text,
	"secret" jsonb,
	"last_imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview_recordings" ADD CONSTRAINT "interview_recordings_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_recordings" ADD CONSTRAINT "interview_recordings_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_fathom_connections" ADD CONSTRAINT "personal_fathom_connections_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_fathom_connections" ADD CONSTRAINT "personal_fathom_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "interview_recordings_provider_id_idx" ON "interview_recordings" USING btree ("workspace_id","provider","recording_id");--> statement-breakpoint
CREATE INDEX "interview_recordings_interview_idx" ON "interview_recordings" USING btree ("interview_id");--> statement-breakpoint
CREATE UNIQUE INDEX "personal_fathom_workspace_user_idx" ON "personal_fathom_connections" USING btree ("workspace_id","user_id");