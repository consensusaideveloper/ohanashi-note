ALTER TABLE "conversations"
  ADD COLUMN "pending_note_entries" jsonb DEFAULT '[]'::jsonb;

ALTER TABLE "conversations"
  ADD COLUMN "note_update_proposals" jsonb DEFAULT '[]'::jsonb;
