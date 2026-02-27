CREATE TABLE "access_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"family_member_id" uuid NOT NULL,
	"category_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_access_presets" UNIQUE("creator_id","family_member_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "lifecycle_action_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lifecycle_id" uuid NOT NULL,
	"action" text NOT NULL,
	"performed_by" uuid NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category_access" DROP CONSTRAINT "category_access_granted_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "category_access" ALTER COLUMN "granted_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "note_lifecycle" ADD COLUMN "consent_initiated_by" uuid;--> statement-breakpoint
ALTER TABLE "access_presets" ADD CONSTRAINT "access_presets_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_presets" ADD CONSTRAINT "access_presets_family_member_id_family_members_id_fk" FOREIGN KEY ("family_member_id") REFERENCES "public"."family_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_action_log" ADD CONSTRAINT "lifecycle_action_log_lifecycle_id_note_lifecycle_id_fk" FOREIGN KEY ("lifecycle_id") REFERENCES "public"."note_lifecycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_action_log" ADD CONSTRAINT "lifecycle_action_log_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_access_presets_creator" ON "access_presets" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "idx_lifecycle_action_log_lifecycle" ON "lifecycle_action_log" USING btree ("lifecycle_id");--> statement-breakpoint
ALTER TABLE "category_access" ADD CONSTRAINT "category_access_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_lifecycle" ADD CONSTRAINT "note_lifecycle_consent_initiated_by_users_id_fk" FOREIGN KEY ("consent_initiated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;