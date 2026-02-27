import { Hono } from "hono";
import { eq, and } from "drizzle-orm";

import { db } from "../db/connection.js";
import {
  accessPresets,
  familyMembers,
  noteLifecycle,
  users,
} from "../db/schema.js";
import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { getUserRole } from "../middleware/role.js";
import { logger } from "../lib/logger.js";

import type { Context } from "hono";

// --- Constants ---

/** All valid ending-note categories (same as category-access.ts). */
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

// --- Route ---

const accessPresetsRoute = new Hono();

/** GET /api/access-presets — List creator's access presets (creator only). */
accessPresetsRoute.get("/api/access-presets", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    const rows = await db
      .select({
        id: accessPresets.id,
        familyMemberId: accessPresets.familyMemberId,
        memberName: users.name,
        categoryId: accessPresets.categoryId,
        createdAt: accessPresets.createdAt,
      })
      .from(accessPresets)
      .innerJoin(
        familyMembers,
        eq(familyMembers.id, accessPresets.familyMemberId),
      )
      .innerJoin(users, eq(users.id, familyMembers.memberId))
      .where(eq(accessPresets.creatorId, userId));

    const result = rows.map((row) => ({
      id: row.id,
      familyMemberId: row.familyMemberId,
      memberName: row.memberName,
      categoryId: row.categoryId,
      createdAt: row.createdAt.toISOString(),
    }));

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to list access presets", { error: message });
    return c.json(
      { error: "事前設定の取得に失敗しました", code: "LIST_FAILED" },
      500,
    );
  }
});

/** POST /api/access-presets — Add access preset (creator only, active status only). */
accessPresetsRoute.post("/api/access-presets", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    // Verify lifecycle is active (or not yet created)
    const lifecycle = await db.query.noteLifecycle.findFirst({
      where: eq(noteLifecycle.creatorId, userId),
      columns: { status: true },
    });

    if (lifecycle && lifecycle.status !== "active") {
      return c.json(
        {
          error: "事前設定はノートが「活動中」の状態でのみ変更できます",
          code: "NOT_ACTIVE",
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

    // Validate category
    if (
      !ALL_CATEGORIES.includes(categoryId as (typeof ALL_CATEGORIES)[number])
    ) {
      return c.json(
        { error: "無効なカテゴリです", code: "INVALID_CATEGORY" },
        400,
      );
    }

    // Verify the family member belongs to this creator
    const member = await db.query.familyMembers.findFirst({
      where: and(
        eq(familyMembers.id, familyMemberId),
        eq(familyMembers.creatorId, userId),
        eq(familyMembers.isActive, true),
      ),
      columns: { id: true },
    });

    if (!member) {
      return c.json(
        { error: "家族メンバーが見つかりません", code: "MEMBER_NOT_FOUND" },
        404,
      );
    }

    const [created] = await db
      .insert(accessPresets)
      .values({
        creatorId: userId,
        familyMemberId,
        categoryId,
      })
      .returning();

    if (!created) {
      return c.json(
        { error: "事前設定の追加に失敗しました", code: "CREATE_FAILED" },
        500,
      );
    }

    return c.json(
      {
        id: created.id,
        familyMemberId: created.familyMemberId,
        categoryId: created.categoryId,
        createdAt: created.createdAt.toISOString(),
      },
      201,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    const isUniqueViolation =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as Record<string, unknown>)["code"] === "23505";

    if (isUniqueViolation) {
      return c.json(
        {
          error: "この設定はすでに登録されています",
          code: "DUPLICATE",
        },
        409,
      );
    }

    logger.error("Failed to create access preset", { error: message });
    return c.json(
      { error: "事前設定の追加に失敗しました", code: "CREATE_FAILED" },
      500,
    );
  }
});

/** DELETE /api/access-presets/:id — Remove access preset (creator only, active status only). */
accessPresetsRoute.delete("/api/access-presets/:id", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const presetId = c.req.param("id");

    // Verify lifecycle is active (or not yet created)
    const lifecycle = await db.query.noteLifecycle.findFirst({
      where: eq(noteLifecycle.creatorId, userId),
      columns: { status: true },
    });

    if (lifecycle && lifecycle.status !== "active") {
      return c.json(
        {
          error: "事前設定はノートが「活動中」の状態でのみ変更できます",
          code: "NOT_ACTIVE",
        },
        403,
      );
    }

    const result = await db
      .delete(accessPresets)
      .where(
        and(
          eq(accessPresets.id, presetId),
          eq(accessPresets.creatorId, userId),
        ),
      )
      .returning({ id: accessPresets.id });

    if (result.length === 0) {
      return c.json(
        { error: "事前設定が見つかりません", code: "NOT_FOUND" },
        404,
      );
    }

    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to delete access preset", { error: message });
    return c.json(
      { error: "事前設定の削除に失敗しました", code: "DELETE_FAILED" },
      500,
    );
  }
});

/** GET /api/access-presets/:creatorId/recommendations — Get creator's presets as recommendations (representative only). */
accessPresetsRoute.get(
  "/api/access-presets/:creatorId/recommendations",
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

      // Verify lifecycle is opened
      const lifecycle = await db.query.noteLifecycle.findFirst({
        where: eq(noteLifecycle.creatorId, creatorId),
        columns: { id: true, status: true },
      });

      if (!lifecycle || lifecycle.status !== "opened") {
        return c.json(
          {
            error: "ノートはまだ開封されていません",
            code: "NOT_OPENED",
          },
          403,
        );
      }

      const rows = await db
        .select({
          id: accessPresets.id,
          familyMemberId: accessPresets.familyMemberId,
          memberName: users.name,
          categoryId: accessPresets.categoryId,
        })
        .from(accessPresets)
        .innerJoin(
          familyMembers,
          eq(familyMembers.id, accessPresets.familyMemberId),
        )
        .innerJoin(users, eq(users.id, familyMembers.memberId))
        .where(eq(accessPresets.creatorId, creatorId));

      const result = rows.map((row) => ({
        id: row.id,
        familyMemberId: row.familyMemberId,
        memberName: row.memberName,
        categoryId: row.categoryId,
      }));

      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to get access preset recommendations", {
        error: message,
        creatorId: c.req.param("creatorId"),
      });
      return c.json(
        {
          error: "推奨設定の取得に失敗しました",
          code: "GET_RECOMMENDATIONS_FAILED",
        },
        500,
      );
    }
  },
);

export { accessPresetsRoute };
