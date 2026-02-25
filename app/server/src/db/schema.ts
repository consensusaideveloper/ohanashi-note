import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  index,
} from "drizzle-orm/pg-core";

const tz = { withTimezone: true } as const;

// --- Users ---

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  firebaseUid: text("firebase_uid").unique().notNull(),
  name: text("name").notNull().default(""),
  characterId: text("character_id"),
  fontSize: text("font_size").notNull().default("standard"),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
});

// --- Conversations ---

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category"),
    characterId: text("character_id"),
    startedAt: timestamp("started_at", tz).notNull(),
    endedAt: timestamp("ended_at", tz),
    transcript: jsonb("transcript").notNull().default([]),
    summary: text("summary"),
    summaryStatus: text("summary_status").notNull().default("pending"),
    coveredQuestionIds: text("covered_question_ids").array().default([]),
    noteEntries: jsonb("note_entries").default([]),
    oneLinerSummary: text("one_liner_summary"),
    emotionAnalysis: text("emotion_analysis"),
    discussedCategories: text("discussed_categories").array().default([]),
    keyPoints: jsonb("key_points"),
    topicAdherence: text("topic_adherence"),
    offTopicSummary: text("off_topic_summary"),
    audioAvailable: boolean("audio_available").notNull().default(false),
    audioStorageKey: text("audio_storage_key"),
    audioMimeType: text("audio_mime_type"),
    integrityHash: text("integrity_hash"),
    audioHash: text("audio_hash"),
    integrityHashedAt: timestamp("integrity_hashed_at", tz),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (table) => [
    index("idx_conversations_user").on(table.userId),
    index("idx_conversations_user_started").on(table.userId, table.startedAt),
    index("idx_conversations_user_category").on(table.userId, table.category),
  ],
);

// --- Shares ---

export const shares = pgTable("shares", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  categoryIds: text("category_ids").array(),
  expiresAt: timestamp("expires_at", tz).notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});
