ALTER TABLE "applications" ADD COLUMN "questionnaire_score" double precision;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "questionnaire_score_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "meta_pixel_id" text;