import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";

import { db } from "../db/connection.js";
import {
  noteLifecycle,
  familyMembers,
  categoryAccess,
  conversations,
  users,
} from "../db/schema.js";
import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { getUserRole } from "../middleware/role.js";
import { logger } from "../lib/logger.js";
import {
  getCreatorName,
  notifyFamilyMembers,
} from "../lib/lifecycle-helpers.js";
import { logActivity, logReadAccess } from "../lib/activity-logger.js";
import { r2 } from "../lib/r2.js";

import type { Context } from "hono";

// --- Constants ---

/** All valid ending-note categories. */
const ALL_CATEGORIES = [
  "memories",
  "people",
  "house",
  "medical",
  "funeral",
  "money",
  "work",
  "digital",
  "legal",
  "trust",
  "support",
] as const;

/** Category ID to Japanese label mapping for notification messages. */
const CATEGORY_LABELS: Record<string, string> = {
  memories: "思い出",
  people: "大事な人・ペット",
  house: "生活",
  medical: "医療・介護",
  funeral: "葬儀・供養",
  money: "お金・資産",
  work: "仕事・事業",
  digital: "デジタル",
  legal: "相続・遺言",
  trust: "信託・委任",
  support: "支援制度",
};

// --- Helpers ---

/**
 * Fetch the noteLifecycle record for a creator and verify that the status
 * is "opened". Returns the lifecycle record on success, or a JSON error
 * Response if the lifecycle is missing or not yet opened.
 */
async function requireOpenedLifecycle(
  c: Context,
  creatorId: string,
  callerRole?: string,
): Promise<
  | { ok: true; lifecycle: typeof noteLifecycle.$inferSelect }
  | { ok: false; response: Response }
> {
  const lifecycle = await db.query.noteLifecycle.findFirst({
    where: eq(noteLifecycle.creatorId, creatorId),
  });

  // Creator always has access to their own note regardless of lifecycle status
  if (callerRole === "creator" && lifecycle) {
    return { ok: true, lifecycle };
  }

  if (!lifecycle || lifecycle.status !== "opened") {
    return {
      ok: false,
      response: c.json(
        {
          error: "ノートはまだ開封されていません",
          code: "NOT_OPENED",
        },
        403,
      ),
    };
  }

  return { ok: true, lifecycle };
}

/**
 * Format a conversation DB row for the note/conversations API response.
 * Mirrors the shape used by the legacy sharing route.
 */
function formatConversation(
  row: typeof conversations.$inferSelect,
): Record<string, unknown> {
  return {
    id: row.id,
    category: row.category,
    startedAt: row.startedAt.getTime(),
    summary: row.summary,
    oneLinerSummary: row.oneLinerSummary,
    noteEntries: row.noteEntries ?? [],
    coveredQuestionIds: row.coveredQuestionIds ?? [],
    keyPoints: row.keyPoints ?? null,
  };
}

/**
 * Extract the category prefix from a question ID (e.g. "memories-01" → "memories").
 */
function questionCategoryId(questionId: string): string | undefined {
  const idx = questionId.lastIndexOf("-");
  return idx > 0 ? questionId.slice(0, idx) : undefined;
}

/**
 * Check whether a conversation contains content belonging to any of
 * the accessible categories.  Checks three sources: the conversation's
 * own category field, the noteEntries question IDs, and coveredQuestionIds.
 */
function hasAccessibleContent(
  row: Pick<
    typeof conversations.$inferSelect,
    "category" | "noteEntries" | "coveredQuestionIds"
  >,
  accessibleCategories: Set<string>,
): boolean {
  if (row.category !== null && accessibleCategories.has(row.category)) {
    return true;
  }
  if (Array.isArray(row.noteEntries)) {
    for (const entry of row.noteEntries) {
      const typed = entry as { questionId?: string };
      if (typeof typed.questionId === "string") {
        const catId = questionCategoryId(typed.questionId);
        if (catId !== undefined && accessibleCategories.has(catId)) {
          return true;
        }
      }
    }
  }
  if (Array.isArray(row.coveredQuestionIds)) {
    for (const qId of row.coveredQuestionIds) {
      const catId = questionCategoryId(qId);
      if (catId !== undefined && accessibleCategories.has(catId)) {
        return true;
      }
    }
  }
  return false;
}

// --- Route ---

