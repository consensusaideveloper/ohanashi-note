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
ALTER TABLE "wellness_settings"
  ADD CONSTRAINT "wellness_settings_creator_id_users_id_fk"
  FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_wellness_settings_enabled" ON "wellness_settings" USING btree ("enabled");
--> statement-breakpoint
CREATE INDEX "idx_wellness_settings_creator" ON "wellness_settings" USING btree ("creator_id");
