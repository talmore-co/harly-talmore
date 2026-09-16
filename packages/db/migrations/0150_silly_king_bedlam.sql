CREATE TABLE "meta_conversion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"application_id" uuid NOT NULL,
	"pixel_id" text NOT NULL,
	"event_name" text NOT NULL,
	"event_id" text NOT NULL,
	"event_time" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb,
	"test_event_code" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "meta_capi_token" jsonb;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "meta_capi_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "meta_test_event_code" text;--> statement-breakpoint
ALTER TABLE "meta_conversion_events" ADD CONSTRAINT "meta_conversion_events_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_conversion_events" ADD CONSTRAINT "meta_conversion_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meta_conversion_events_identity_idx" ON "meta_conversion_events" USING btree ("workspace_id","pixel_id","event_name","event_id");--> statement-breakpoint
CREATE INDEX "meta_conversion_events_due_idx" ON "meta_conversion_events" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "meta_conversion_events_application_idx" ON "meta_conversion_events" USING btree ("application_id");