CREATE TABLE "wellness_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"checkin_date" text NOT NULL,
	"status" text NOT NULL,
	"conversation_id" uuid,
	"signals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary_for_family" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_wellness_checkins_creator_date" UNIQUE("creator_id","checkin_date")
);
--> statement-breakpoint
CREATE TABLE "wellness_notification_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"delivery_channel" text DEFAULT 'in_app' NOT NULL,
	"delivery_status" text DEFAULT 'sent' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_wellness_notification_window" UNIQUE("creator_id","recipient_user_id","type","window_end")
);
--> statement-breakpoint
CREATE TABLE "wellness_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"share_level" text DEFAULT 'basic' NOT NULL,
	"timezone" text DEFAULT 'Asia/Tokyo' NOT NULL,
	"weekly_summary_day" integer DEFAULT 0 NOT NULL,
	"escalation_rule" jsonb DEFAULT '{"day2":"warn","day3":"urgent"}'::jsonb NOT NULL,
	"paused_until" timestamp with time zone,
	"consent_version" text DEFAULT '2026-03-v1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wellness_settings_creator_id_unique" UNIQUE("creator_id")
);
--> statement-breakpoint
CREATE TABLE "deleted_auth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"identity_hash" text NOT NULL,
	"deletion_reason" text,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_deleted_auth_identities_provider_hash" UNIQUE("provider","identity_hash")
);
--> statement-breakpoint
CREATE TABLE "deletion_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deleted_user_id" uuid,
	"firebase_uid_hash" text,
	"deletion_reason" text,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "pending_r2_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"reason" text,
	"first_failed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_failed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_pending_r2_deletions_storage_key" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "pending_auth_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"reason" text,
	"first_failed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_failed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_pending_auth_deletions_provider_external" UNIQUE("provider","external_id")
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "pending_note_entries" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "note_update_proposals" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "emotion_analysis" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "assistant_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "scheduled_deletion_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_reason" text;--> statement-breakpoint
ALTER TABLE "wellness_checkins" ADD CONSTRAINT "wellness_checkins_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wellness_checkins" ADD CONSTRAINT "wellness_checkins_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wellness_notification_log" ADD CONSTRAINT "wellness_notification_log_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wellness_notification_log" ADD CONSTRAINT "wellness_notification_log_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wellness_settings" ADD CONSTRAINT "wellness_settings_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_wellness_checkins_creator_date" ON "wellness_checkins" USING btree ("creator_id","checkin_date");--> statement-breakpoint
CREATE INDEX "idx_wellness_checkins_status" ON "wellness_checkins" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_wellness_notification_log_creator" ON "wellness_notification_log" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "idx_wellness_settings_enabled" ON "wellness_settings" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "idx_wellness_settings_creator" ON "wellness_settings" USING btree ("creator_id");
--> statement-breakpoint
CREATE INDEX "idx_deleted_auth_identities_deleted_at" ON "deleted_auth_identities" USING btree ("deleted_at");
--> statement-breakpoint
CREATE INDEX "idx_deletion_audit_log_deleted_at" ON "deletion_audit_log" USING btree ("deleted_at");
--> statement-breakpoint
CREATE INDEX "idx_pending_r2_deletions_last_failed_at" ON "pending_r2_deletions" USING btree ("last_failed_at");
--> statement-breakpoint
CREATE INDEX "idx_pending_auth_deletions_last_failed_at" ON "pending_auth_deletions" USING btree ("last_failed_at");
