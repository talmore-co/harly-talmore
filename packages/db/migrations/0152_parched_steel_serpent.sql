CREATE TABLE "client_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"application_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"offered_on" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"terms" text,
	"decided_at" timestamp with time zone,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"contacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "hired_on" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "hire_terms" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "client_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_workspace_id_idx" ON "clients" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "client_offers" ADD CONSTRAINT "client_offers_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_offers" ADD CONSTRAINT "client_offers_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_offers" ADD CONSTRAINT "client_offers_workspace_id_application_id_candidate_id_job_id_applications_workspace_id_id_candidate_id_job_id_fk" FOREIGN KEY ("workspace_id","application_id","candidate_id","job_id") REFERENCES "public"."applications"("workspace_id","id","candidate_id","job_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_offers" ADD CONSTRAINT "client_offers_workspace_id_client_id_clients_workspace_id_id_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_offers_application_idx" ON "client_offers" USING btree ("workspace_id","application_id");--> statement-breakpoint
CREATE INDEX "clients_workspace_idx" ON "clients" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_client_id_clients_workspace_id_id_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_client_idx" ON "jobs" USING btree ("workspace_id","client_id");
--> statement-breakpoint
-- Preserve stage IDs, applications and history; insert Submitted before Offer.
DO $$
DECLARE target record; later record;
BEGIN
  FOR target IN
    SELECT s.job_id, s.workspace_id, s."order" AS position
    FROM job_stages s
    WHERE s.name = 'Offer'
      AND EXISTS (SELECT 1 FROM job_stages i WHERE i.job_id = s.job_id AND i.name = 'Interview' AND i."order" < s."order")
      AND NOT EXISTS (SELECT 1 FROM job_stages x WHERE x.job_id = s.job_id AND lower(trim(x.name)) IN ('submitted', 'submitted to client'))
  LOOP
    FOR later IN SELECT id FROM job_stages WHERE job_id = target.job_id AND "order" >= target.position ORDER BY "order" DESC LOOP
      UPDATE job_stages SET "order" = "order" + 1 WHERE id = later.id;
    END LOOP;
    INSERT INTO job_stages (workspace_id, job_id, name, "order", color, email_config)
    VALUES (target.workspace_id, target.job_id, 'Submitted', target.position, '#E0E7FF', '{"candidateUpdatesEnabled":false}');
  END LOOP;
END $$;
