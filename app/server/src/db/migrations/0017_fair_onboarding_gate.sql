ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "users"
SET "onboarding_completed_at" = COALESCE("updated_at", "created_at", now())
WHERE "name" <> '';
