CREATE TABLE "deletion_consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lifecycle_id" uuid NOT NULL,
	"family_member_id" uuid NOT NULL,
	"consented" boolean,
	"consented_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_deletion_consent_lifecycle_member" UNIQUE("lifecycle_id","family_member_id")
);
--> statement-breakpoint
CREATE TABLE "todo_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"todo_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todo_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"todo_id" uuid NOT NULL,
	"action" text NOT NULL,
	"performed_by" uuid NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todo_visibility" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"todo_id" uuid NOT NULL,
	"family_member_id" uuid NOT NULL,
	"hidden_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_todo_visibility" UNIQUE("todo_id","family_member_id")
);
--> statement-breakpoint
CREATE TABLE "todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lifecycle_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"source_category" text,
	"source_question_id" text,
	"source_answer" text,
	"assignee_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"due_date" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_related_creator_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "note_lifecycle" ADD COLUMN "deletion_status" text;--> statement-breakpoint
ALTER TABLE "deletion_consent_records" ADD CONSTRAINT "deletion_consent_records_lifecycle_id_note_lifecycle_id_fk" FOREIGN KEY ("lifecycle_id") REFERENCES "public"."note_lifecycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_consent_records" ADD CONSTRAINT "deletion_consent_records_family_member_id_family_members_id_fk" FOREIGN KEY ("family_member_id") REFERENCES "public"."family_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_comments" ADD CONSTRAINT "todo_comments_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_comments" ADD CONSTRAINT "todo_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_history" ADD CONSTRAINT "todo_history_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_history" ADD CONSTRAINT "todo_history_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_visibility" ADD CONSTRAINT "todo_visibility_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_visibility" ADD CONSTRAINT "todo_visibility_family_member_id_family_members_id_fk" FOREIGN KEY ("family_member_id") REFERENCES "public"."family_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_visibility" ADD CONSTRAINT "todo_visibility_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_lifecycle_id_note_lifecycle_id_fk" FOREIGN KEY ("lifecycle_id") REFERENCES "public"."note_lifecycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_assignee_id_family_members_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."family_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_deletion_consent_lifecycle" ON "deletion_consent_records" USING btree ("lifecycle_id");--> statement-breakpoint
CREATE INDEX "idx_todo_comments_todo" ON "todo_comments" USING btree ("todo_id");--> statement-breakpoint
CREATE INDEX "idx_todo_history_todo" ON "todo_history" USING btree ("todo_id");--> statement-breakpoint
CREATE INDEX "idx_todo_visibility_todo" ON "todo_visibility" USING btree ("todo_id");--> statement-breakpoint
CREATE INDEX "idx_todos_lifecycle" ON "todos" USING btree ("lifecycle_id");--> statement-breakpoint
CREATE INDEX "idx_todos_creator" ON "todos" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "idx_todos_assignee" ON "todos" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "idx_todos_status" ON "todos" USING btree ("status");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_creator_id_users_id_fk" FOREIGN KEY ("related_creator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;