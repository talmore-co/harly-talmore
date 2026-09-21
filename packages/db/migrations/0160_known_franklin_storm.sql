ALTER TABLE "automation_booking_invitations" DROP CONSTRAINT "automation_booking_invitations_event_id_personal_cal_events_id_fk";
--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ALTER COLUMN "event_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD COLUMN "event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD COLUMN "token_secret" text;--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD COLUMN "location_format" text;--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD COLUMN "definition_version" integer;--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD COLUMN "duration_mins" integer;--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD COLUMN "booking_state" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD COLUMN "selected_event_id" uuid;--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD COLUMN "booking_request_id" uuid;--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD COLUMN "booking_start_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD COLUMN "booking_uid" text;--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD CONSTRAINT "automation_booking_invitations_selected_event_id_personal_cal_events_id_fk" FOREIGN KEY ("selected_event_id") REFERENCES "public"."personal_cal_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_booking_invitations" ADD CONSTRAINT "automation_booking_invitations_event_id_personal_cal_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."personal_cal_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_booking_pool_application_idx" ON "automation_booking_invitations" USING btree ("workspace_id","application_id") WHERE "automation_booking_invitations"."token_secret" is not null;