ALTER TABLE "interviews" ADD COLUMN "internal_notes" text;--> statement-breakpoint
ALTER TABLE "scorecards" ADD COLUMN "interview_id" uuid;--> statement-breakpoint
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scorecards_interview_idx" ON "scorecards" USING btree ("interview_id");