ALTER TABLE "users" ADD COLUMN "speaking_speed" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "silence_duration" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "confirmation_level" text DEFAULT 'normal' NOT NULL;