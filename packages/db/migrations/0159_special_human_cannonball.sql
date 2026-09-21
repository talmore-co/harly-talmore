ALTER TABLE "mail_messages" ADD COLUMN "author_id" text;--> statement-breakpoint
ALTER TABLE "mail_messages" ADD COLUMN "origin" text;--> statement-breakpoint
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;