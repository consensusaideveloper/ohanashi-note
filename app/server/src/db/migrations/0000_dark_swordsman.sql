CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"category" text,
	"character_id" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"summary_status" text DEFAULT 'pending' NOT NULL,
	"covered_question_ids" text[] DEFAULT '{}',
	"note_entries" jsonb DEFAULT '[]'::jsonb,
	"one_liner_summary" text,
	"emotion_analysis" text,
	"discussed_categories" text[] DEFAULT '{}',
	"key_points" jsonb,
	"topic_adherence" text,
	"off_topic_summary" text,
	"audio_available" boolean DEFAULT false NOT NULL,
	"audio_storage_key" text,
	"audio_mime_type" text,
	"integrity_hash" text,
	"audio_hash" text,
	"integrity_hashed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_ids" text[],
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firebase_uid" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"character_id" text,
	"font_size" text DEFAULT 'standard' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_firebase_uid_unique" UNIQUE("firebase_uid")
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_conversations_user" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_user_started" ON "conversations" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_conversations_user_category" ON "conversations" USING btree ("user_id","category");