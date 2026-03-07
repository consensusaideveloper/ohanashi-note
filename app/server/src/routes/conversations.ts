import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";

import { db } from "../db/connection.js";
import { activityLog, conversations } from "../db/schema.js";
import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { logger } from "../lib/logger.js";
import {
  getCreatorLifecycleStatus,
  isDeletionBlocked,
} from "../lib/lifecycle-helpers.js";
import { deleteConversationAudioFile } from "../lib/r2-cleanup.js";
import { hasPersistableUserUtterance } from "../lib/conversation-persistence.js";

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
  pendingNoteEntries: unknown;
  noteUpdateProposals: unknown;
  oneLinerSummary: string | null;
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
    pendingNoteEntries: row.pendingNoteEntries,
    noteUpdateProposals: row.noteUpdateProposals,
    oneLinerSummary: row.oneLinerSummary,
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

interface NoteUpdateTarget {
  questionId: string;
  proposedAnswer: string;
}

function parseNoteUpdateTargets(value: unknown): NoteUpdateTarget[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const targets: NoteUpdateTarget[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      return null;
    }
    const obj = item as Record<string, unknown>;
    if (
      typeof obj["questionId"] !== "string" ||
      typeof obj["proposedAnswer"] !== "string"
    ) {
      return null;
    }
    targets.push({
      questionId: obj["questionId"],
      proposedAnswer: obj["proposedAnswer"],
    });
  }

  return targets;
}

type ConversationWriteValues = Omit<typeof conversations.$inferInsert, "id">;
const CONVERSATION_RESOURCE_TYPE = "conversation";

async function logConversationAction(
  creatorId: string,
  action: string,
  resourceId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(activityLog).values({
    creatorId,
    actorId: creatorId,
    actorRole: "creator",
    action,
    resourceType: CONVERSATION_RESOURCE_TYPE,
    resourceId,
    metadata: metadata ?? null,
  });
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
    const transcript = Array.isArray(body["transcript"])
      ? body["transcript"]
      : [];

    if (typeof id !== "string" || typeof startedAt !== "number") {
      return c.json(
        {
          error: "id (string) と startedAt (number) は必須です",
          code: "INVALID_BODY",
        },
        400,
      );
    }

    if (!hasPersistableUserUtterance(transcript)) {
      logger.info(
        "Skipped conversation persistence due to empty user utterance",
        {
          conversationId: id,
          userId,
        },
      );
      return c.json({
        success: true,
        skipped: true,
        reason: "NO_USER_UTTERANCE",
      });
    }

    const endedAt = body["endedAt"];
    const integrityHashedAt = body["integrityHashedAt"];

    const values: typeof conversations.$inferInsert = {
      id,
      userId,
      category: toStringOrNull(body["category"]),
      characterId: toStringOrNull(body["characterId"]),
      startedAt: new Date(startedAt),
      endedAt: typeof endedAt === "number" ? new Date(endedAt) : null,
      transcript,
      summary: toStringOrNull(body["summary"]),
      summaryStatus:
        typeof body["summaryStatus"] === "string"
          ? body["summaryStatus"]
          : "pending",
      coveredQuestionIds: toStringArray(body["coveredQuestionIds"]),
      noteEntries: Array.isArray(body["noteEntries"])
        ? body["noteEntries"]
        : [],
      pendingNoteEntries: Array.isArray(body["pendingNoteEntries"])
        ? body["pendingNoteEntries"]
        : [],
      noteUpdateProposals: Array.isArray(body["noteUpdateProposals"])
        ? body["noteUpdateProposals"]
        : [],
      oneLinerSummary: toStringOrNull(body["oneLinerSummary"]),
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

    const { id: _conversationId, ...updateValues } = values;

    const existing = await db.query.conversations.findFirst({
      where: eq(conversations.id, id),
      columns: { userId: true },
    });

    if (existing) {
      if (existing.userId !== userId) {
        return c.json(
          {
            error: "この会話IDはすでに別の会話で使用されています",
            code: "CONFLICTING_CONVERSATION_ID",
          },
          409,
        );
      }

      await db
        .update(conversations)
        .set(updateValues satisfies ConversationWriteValues)
        .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));

      return c.json({ success: true, replaced: true });
    }

    try {
      await db.insert(conversations).values(values);
      return c.json({ success: true }, 201);
    } catch (insertError: unknown) {
      const isUniqueViolation =
        typeof insertError === "object" &&
        insertError !== null &&
        "code" in insertError &&
        (insertError as Record<string, unknown>)["code"] === "23505";

      if (!isUniqueViolation) {
        throw insertError;
      }

      const conflicting = await db.query.conversations.findFirst({
        where: eq(conversations.id, id),
        columns: { userId: true },
      });

      if (!conflicting || conflicting.userId !== userId) {
        return c.json(
          {
            error: "この会話IDはすでに別の会話で使用されています",
            code: "CONFLICTING_CONVERSATION_ID",
          },
          409,
        );
      }

      await db
        .update(conversations)
        .set(updateValues satisfies ConversationWriteValues)
        .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));

      return c.json({ success: true, replaced: true });
    }
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
    if ("pendingNoteEntries" in body) {
      updates["pendingNoteEntries"] = body["pendingNoteEntries"];
    }
    if ("noteUpdateProposals" in body) {
      updates["noteUpdateProposals"] = body["noteUpdateProposals"];
    }
    if ("oneLinerSummary" in body)
      updates["oneLinerSummary"] = body["oneLinerSummary"];
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