const categoryAccessRoute = new Hono();

/** GET /api/access/:creatorId/categories — List accessible categories. */
categoryAccessRoute.get(
  "/api/access/:creatorId/categories",
  async (c: Context) => {
    try {
      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const creatorId = c.req.param("creatorId");

      const role = await getUserRole(userId, creatorId);

      if (
        role !== "creator" &&
        role !== "representative" &&
        role !== "member"
      ) {
        return c.json(
          { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
          403,
        );
      }

      const lifecycleResult = await requireOpenedLifecycle(c, creatorId, role);
      if (!lifecycleResult.ok) {
        return lifecycleResult.response;
      }

      const isRepresentative = role === "representative";

      if (isRepresentative || role === "creator") {
        return c.json({
          categories: [...ALL_CATEGORIES],
          isRepresentative: true,
        });
      }

      // Role is "member": query categoryAccess for granted categories
      const membership = await db.query.familyMembers.findFirst({
        where: and(
          eq(familyMembers.creatorId, creatorId),
          eq(familyMembers.memberId, userId),
          eq(familyMembers.isActive, true),
        ),
        columns: { id: true },
      });

      if (!membership) {
        return c.json(
          { error: "家族メンバーが見つかりません", code: "MEMBER_NOT_FOUND" },
          404,
        );
      }

      const accessRows = await db
        .select({ categoryId: categoryAccess.categoryId })
        .from(categoryAccess)
        .where(
          and(
            eq(categoryAccess.lifecycleId, lifecycleResult.lifecycle.id),
            eq(categoryAccess.familyMemberId, membership.id),
          ),
        );

      const categories = accessRows.map((row) => row.categoryId);

      return c.json({ categories, isRepresentative: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to get accessible categories", {
        error: message,
        creatorId: c.req.param("creatorId"),
      });
      return c.json(
        {
          error: "カテゴリ情報の取得に失敗しました",
          code: "GET_CATEGORIES_FAILED",
        },
        500,
      );
    }
  },
);

/** POST /api/access/:creatorId/grant — Grant category access (representative only). */
categoryAccessRoute.post("/api/access/:creatorId/grant", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const creatorId = c.req.param("creatorId");

    const role = await getUserRole(userId, creatorId);

    if (role !== "representative") {
      return c.json(
        { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
        403,
      );
    }

    const lifecycleResult = await requireOpenedLifecycle(c, creatorId);
    if (!lifecycleResult.ok) {
      return lifecycleResult.response;
    }

    // Block access changes during consent_gathering
    if (lifecycleResult.lifecycle.status === "consent_gathering") {
      return c.json(
        {
          error: "同意収集中はアクセス権を変更できません",
          code: "BLOCKED_DURING_CONSENT",
        },
        403,
      );
    }

    const body = await c.req.json<Record<string, unknown>>();
    const familyMemberId = body["familyMemberId"];
    const categoryId = body["categoryId"];

    if (typeof familyMemberId !== "string" || typeof categoryId !== "string") {
      return c.json(
        {
          error: "familyMemberId と categoryId は必須です",
          code: "INVALID_BODY",
        },
        400,
      );
    }

    const [created] = await db
      .insert(categoryAccess)
      .values({
        lifecycleId: lifecycleResult.lifecycle.id,
        familyMemberId,
        categoryId,
        grantedBy: userId,
      })
      .returning();

    if (!created) {
      return c.json(
        {
          error: "アクセス権の付与に失敗しました",
          code: "GRANT_FAILED",
        },
        500,
      );
    }

    // Audit log: record the access grant
    await logActivity({
      creatorId,
      actorId: userId,
      actorRole: role,
      action: "category_access_granted",
      resourceType: "category_access",
      metadata: { familyMemberId, categoryId },
    });

    // Send notification to the affected member (best-effort)
    const member = await db.query.familyMembers.findFirst({
      where: eq(familyMembers.id, familyMemberId),
      columns: { memberId: true },
    });
    if (member) {
      const creatorName = await getCreatorName(creatorId);
      const categoryLabel = CATEGORY_LABELS[categoryId] ?? categoryId;
      await notifyFamilyMembers(
        [member.memberId],
        "category_access_granted",
        "カテゴリへのアクセスが許可されました",
        `${creatorName}さんのノートの「${categoryLabel}」カテゴリが閲覧可能になりました`,
        creatorId,
      );
    }

    return c.json(
      {
        id: created.id,
        lifecycleId: created.lifecycleId,
        familyMemberId: created.familyMemberId,
        categoryId: created.categoryId,
        grantedBy: created.grantedBy,
        grantedAt: created.grantedAt.toISOString(),
      },
      201,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    // Drizzle/Postgres unique violation code
    const isUniqueViolation =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as Record<string, unknown>)["code"] === "23505";

    if (isUniqueViolation) {
      return c.json(
        {
          error: "このアクセス権はすでに付与されています",
          code: "DUPLICATE",
        },
        409,
      );
    }

    logger.error("Failed to grant category access", {
      error: message,
      creatorId: c.req.param("creatorId"),
    });
    return c.json(
      {
        error: "アクセス権の付与に失敗しました",
        code: "GRANT_FAILED",
      },
      500,
    );
  }
});

