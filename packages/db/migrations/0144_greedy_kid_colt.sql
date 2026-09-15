CREATE TABLE "personal_cal_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"booking_uid" text NOT NULL,
	"application_id" uuid,
	"interview_id" uuid,
	"attendee_name" text NOT NULL,
	"attendee_email" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_cal_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"cal_user_id" integer NOT NULL,
	"username" text NOT NULL,
	"account_email" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"api_key_ciphertext" text,
	"api_key_iv" text,
	"api_key_tag" text,
	"default_event_type_id" integer,
	"last_received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_cal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"event_type_id" integer NOT NULL,
	"title" text NOT NULL,
	"booking_url" text NOT NULL,
	"duration_mins" integer NOT NULL,
	"webhook_id" text,
	"webhook_secret" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "cal_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "cal_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "personal_cal_bookings" ADD CONSTRAINT "personal_cal_bookings_connection_id_personal_cal_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."personal_cal_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_cal_bookings" ADD CONSTRAINT "personal_cal_bookings_subscription_id_personal_cal_events_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."personal_cal_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_cal_bookings" ADD CONSTRAINT "personal_cal_bookings_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_cal_connections" ADD CONSTRAINT "personal_cal_connections_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_cal_connections" ADD CONSTRAINT "personal_cal_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_cal_events" ADD CONSTRAINT "personal_cal_events_connection_id_personal_cal_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."personal_cal_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "personal_cal_bookings_connection_uid_idx" ON "personal_cal_bookings" USING btree ("connection_id","booking_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "personal_cal_connections_member_idx" ON "personal_cal_connections" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "personal_cal_events_connection_event_idx" ON "personal_cal_events" USING btree ("connection_id","event_type_id");