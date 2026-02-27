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

// --- Helpers ---

/**
 * Fetch the noteLifecycle record for a creator and verify that the status
 * is "opened". Returns the lifecycle record on success, or a JSON error
 * Response if the lifecycle is missing or not yet opened.
 */
async function requireOpenedLifecycle(
  c: Context,
  creatorId: string,
): Promise<
  | { ok: true; lifecycle: typeof noteLifecycle.$inferSelect }
  | { ok: false; response: Response }
> {
  const lifecycle = await db.query.noteLifecycle.findFirst({
    where: eq(noteLifecycle.creatorId, creatorId),
  });

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

      const lifecycleResult = await requireOpenedLifecycle(c, creatorId);
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

      const lifecycleResult = await requireOpenedLifecycle(c, creatorId);
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

      const lifecycleResult = await requireOpenedLifecycle(c, creatorId);
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

      const filtered = allRows.filter(
        (row) =>
          row.category !== null && accessibleCategories.has(row.category),
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