/** DELETE /api/access/:creatorId/revoke — Revoke category access (representative only). */
categoryAccessRoute.delete(
  "/api/access/:creatorId/revoke",
  async (c: Context) => {
    try {
      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const creatorId = c.req.param("creatorId");

      const role = await getUserRole(userId, creatorId);

      if (role !== "representative") {
        return c.json(
          { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
          403,
        );
      }

      const lifecycleResult = await requireOpenedLifecycle(c, creatorId);
      if (!lifecycleResult.ok) {
        return lifecycleResult.response;
      }

      // Block access changes during consent_gathering
      if (lifecycleResult.lifecycle.status === "consent_gathering") {
        return c.json(
          {
            error: "同意収集中はアクセス権を変更できません",
            code: "BLOCKED_DURING_CONSENT",
          },
          403,
        );
      }

      const body = await c.req.json<Record<string, unknown>>();
      const familyMemberId = body["familyMemberId"];
      const categoryId = body["categoryId"];

      if (
        typeof familyMemberId !== "string" ||
        typeof categoryId !== "string"
      ) {
        return c.json(
          {
            error: "familyMemberId と categoryId は必須です",
            code: "INVALID_BODY",
          },
          400,
        );
      }

      const result = await db
        .delete(categoryAccess)
        .where(
          and(
            eq(categoryAccess.lifecycleId, lifecycleResult.lifecycle.id),
            eq(categoryAccess.familyMemberId, familyMemberId),
            eq(categoryAccess.categoryId, categoryId),
          ),
        )
        .returning({ id: categoryAccess.id });

      if (result.length === 0) {
        return c.json(
          {
            error: "該当するアクセス権が見つかりません",
            code: "NOT_FOUND",
          },
          404,
        );
      }

      // Audit log: record the access revocation
      await logActivity({
        creatorId,
        actorId: userId,
        actorRole: role,
        action: "category_access_revoked",
        resourceType: "category_access",
        metadata: { familyMemberId, categoryId },
      });

      // Send notification to the affected member (best-effort)
      const member = await db.query.familyMembers.findFirst({
        where: eq(familyMembers.id, familyMemberId),
        columns: { memberId: true },
      });
      if (member) {
        const creatorName = await getCreatorName(creatorId);
        const categoryLabel = CATEGORY_LABELS[categoryId] ?? categoryId;
        await notifyFamilyMembers(
          [member.memberId],
          "category_access_revoked",
          "カテゴリへのアクセスが変更されました",
          `${creatorName}さんのノートの「${categoryLabel}」カテゴリへのアクセスが変更されました`,
          creatorId,
        );
      }

      return c.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to revoke category access", {
        error: message,
        creatorId: c.req.param("creatorId"),
      });
      return c.json(
        {
          error: "アクセス権の取り消しに失敗しました",
          code: "REVOKE_FAILED",
        },
        500,
      );
    }
  },
);