conversationsRoute.post(
  "/api/conversations/:id/apply-note-updates",
  async (c: Context) => {
    try {
      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const conversationId = c.req.param("id");

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

      const existing = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId),
        ),
      });

      if (!existing) {
        return c.json(
          { error: "会話が見つかりません", code: "NOT_FOUND" },
          404,
        );
      }

      const body = await c.req.json<Record<string, unknown>>();
      const targets = parseNoteUpdateTargets(body["targets"]);
      const questionIds =
        Array.isArray(body["questionIds"]) &&
        body["questionIds"].every((value) => typeof value === "string")
          ? body["questionIds"]
          : null;

      const pendingEntries = Array.isArray(existing.pendingNoteEntries)
        ? existing.pendingNoteEntries
        : [];
      const proposals = Array.isArray(existing.noteUpdateProposals)
        ? existing.noteUpdateProposals
        : [];

      if (pendingEntries.length === 0 || proposals.length === 0) {
        return c.json({ success: true, appliedCount: 0 });
      }

      const approvedTargetKeys =
        targets !== null
          ? new Set(
              targets.map(
                (target) => `${target.questionId}:${target.proposedAnswer}`,
              ),
            )
          : null;
      const approvedQuestionIds =
        targets === null
          ? new Set(
              questionIds ??
                proposals
                  .map((proposal) =>
                    typeof proposal === "object" &&
                    proposal !== null &&
                    typeof (proposal as Record<string, unknown>)[
                      "questionId"
                    ] === "string"
                      ? (proposal as Record<string, unknown>)["questionId"]
                      : null,
                  )
                  .filter(
                    (questionId): questionId is string => questionId !== null,
                  ),
            )
          : null;

      const currentNoteEntries = Array.isArray(existing.noteEntries)
        ? existing.noteEntries
        : [];
      const noteEntryMap = new Map<string, unknown>();
      for (const entry of currentNoteEntries) {
        if (
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as Record<string, unknown>)["questionId"] === "string"
        ) {
          noteEntryMap.set(
            String((entry as Record<string, unknown>)["questionId"]),
            entry,
          );
        }
      }

      const nextPendingEntries: unknown[] = [];
      const appliedEntries: unknown[] = [];
      for (const entry of pendingEntries) {
        const questionId =
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as Record<string, unknown>)["questionId"] === "string"
            ? String((entry as Record<string, unknown>)["questionId"])
            : null;

        const answer =
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as Record<string, unknown>)["answer"] === "string"
            ? String((entry as Record<string, unknown>)["answer"])
            : null;
        const targetKey =
          questionId !== null && answer !== null
            ? `${questionId}:${answer}`
            : null;

        const isApproved =
          approvedTargetKeys !== null
            ? targetKey !== null && approvedTargetKeys.has(targetKey)
            : questionId !== null &&
              approvedQuestionIds !== null &&
              approvedQuestionIds.has(questionId);

        if (!isApproved) {
          nextPendingEntries.push(entry);
          continue;
        }
        if (questionId === null) {
          nextPendingEntries.push(entry);
          continue;
        }

        noteEntryMap.set(questionId, entry);
        appliedEntries.push(entry);
      }

      const nextProposals = proposals.filter((proposal) => {
        const questionId =
          typeof proposal === "object" &&
          proposal !== null &&
          typeof (proposal as Record<string, unknown>)["questionId"] ===
            "string"
            ? String((proposal as Record<string, unknown>)["questionId"])
            : null;
        const proposedAnswer =
          typeof proposal === "object" &&
          proposal !== null &&
          typeof (proposal as Record<string, unknown>)["proposedAnswer"] ===
            "string"
            ? String((proposal as Record<string, unknown>)["proposedAnswer"])
            : null;
        const targetKey =
          questionId !== null && proposedAnswer !== null
            ? `${questionId}:${proposedAnswer}`
            : null;

        if (approvedTargetKeys !== null) {
          return targetKey === null || !approvedTargetKeys.has(targetKey);
        }

        return (
          questionId === null ||
          approvedQuestionIds === null ||
          !approvedQuestionIds.has(questionId)
        );
      });

      const nextCoveredQuestionIds = new Set(existing.coveredQuestionIds ?? []);
      for (const entry of appliedEntries) {
        if (
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as Record<string, unknown>)["questionId"] === "string"
        ) {
          nextCoveredQuestionIds.add(
            String((entry as Record<string, unknown>)["questionId"]),
          );
        }
      }

      await db
        .update(conversations)
        .set({
          noteEntries: Array.from(noteEntryMap.values()),
          pendingNoteEntries: nextPendingEntries,
          noteUpdateProposals: nextProposals,
          coveredQuestionIds: Array.from(nextCoveredQuestionIds),
        })
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, userId),
          ),
        );

      await logConversationAction(
        userId,
        "conversation_note_updates_applied",
        conversationId,
        {
          approvedQuestionIds:
            approvedQuestionIds !== null
              ? Array.from(approvedQuestionIds)
              : null,
          approvedTargets:
            targets?.map((target) => ({
              questionId: target.questionId,
              proposedAnswer: target.proposedAnswer,
            })) ?? null,
          appliedCount: appliedEntries.length,
          remainingProposalCount: nextProposals.length,
        },
      );

      return c.json({ success: true, appliedCount: appliedEntries.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to apply note updates", { error: message });
      return c.json(
        { error: "ノート更新の反映に失敗しました", code: "APPLY_FAILED" },
        500,
      );
    }
  },
);

