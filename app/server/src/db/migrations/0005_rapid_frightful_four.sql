ALTER TABLE "lifecycle_action_log" DROP CONSTRAINT "lifecycle_action_log_performed_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "note_lifecycle" DROP CONSTRAINT "note_lifecycle_death_reported_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "note_lifecycle" DROP CONSTRAINT "note_lifecycle_consent_initiated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "todo_comments" DROP CONSTRAINT "todo_comments_author_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "todo_history" DROP CONSTRAINT "todo_history_performed_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "todo_visibility" DROP CONSTRAINT "todo_visibility_hidden_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "todos" DROP CONSTRAINT "todos_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "todos" DROP CONSTRAINT "todos_completed_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "lifecycle_action_log" ALTER COLUMN "performed_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "todo_comments" ALTER COLUMN "author_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "todo_history" ALTER COLUMN "performed_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "todo_visibility" ALTER COLUMN "hidden_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "todos" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lifecycle_action_log" ADD CONSTRAINT "lifecycle_action_log_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_lifecycle" ADD CONSTRAINT "note_lifecycle_death_reported_by_users_id_fk" FOREIGN KEY ("death_reported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_lifecycle" ADD CONSTRAINT "note_lifecycle_consent_initiated_by_users_id_fk" FOREIGN KEY ("consent_initiated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_comments" ADD CONSTRAINT "todo_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_history" ADD CONSTRAINT "todo_history_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_visibility" ADD CONSTRAINT "todo_visibility_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;