/** GET /api/access/:creatorId/note/:categoryId — Get note entries for a category. */
categoryAccessRoute.get(
  "/api/access/:creatorId/note/:categoryId",
  async (c: Context) => {
    try {
      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const creatorId = c.req.param("creatorId");
      const categoryId = c.req.param("categoryId");

      const role = await getUserRole(userId, creatorId);

      if (
        role !== "creator" &&
        role !== "representative" &&
        role !== "member"
      ) {
        return c.json(
          { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
          403,
        );
      }

      const lifecycleResult = await requireOpenedLifecycle(c, creatorId, role);
      if (!lifecycleResult.ok) {
        return lifecycleResult.response;
      }

      // For member: verify they have access to this category
      if (role === "member") {
        const membership = await db.query.familyMembers.findFirst({
          where: and(
            eq(familyMembers.creatorId, creatorId),
            eq(familyMembers.memberId, userId),
            eq(familyMembers.isActive, true),
          ),
          columns: { id: true },
        });

        if (!membership) {
          return c.json(
            {
              error: "家族メンバーが見つかりません",
              code: "MEMBER_NOT_FOUND",
            },
            404,
          );
        }

        const access = await db.query.categoryAccess.findFirst({
          where: and(
            eq(categoryAccess.lifecycleId, lifecycleResult.lifecycle.id),
            eq(categoryAccess.familyMemberId, membership.id),
            eq(categoryAccess.categoryId, categoryId),
          ),
        });

        if (!access) {
          return c.json(
            {
              error: "このカテゴリへのアクセス権がありません",
              code: "ACCESS_DENIED",
            },
            403,
          );
        }
      }

      // Fetch conversations for this creator+category
      const rows = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.userId, creatorId),
            eq(conversations.category, categoryId),
          ),
        )
        .orderBy(desc(conversations.startedAt));

      // Debounced read-access log (best-effort, non-blocking)
      void logReadAccess({
        creatorId,
        actorId: userId,
        actorRole: role,
        resourceType: "note_category",
        resourceId: categoryId,
      });

      return c.json({
        categoryId,
        conversations: rows.map(formatConversation),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to get note for category", {
        error: message,
        creatorId: c.req.param("creatorId"),
        categoryId: c.req.param("categoryId"),
      });
      return c.json(
        {
          error: "ノートの取得に失敗しました",
          code: "GET_NOTE_FAILED",
        },
        500,
      );
    }
  },
);

