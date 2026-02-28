import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";

import { db } from "../db/connection.js";
import { conversations } from "../db/schema.js";
import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { logger } from "../lib/logger.js";
import {
  getCreatorLifecycleStatus,
  isDeletionBlocked,
} from "../lib/lifecycle-helpers.js";
import { deleteConversationAudioFile } from "../lib/r2-cleanup.js";

import type { Context } from "hono";

// --- Type helpers ---

/** Shape of a conversation as sent/received by the client. */
interface ClientConversation {
  id: string;
  category: string | null;
  characterId: string | null;
  startedAt: number;
  endedAt: number | null;
  transcript: unknown;
  summary: string | null;
  summaryStatus: string;
  coveredQuestionIds: string[] | null;
  noteEntries: unknown;
  oneLinerSummary: string | null;
  emotionAnalysis: string | null;
  discussedCategories: string[] | null;
  keyPoints: unknown;
  topicAdherence: string | null;
  offTopicSummary: string | null;
  audioAvailable: boolean;
  audioStorageKey: string | null;
  audioMimeType: string | null;
  integrityHash: string | null;
  audioHash: string | null;
  integrityHashedAt: number | null;
}

/** Convert a DB row to client format. */
function toClientConversation(
  row: typeof conversations.$inferSelect,
): ClientConversation {
  return {
    id: row.id,
    category: row.category,
    characterId: row.characterId,
    startedAt: row.startedAt.getTime(),
    endedAt: row.endedAt ? row.endedAt.getTime() : null,
    transcript: row.transcript,
    summary: row.summary,
    summaryStatus: row.summaryStatus,
    coveredQuestionIds: row.coveredQuestionIds,
    noteEntries: row.noteEntries,
    oneLinerSummary: row.oneLinerSummary,
    emotionAnalysis: row.emotionAnalysis,
    discussedCategories: row.discussedCategories,
    keyPoints: row.keyPoints,
    topicAdherence: row.topicAdherence,
    offTopicSummary: row.offTopicSummary,
    audioAvailable: row.audioAvailable,
    audioStorageKey: row.audioStorageKey,
    audioMimeType: row.audioMimeType,
    integrityHash: row.integrityHash,
    audioHash: row.audioHash,
    integrityHashedAt: row.integrityHashedAt
      ? row.integrityHashedAt.getTime()
      : null,
  };
}

/** Safely extract a string or null from an unknown value. */
function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Safely extract a string array or empty array from an unknown value. */
function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

// --- Route ---

const conversationsRoute = new Hono();

/** GET /api/conversations — List all conversations for the authenticated user. */
conversationsRoute.get("/api/conversations", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.startedAt));

    const result = rows.map(toClientConversation);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to list conversations", { error: message });
    return c.json(
      { error: "会話一覧の取得に失敗しました", code: "LIST_FAILED" },
      500,
    );
  }
});

/** GET /api/conversations/deletion-status — Check if conversation deletion is allowed. */
conversationsRoute.get(
  "/api/conversations/deletion-status",
  async (c: Context) => {
    try {
      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const lifecycleStatus = await getCreatorLifecycleStatus(userId);
      const blocked = isDeletionBlocked(lifecycleStatus);
      return c.json({ blocked, lifecycleStatus });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to check deletion status", { error: message });
      return c.json(
        { error: "削除可否の確認に失敗しました", code: "CHECK_FAILED" },
        500,
      );
    }
  },
);

/** GET /api/conversations/:id — Get a single conversation. */
conversationsRoute.get("/api/conversations/:id", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const conversationId = c.req.param("id");

    const row = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
      ),
    });

    if (!row) {
      return c.json({ error: "会話が見つかりません", code: "NOT_FOUND" }, 404);
    }

    return c.json(toClientConversation(row));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to get conversation", { error: message });
    return c.json(
      { error: "会話の取得に失敗しました", code: "GET_FAILED" },
      500,
    );
  }
});

/** POST /api/conversations — Create or replace a conversation (upsert). */
conversationsRoute.post("/api/conversations", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    // Block data modification when lifecycle is not active
    const lifecycleStatus = await getCreatorLifecycleStatus(userId);
    if (isDeletionBlocked(lifecycleStatus)) {
      return c.json(
        {
          error: "ノートが保護されているため、この操作は実行できません",
          code: "MODIFICATION_BLOCKED_BY_LIFECYCLE",
        },
        403,
      );
    }

    const body = await c.req.json<Record<string, unknown>>();
    const id = body["id"];
    const startedAt = body["startedAt"];

    if (typeof id !== "string" || typeof startedAt !== "number") {
      return c.json(
        {
          error: "id (string) と startedAt (number) は必須です",
          code: "INVALID_BODY",
        },
        400,
      );
    }

    const endedAt = body["endedAt"];
    const integrityHashedAt = body["integrityHashedAt"];

    const values = {
      id,
      userId,
      category: toStringOrNull(body["category"]),
      characterId: toStringOrNull(body["characterId"]),
      startedAt: new Date(startedAt),
      endedAt: typeof endedAt === "number" ? new Date(endedAt) : null,
      transcript: Array.isArray(body["transcript"]) ? body["transcript"] : [],
      summary: toStringOrNull(body["summary"]),
      summaryStatus:
        typeof body["summaryStatus"] === "string"
          ? body["summaryStatus"]
          : "pending",
      coveredQuestionIds: toStringArray(body["coveredQuestionIds"]),
      noteEntries: Array.isArray(body["noteEntries"])
        ? body["noteEntries"]
        : [],
      oneLinerSummary: toStringOrNull(body["oneLinerSummary"]),
      emotionAnalysis: toStringOrNull(body["emotionAnalysis"]),
      discussedCategories: toStringArray(body["discussedCategories"]),
      keyPoints: body["keyPoints"] ?? null,
      topicAdherence: toStringOrNull(body["topicAdherence"]),
      offTopicSummary: toStringOrNull(body["offTopicSummary"]),
      audioAvailable: body["audioAvailable"] === true,
      audioStorageKey: toStringOrNull(body["audioStorageKey"]),
      audioMimeType: toStringOrNull(body["audioMimeType"]),
      integrityHash: toStringOrNull(body["integrityHash"]),
      audioHash: toStringOrNull(body["audioHash"]),
      integrityHashedAt:
        typeof integrityHashedAt === "number"
          ? new Date(integrityHashedAt)
          : null,
    };

    await db
      .insert(conversations)
      .values(values)
      .onConflictDoUpdate({
        target: conversations.id,
        set: {
          ...values,
          id: undefined, // Don't update the PK
        },
      });

    return c.json({ success: true }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to save conversation", { error: message });
    return c.json(
      { error: "会話の保存に失敗しました", code: "SAVE_FAILED" },
      500,
    );
  }
});

