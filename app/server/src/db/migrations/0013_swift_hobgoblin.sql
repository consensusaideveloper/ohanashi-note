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
ALTER TABLE "wellness_checkins"
  ADD CONSTRAINT "wellness_checkins_creator_id_users_id_fk"
  FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "wellness_checkins"
  ADD CONSTRAINT "wellness_checkins_conversation_id_conversations_id_fk"
  FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "wellness_notification_log"
  ADD CONSTRAINT "wellness_notification_log_creator_id_users_id_fk"
  FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "wellness_notification_log"
  ADD CONSTRAINT "wellness_notification_log_recipient_user_id_users_id_fk"
  FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_wellness_checkins_creator_date" ON "wellness_checkins" USING btree ("creator_id","checkin_date");
--> statement-breakpoint
CREATE INDEX "idx_wellness_checkins_status" ON "wellness_checkins" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "idx_wellness_notification_log_creator" ON "wellness_notification_log" USING btree ("creator_id");