/** GET /api/access/:creatorId/conversations — List accessible conversations. */
categoryAccessRoute.get(
  "/api/access/:creatorId/conversations",
  async (c: Context) => {
    try {
      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const creatorId = c.req.param("creatorId");

      const role = await getUserRole(userId, creatorId);

      if (
        role !== "creator" &&
        role !== "representative" &&
        role !== "member"
      ) {
        return c.json(
          { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
          403,
        );
      }

      const lifecycleResult = await requireOpenedLifecycle(c, creatorId, role);
      if (!lifecycleResult.ok) {
        return lifecycleResult.response;
      }

      // Fetch all conversations for the creator
      const allRows = await db
        .select()
        .from(conversations)
        .where(eq(conversations.userId, creatorId))
        .orderBy(desc(conversations.startedAt));

      if (role === "representative" || role === "creator") {
        return c.json({
          conversations: allRows.map(formatConversation),
        });
      }

      // Role is "member": filter to accessible categories only
      const membership = await db.query.familyMembers.findFirst({
        where: and(
          eq(familyMembers.creatorId, creatorId),
          eq(familyMembers.memberId, userId),
          eq(familyMembers.isActive, true),
        ),
        columns: { id: true },
      });

      if (!membership) {
        return c.json(
          { error: "家族メンバーが見つかりません", code: "MEMBER_NOT_FOUND" },
          404,
        );
      }

      const accessRows = await db
        .select({ categoryId: categoryAccess.categoryId })
        .from(categoryAccess)
        .where(
          and(
            eq(categoryAccess.lifecycleId, lifecycleResult.lifecycle.id),
            eq(categoryAccess.familyMemberId, membership.id),
          ),
        );

      const accessibleCategories = new Set(
        accessRows.map((row) => row.categoryId),
      );

      const filtered = allRows.filter((row) =>
        hasAccessibleContent(row, accessibleCategories),
      );

      return c.json({
        conversations: filtered.map(formatConversation),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to get conversations", {
        error: message,
        creatorId: c.req.param("creatorId"),
      });
      return c.json(
        {
          error: "会話一覧の取得に失敗しました",
          code: "GET_CONVERSATIONS_FAILED",
        },
        500,
      );
    }
  },
);

/** Format a conversation DB row with full detail (transcript, emotions, etc.). */
function formatConversationDetail(
  row: typeof conversations.$inferSelect,
): Record<string, unknown> {
  return {
    id: row.id,
    category: row.category,
    startedAt: row.startedAt.getTime(),
    endedAt: row.endedAt ? row.endedAt.getTime() : null,
    transcript: row.transcript ?? [],
    summary: row.summary,
    summaryStatus: row.summaryStatus,
    oneLinerSummary: row.oneLinerSummary,
    discussedCategories: row.discussedCategories,
    keyPoints: row.keyPoints ?? null,
    noteEntries: row.noteEntries ?? [],
    coveredQuestionIds: row.coveredQuestionIds ?? [],
    audioAvailable: row.audioAvailable,
  };
}

/** GET /api/access/:creatorId/conversations/:conversationId — Single conversation detail for family. */
categoryAccessRoute.get(
  "/api/access/:creatorId/conversations/:conversationId",
  async (c: Context) => {
    try {
      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const creatorId = c.req.param("creatorId");
      const conversationId = c.req.param("conversationId");

      const role = await getUserRole(userId, creatorId);

      if (
        role !== "creator" &&
        role !== "representative" &&
        role !== "member"
      ) {
        return c.json(
          { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
          403,
        );
      }

      const lifecycleResult = await requireOpenedLifecycle(c, creatorId, role);
      if (!lifecycleResult.ok) {
        return lifecycleResult.response;
      }

      const row = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, creatorId),
        ),
      });

      if (!row) {
        return c.json(
          { error: "会話が見つかりません", code: "NOT_FOUND" },
          404,
        );
      }

      // Members: verify the conversation contains content in accessible categories
      if (role === "member") {
        const membership = await db.query.familyMembers.findFirst({
          where: and(
            eq(familyMembers.creatorId, creatorId),
            eq(familyMembers.memberId, userId),
            eq(familyMembers.isActive, true),
          ),
          columns: { id: true },
        });

        if (!membership) {
          return c.json(
            { error: "家族メンバーが見つかりません", code: "MEMBER_NOT_FOUND" },
            404,
          );
        }

        const accessRows = await db
          .select({ categoryId: categoryAccess.categoryId })
          .from(categoryAccess)
          .where(
            and(
              eq(categoryAccess.lifecycleId, lifecycleResult.lifecycle.id),
              eq(categoryAccess.familyMemberId, membership.id),
            ),
          );

        const accessibleCategories = new Set(
          accessRows.map((r) => r.categoryId),
        );

        if (!hasAccessibleContent(row, accessibleCategories)) {
          return c.json(
            { error: "この会話を閲覧する権限がありません", code: "FORBIDDEN" },
            403,
          );
        }
      }

      // Debounced read-access log (best-effort, non-blocking)
      void logReadAccess({
        creatorId,
        actorId: userId,
        actorRole: role,
        resourceType: "conversation",
        resourceId: conversationId,
      });

      return c.json(formatConversationDetail(row));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to get conversation detail", {
        error: message,
        creatorId: c.req.param("creatorId"),
        conversationId: c.req.param("conversationId"),
      });
      return c.json(
        {
          error: "会話の取得に失敗しました",
          code: "GET_CONVERSATION_DETAIL_FAILED",
        },
        500,
      );
    }
  },
);

