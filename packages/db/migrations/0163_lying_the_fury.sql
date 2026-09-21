ALTER TABLE "automation_booking_invitations" ALTER COLUMN "workflow_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD COLUMN "created_by_id" text;--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD COLUMN "interview_type" "interview_type" DEFAULT 'screening' NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD CONSTRAINT "automation_booking_invitations_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;