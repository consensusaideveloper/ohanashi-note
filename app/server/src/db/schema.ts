import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  index,
  unique,
} from "drizzle-orm/pg-core";

const tz = { withTimezone: true } as const;

// --- Users ---

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  firebaseUid: text("firebase_uid").unique().notNull(),
  name: text("name").notNull().default(""),
  characterId: text("character_id"),
  fontSize: text("font_size").notNull().default("standard"),
  speakingSpeed: text("speaking_speed").notNull().default("normal"),
  silenceDuration: text("silence_duration").notNull().default("normal"),
  confirmationLevel: text("confirmation_level").notNull().default("normal"),
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
    improvedTranscript: jsonb("improved_transcript"),
    transcriptionModel: text("transcription_model"),
    integrityHash: text("integrity_hash"),
    audioHash: text("audio_hash"),
    integrityHashedAt: timestamp("integrity_hashed_at", tz),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (table) => [
    index("idx_conversations_user").on(table.userId),
    index("idx_conversations_user_started").on(table.userId, table.startedAt),
    index("idx_conversations_user_category").on(table.userId, table.category),
    index("idx_conversations_summary_status").on(
      table.summaryStatus,
      table.createdAt,
    ),
  ],
);

// --- Shares (legacy, to be removed in Phase 3) ---