/** PATCH /api/conversations/:id — Partial update of a conversation. */
conversationsRoute.patch("/api/conversations/:id", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const conversationId = c.req.param("id");

    // Block data modification when lifecycle is not active
    const lifecycleStatus = await getCreatorLifecycleStatus(userId);
    if (isDeletionBlocked(lifecycleStatus)) {
      return c.json(
        {
          error: "ノートが保護されているため、この操作は実行できません",
          code: "MODIFICATION_BLOCKED_BY_LIFECYCLE",
        },
        403,
      );
    }

    // Verify ownership
    const existing = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
      ),
      columns: { id: true },
    });

    if (!existing) {
      return c.json({ error: "会話が見つかりません", code: "NOT_FOUND" }, 404);
    }

    const body = await c.req.json<Record<string, unknown>>();
    const updates: Record<string, unknown> = {};

    // Map client fields to DB columns, converting timestamps
    if ("category" in body) updates["category"] = body["category"];
    if ("characterId" in body) updates["characterId"] = body["characterId"];
    if ("startedAt" in body && typeof body["startedAt"] === "number") {
      updates["startedAt"] = new Date(body["startedAt"]);
    }
    if ("endedAt" in body) {
      updates["endedAt"] =
        typeof body["endedAt"] === "number" ? new Date(body["endedAt"]) : null;
    }
    if ("transcript" in body) updates["transcript"] = body["transcript"];
    if ("summary" in body) updates["summary"] = body["summary"];
    if ("summaryStatus" in body)
      updates["summaryStatus"] = body["summaryStatus"];
    if ("coveredQuestionIds" in body)
      updates["coveredQuestionIds"] = body["coveredQuestionIds"];
    if ("noteEntries" in body) updates["noteEntries"] = body["noteEntries"];
    if ("oneLinerSummary" in body)
      updates["oneLinerSummary"] = body["oneLinerSummary"];
    if ("emotionAnalysis" in body)
      updates["emotionAnalysis"] = body["emotionAnalysis"];
    if ("discussedCategories" in body)
      updates["discussedCategories"] = body["discussedCategories"];
    if ("keyPoints" in body) updates["keyPoints"] = body["keyPoints"];
    if ("topicAdherence" in body)
      updates["topicAdherence"] = body["topicAdherence"];
    if ("offTopicSummary" in body)
      updates["offTopicSummary"] = body["offTopicSummary"];
    if ("audioAvailable" in body)
      updates["audioAvailable"] = body["audioAvailable"];
    if ("audioStorageKey" in body)
      updates["audioStorageKey"] = body["audioStorageKey"];
    if ("audioMimeType" in body)
      updates["audioMimeType"] = body["audioMimeType"];
    if ("integrityHash" in body)
      updates["integrityHash"] = body["integrityHash"];
    if ("audioHash" in body) updates["audioHash"] = body["audioHash"];
    if ("integrityHashedAt" in body) {
      updates["integrityHashedAt"] =
        typeof body["integrityHashedAt"] === "number"
          ? new Date(body["integrityHashedAt"])
          : null;
    }

    if (Object.keys(updates).length === 0) {
      return c.json(
        { error: "更新するフィールドがありません", code: "NO_UPDATES" },
        400,
      );
    }

    await db
      .update(conversations)
      .set(updates)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId),
        ),
      );

    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to update conversation", { error: message });
    return c.json(
      { error: "会話の更新に失敗しました", code: "UPDATE_FAILED" },
      500,
    );
  }
});

/** DELETE /api/conversations/:id — Delete a conversation. */
conversationsRoute.delete("/api/conversations/:id", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const conversationId = c.req.param("id");

    // Block deletion when lifecycle is not active
    const lifecycleStatus = await getCreatorLifecycleStatus(userId);
    if (isDeletionBlocked(lifecycleStatus)) {
      return c.json(
        {
          error: "ノートが保護されているため、会話を削除できません",
          code: "DELETION_BLOCKED_BY_LIFECYCLE",
        },
        403,
      );
    }

    // Fetch conversation to verify ownership and get audioStorageKey
    const existing = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
      ),
      columns: { id: true, audioStorageKey: true },
    });

    if (!existing) {
      return c.json({ error: "会話が見つかりません", code: "NOT_FOUND" }, 404);
    }

    // Delete R2 audio file BEFORE DB deletion (best-effort)
    if (existing.audioStorageKey !== null) {
      await deleteConversationAudioFile(existing.audioStorageKey);
    }

    // Delete the conversation from DB
    await db
      .delete(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId),
        ),
      );

    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to delete conversation", { error: message });
    return c.json(
      { error: "会話の削除に失敗しました", code: "DELETE_FAILED" },
      500,
    );
  }
});

export { conversationsRoute };
