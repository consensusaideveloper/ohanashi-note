CREATE TABLE "wellness_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"date" text NOT NULL,
	"had_conversation" boolean DEFAULT false NOT NULL,
	"conversation_id" uuid,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_wellness_checkins_creator_date" UNIQUE("creator_id","date")
);
--> statement-breakpoint
CREATE TABLE "wellness_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"frequency" text DEFAULT 'daily' NOT NULL,
	"sharing_level" text DEFAULT 'activity_only' NOT NULL,
	"enabled_at" timestamp with time zone,
	"last_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wellness_settings_creator_id_unique" UNIQUE("creator_id")
);
--> statement-breakpoint
ALTER TABLE "wellness_checkins" ADD CONSTRAINT "wellness_checkins_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wellness_settings" ADD CONSTRAINT "wellness_settings_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_wellness_checkins_creator_date" ON "wellness_checkins" USING btree ("creator_id","date");