conversationsRoute.post(
  "/api/conversations/:id/dismiss-note-updates",
  async (c: Context) => {
    try {
      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const conversationId = c.req.param("id");

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

      const existing = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId),
        ),
      });

      if (!existing) {
        return c.json(
          { error: "会話が見つかりません", code: "NOT_FOUND" },
          404,
        );
      }

      const body = await c.req.json<Record<string, unknown>>();
      const targets = parseNoteUpdateTargets(body["targets"]);
      const questionIds =
        Array.isArray(body["questionIds"]) &&
        body["questionIds"].every((value) => typeof value === "string")
          ? new Set(body["questionIds"])
          : null;

      if (questionIds === null && targets === null) {
        await db
          .update(conversations)
          .set({
            pendingNoteEntries: [],
            noteUpdateProposals: [],
          })
          .where(
            and(
              eq(conversations.id, conversationId),
              eq(conversations.userId, userId),
            ),
          );

        await logConversationAction(
          userId,
          "conversation_note_updates_dismissed",
          conversationId,
          {
            dismissedQuestionIds: "all",
            remainingProposalCount: 0,
          },
        );

        return c.json({ success: true, dismissedCount: 0, clearedAll: true });
      }

      const pendingEntries = Array.isArray(existing.pendingNoteEntries)
        ? existing.pendingNoteEntries
        : [];
      const proposals = Array.isArray(existing.noteUpdateProposals)
        ? existing.noteUpdateProposals
        : [];
      const dismissedTargetKeys =
        targets !== null
          ? new Set(
              targets.map(
                (target) => `${target.questionId}:${target.proposedAnswer}`,
              ),
            )
          : null;

      const nextPendingEntries = pendingEntries.filter((entry) => {
        const questionId =
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as Record<string, unknown>)["questionId"] === "string"
            ? String((entry as Record<string, unknown>)["questionId"])
            : null;
        const answer =
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as Record<string, unknown>)["answer"] === "string"
            ? String((entry as Record<string, unknown>)["answer"])
            : null;
        const targetKey =
          questionId !== null && answer !== null
            ? `${questionId}:${answer}`
            : null;

        if (dismissedTargetKeys !== null) {
          return targetKey === null || !dismissedTargetKeys.has(targetKey);
        }

        return questionId === null || !questionIds?.has(questionId);
      });

      const nextProposals = proposals.filter((proposal) => {
        const questionId =
          typeof proposal === "object" &&
          proposal !== null &&
          typeof (proposal as Record<string, unknown>)["questionId"] ===
            "string"
            ? String((proposal as Record<string, unknown>)["questionId"])
            : null;
        const proposedAnswer =
          typeof proposal === "object" &&
          proposal !== null &&
          typeof (proposal as Record<string, unknown>)["proposedAnswer"] ===
            "string"
            ? String((proposal as Record<string, unknown>)["proposedAnswer"])
            : null;
        const targetKey =
          questionId !== null && proposedAnswer !== null
            ? `${questionId}:${proposedAnswer}`
            : null;

        if (dismissedTargetKeys !== null) {
          return targetKey === null || !dismissedTargetKeys.has(targetKey);
        }

        return questionId === null || !questionIds?.has(questionId);
      });

      await db
        .update(conversations)
        .set({
          pendingNoteEntries: nextPendingEntries,
          noteUpdateProposals: nextProposals,
        })
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, userId),
          ),
        );

      await logConversationAction(
        userId,
        "conversation_note_updates_dismissed",
        conversationId,
        {
          dismissedQuestionIds:
            questionIds !== null ? Array.from(questionIds) : null,
          dismissedTargets:
            targets?.map((target) => ({
              questionId: target.questionId,
              proposedAnswer: target.proposedAnswer,
            })) ?? null,
          remainingProposalCount: nextProposals.length,
        },
      );

      return c.json({
        success: true,
        dismissedCount: targets?.length ?? questionIds?.size ?? 0,
        clearedAll: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to dismiss note updates", { error: message });
      return c.json(
        {
          error: "ノート更新候補の取り消しに失敗しました",
          code: "DISMISS_FAILED",
        },
        500,
      );
    }
  },
);

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
