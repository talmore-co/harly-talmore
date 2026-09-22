ALTER TABLE "talentsourcer_import_items" ADD COLUMN "workspace_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "talentsourcer_import_items" ADD CONSTRAINT "talentsourcer_import_items_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "talentsourcer_links_candidate_idx" ON "talentsourcer_candidate_links" USING btree ("workspace_id","candidate_id");--> statement-breakpoint
CREATE INDEX "talentsourcer_batches_expiry_idx" ON "talentsourcer_import_batches" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "talentsourcer_items_candidate_idx" ON "talentsourcer_import_items" USING btree ("workspace_id","candidate_id");