/** GET /api/access/:creatorId/conversations/:conversationId/audio-url — Signed audio download URL for family. */
categoryAccessRoute.get(
  "/api/access/:creatorId/conversations/:conversationId/audio-url",
  async (c: Context) => {
    try {
      if (r2 === null) {
        return c.json(
          {
            error: "音声ストレージが設定されていません",
            code: "R2_NOT_CONFIGURED",
          },
          503,
        );
      }

      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const creatorId = c.req.param("creatorId");
      const conversationId = c.req.param("conversationId");

      const role = await getUserRole(userId, creatorId);

      if (
        role !== "creator" &&
        role !== "representative" &&
        role !== "member"
      ) {
        return c.json(
          { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
          403,
        );
      }

      const lifecycleResult = await requireOpenedLifecycle(c, creatorId, role);
      if (!lifecycleResult.ok) {
        return lifecycleResult.response;
      }

      const row = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, creatorId),
        ),
        columns: {
          id: true,
          audioAvailable: true,
          audioStorageKey: true,
          category: true,
          noteEntries: true,
          coveredQuestionIds: true,
        },
      });

      if (!row) {
        return c.json(
          { error: "会話が見つかりません", code: "NOT_FOUND" },
          404,
        );
      }

      if (!row.audioAvailable || row.audioStorageKey === null) {
        return c.json(
          {
            error: "この会話には録音データがありません",
            code: "NO_AUDIO",
          },
          404,
        );
      }

      // Members: verify category access
      if (role === "member") {
        const membership = await db.query.familyMembers.findFirst({
          where: and(
            eq(familyMembers.creatorId, creatorId),
            eq(familyMembers.memberId, userId),
            eq(familyMembers.isActive, true),
          ),
          columns: { id: true },
        });

        if (!membership) {
          return c.json(
            {
              error: "家族メンバーが見つかりません",
              code: "MEMBER_NOT_FOUND",
            },
            404,
          );
        }

        const accessRows = await db
          .select({ categoryId: categoryAccess.categoryId })
          .from(categoryAccess)
          .where(
            and(
              eq(categoryAccess.lifecycleId, lifecycleResult.lifecycle.id),
              eq(categoryAccess.familyMemberId, membership.id),
            ),
          );

        const accessibleCategories = new Set(
          accessRows.map((r) => r.categoryId),
        );

        if (!hasAccessibleContent(row, accessibleCategories)) {
          return c.json(
            {
              error: "この会話の音声を再生する権限がありません",
              code: "FORBIDDEN",
            },
            403,
          );
        }
      }

      // Audit log: record audio access (not debounced — audio access is high-value)
      void logActivity({
        creatorId,
        actorId: userId,
        actorRole: role,
        action: "audio_accessed",
        resourceType: "conversation",
        resourceId: conversationId,
      });

      const downloadUrl = await r2.generateDownloadUrl(row.audioStorageKey);
      return c.json({ downloadUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to generate family audio download URL", {
        error: message,
        creatorId: c.req.param("creatorId"),
        conversationId: c.req.param("conversationId"),
      });
      return c.json(
        {
          error: "録音データの取得に失敗しました",
          code: "FAMILY_AUDIO_URL_FAILED",
        },
        500,
      );
    }
  },
);

/** GET /api/access/:creatorId/matrix — Full access matrix (representative only). */
categoryAccessRoute.get("/api/access/:creatorId/matrix", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const creatorId = c.req.param("creatorId");

    const role = await getUserRole(userId, creatorId);

    if (role !== "representative") {
      return c.json(
        { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
        403,
      );
    }

    const lifecycleResult = await requireOpenedLifecycle(c, creatorId);
    if (!lifecycleResult.ok) {
      return lifecycleResult.response;
    }

    // Fetch all active family members with user names
    const memberRows = await db
      .select({
        memberId: familyMembers.memberId,
        familyMemberId: familyMembers.id,
        name: users.name,
        role: familyMembers.role,
        relationshipLabel: familyMembers.relationshipLabel,
      })
      .from(familyMembers)
      .innerJoin(users, eq(users.id, familyMembers.memberId))
      .where(
        and(
          eq(familyMembers.creatorId, creatorId),
          eq(familyMembers.isActive, true),
        ),
      );

    // Fetch all access records for this lifecycle
    const accessRows = await db
      .select({
        familyMemberId: categoryAccess.familyMemberId,
        categoryId: categoryAccess.categoryId,
      })
      .from(categoryAccess)
      .where(eq(categoryAccess.lifecycleId, lifecycleResult.lifecycle.id));

    // Build a map: familyMemberId -> categoryId[]
    const accessMap = new Map<string, string[]>();
    for (const row of accessRows) {
      const existing = accessMap.get(row.familyMemberId);
      if (existing) {
        existing.push(row.categoryId);
      } else {
        accessMap.set(row.familyMemberId, [row.categoryId]);
      }
    }

    const members = memberRows.map((member) => ({
      memberId: member.memberId,
      familyMemberId: member.familyMemberId,
      name: member.name,
      role: member.role,
      relationshipLabel: member.relationshipLabel,
      categories:
        member.role === "representative"
          ? [...ALL_CATEGORIES]
          : (accessMap.get(member.familyMemberId) ?? []),
    }));

    return c.json({ members });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to get access matrix", {
      error: message,
      creatorId: c.req.param("creatorId"),
    });
    return c.json(
      {
        error: "アクセスマトリクスの取得に失敗しました",
        code: "GET_MATRIX_FAILED",
      },
      500,
    );
  }
});

export { categoryAccessRoute };