export const shares = pgTable("shares", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  categoryIds: text("category_ids").array(),
  expiresAt: timestamp("expires_at", tz).notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

// --- Family Invitations ---

export const familyInvitations = pgTable("family_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatorId: uuid("creator_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").unique().notNull(),
  relationship: text("relationship").notNull(),
  relationshipLabel: text("relationship_label").notNull(),
  role: text("role").notNull().default("member"),
  expiresAt: timestamp("expires_at", tz).notNull(),
  acceptedAt: timestamp("accepted_at", tz),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

// --- Family Members ---

export const familyMembers = pgTable(
  "family_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    relationship: text("relationship").notNull(),
    relationshipLabel: text("relationship_label").notNull(),
    role: text("role").notNull().default("member"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (table) => [
    index("idx_family_creator").on(table.creatorId),
    index("idx_family_member").on(table.memberId),
    unique("uq_family_creator_member").on(table.creatorId, table.memberId),
  ],
);

// --- Note Lifecycle ---

export const noteLifecycle = pgTable("note_lifecycle", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatorId: uuid("creator_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("active"),
  deathReportedAt: timestamp("death_reported_at", tz),
  deathReportedBy: uuid("death_reported_by").references(() => users.id, {
    onDelete: "set null",
  }),
  consentInitiatedBy: uuid("consent_initiated_by").references(() => users.id, {
    onDelete: "set null",
  }),
  openedAt: timestamp("opened_at", tz),
  deletionStatus: text("deletion_status"),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
});

// --- Consent Records ---

export const consentRecords = pgTable(
  "consent_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lifecycleId: uuid("lifecycle_id")
      .notNull()
      .references(() => noteLifecycle.id, { onDelete: "cascade" }),
    familyMemberId: uuid("family_member_id")
      .notNull()
      .references(() => familyMembers.id, { onDelete: "cascade" }),
    consented: boolean("consented"),
    consentedAt: timestamp("consented_at", tz),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (table) => [
    index("idx_consent_lifecycle").on(table.lifecycleId),
    unique("uq_consent_lifecycle_member").on(
      table.lifecycleId,
      table.familyMemberId,
    ),
  ],
);

// --- Deletion Consent Records ---

export const deletionConsentRecords = pgTable(
  "deletion_consent_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lifecycleId: uuid("lifecycle_id")
      .notNull()
      .references(() => noteLifecycle.id, { onDelete: "cascade" }),
    familyMemberId: uuid("family_member_id")
      .notNull()
      .references(() => familyMembers.id, { onDelete: "cascade" }),
    consented: boolean("consented"),
    consentedAt: timestamp("consented_at", tz),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (table) => [
    index("idx_deletion_consent_lifecycle").on(table.lifecycleId),
    unique("uq_deletion_consent_lifecycle_member").on(
      table.lifecycleId,
      table.familyMemberId,
    ),
  ],
);

// --- Notifications ---

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    relatedCreatorId: uuid("related_creator_id").references(() => users.id, {
      onDelete: "set null",
    }),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (table) => [
    index("idx_notifications_user_unread").on(table.userId, table.isRead),
  ],
);

// --- Lifecycle Action Log ---

export const lifecycleActionLog = pgTable(
  "lifecycle_action_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lifecycleId: uuid("lifecycle_id")
      .notNull()
      .references(() => noteLifecycle.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    performedBy: uuid("performed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (table) => [
    index("idx_lifecycle_action_log_lifecycle").on(table.lifecycleId),
  ],
);

// --- Access Presets (creator's pre-mortem category access wishes) ---

export const accessPresets = pgTable(
  "access_presets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    familyMemberId: uuid("family_member_id")
      .notNull()
      .references(() => familyMembers.id, { onDelete: "cascade" }),
    categoryId: text("category_id").notNull(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (table) => [
    index("idx_access_presets_creator").on(table.creatorId),
    unique("uq_access_presets").on(
      table.creatorId,
      table.familyMemberId,
      table.categoryId,
    ),
  ],
);

// --- Category Access ---

export const categoryAccess = pgTable(
  "category_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lifecycleId: uuid("lifecycle_id")
      .notNull()
      .references(() => noteLifecycle.id, { onDelete: "cascade" }),
    familyMemberId: uuid("family_member_id")
      .notNull()
      .references(() => familyMembers.id, { onDelete: "cascade" }),
    categoryId: text("category_id").notNull(),
    grantedBy: uuid("granted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    grantedAt: timestamp("granted_at", tz).notNull().defaultNow(),
  },
  (table) => [
    index("idx_category_access_lifecycle").on(table.lifecycleId),
    unique("uq_category_access").on(
      table.lifecycleId,
      table.familyMemberId,
      table.categoryId,
    ),
  ],
);

// --- Todos ---

export const todos = pgTable(
  "todos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lifecycleId: uuid("lifecycle_id")
      .notNull()
      .references(() => noteLifecycle.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    sourceCategory: text("source_category"),
    sourceQuestionId: text("source_question_id"),
    sourceAnswer: text("source_answer"),
    assigneeId: uuid("assignee_id").references(() => familyMembers.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("pending"),
    priority: text("priority").notNull().default("medium"),
    dueDate: timestamp("due_date", tz),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    completedAt: timestamp("completed_at", tz),
    completedBy: uuid("completed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (table) => [
    index("idx_todos_lifecycle").on(table.lifecycleId),
    index("idx_todos_creator").on(table.creatorId),
    index("idx_todos_assignee").on(table.assigneeId),
    index("idx_todos_status").on(table.status),
  ],
);

// --- Todo Comments ---

export const todoComments = pgTable(
  "todo_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    todoId: uuid("todo_id")
      .notNull()
      .references(() => todos.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (table) => [index("idx_todo_comments_todo").on(table.todoId)],
);

// --- Todo History ---

export const todoHistory = pgTable(
  "todo_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    todoId: uuid("todo_id")
      .notNull()
      .references(() => todos.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    performedBy: uuid("performed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (table) => [index("idx_todo_history_todo").on(table.todoId)],
);

// --- Todo Visibility (per-item hiding for specific members) ---

export const todoVisibility = pgTable(
  "todo_visibility",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    todoId: uuid("todo_id")
      .notNull()
      .references(() => todos.id, { onDelete: "cascade" }),
    familyMemberId: uuid("family_member_id")
      .notNull()
      .references(() => familyMembers.id, { onDelete: "cascade" }),
    hiddenBy: uuid("hidden_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (table) => [
    index("idx_todo_visibility_todo").on(table.todoId),
    unique("uq_todo_visibility").on(table.todoId, table.familyMemberId),
  ],
);
