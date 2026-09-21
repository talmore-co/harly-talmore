CREATE TABLE "automation_booking_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"application_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"outbox_id" uuid,
	"stage_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD CONSTRAINT "automation_booking_invitations_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD CONSTRAINT "automation_booking_invitations_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD CONSTRAINT "automation_booking_invitations_event_id_personal_cal_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."personal_cal_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD CONSTRAINT "automation_booking_invitations_workflow_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD CONSTRAINT "automation_booking_invitations_outbox_id_email_outbox_id_fk" FOREIGN KEY ("outbox_id") REFERENCES "public"."email_outbox"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD CONSTRAINT "automation_booking_invitations_stage_id_job_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."job_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_booking_application_event_idx" ON "automation_booking_invitations" USING btree ("workspace_id","application_id","event_id");