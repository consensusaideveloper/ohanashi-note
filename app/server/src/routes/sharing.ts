import { Hono } from "hono";
import { eq, and } from "drizzle-orm";

import { db } from "../db/connection.js";
import { shares, conversations } from "../db/schema.js";
import { authMiddleware } from "../middleware/auth.js";
import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { logger } from "../lib/logger.js";

import type { Context } from "hono";

/** Default share link duration: 30 days in milliseconds. */
const SHARE_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

const sharingRoute = new Hono();

// Apply auth middleware only to POST and DELETE (GET is public)
sharingRoute.post("/api/shares", authMiddleware);
sharingRoute.delete("/api/shares/:id", authMiddleware);

/** POST /api/shares — Create a share link for selected categories. */
sharingRoute.post("/api/shares", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    const body = await c.req.json<Record<string, unknown>>();
    const categoryIds = body["categoryIds"];

    if (!Array.isArray(categoryIds)) {
      return c.json(
        { error: "categoryIds は配列で指定してください", code: "INVALID_BODY" },
        400,
      );
    }

    const expiresAt = new Date(Date.now() + SHARE_DURATION_MS);

    const [created] = await db
      .insert(shares)
      .values({
        userId,
        categoryIds: categoryIds as string[],
        expiresAt,
      })
      .returning();

    if (!created) {
      return c.json(
        { error: "共有リンクの作成に失敗しました", code: "CREATE_FAILED" },
        500,
      );
    }

    return c.json(
      {
        id: created.id,
        categoryIds: created.categoryIds,
        expiresAt: created.expiresAt.getTime(),
        createdAt: created.createdAt.getTime(),
      },
      201,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to create share", { error: message });
    return c.json(
      { error: "共有リンクの作成に失敗しました", code: "CREATE_FAILED" },
      500,
    );
  }
});

/** DELETE /api/shares/:id — Revoke a share link. */
sharingRoute.delete("/api/shares/:id", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const shareId = c.req.param("id");

    const result = await db
      .delete(shares)
      .where(and(eq(shares.id, shareId), eq(shares.userId, userId)))
      .returning({ id: shares.id });

    if (result.length === 0) {
      return c.json(
        { error: "共有リンクが見つかりません", code: "NOT_FOUND" },
        404,
      );
    }

    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to delete share", { error: message });
    return c.json(
      { error: "共有リンクの削除に失敗しました", code: "DELETE_FAILED" },
      500,
    );
  }
});

/** GET /api/shares/:id — Public: get shared conversations (no auth required). */
sharingRoute.get("/api/shares/:id", async (c: Context) => {
  try {
    const shareId = c.req.param("id");

    const share = await db.query.shares.findFirst({
      where: eq(shares.id, shareId),
    });

    if (!share) {
      return c.json(
        { error: "共有リンクが見つかりません", code: "NOT_FOUND" },
        404,
      );
    }

    // Check expiration
    if (share.expiresAt.getTime() < Date.now()) {
      return c.json(
        { error: "共有リンクの有効期限が切れています", code: "EXPIRED" },
        410,
      );
    }

    // Fetch conversations for the shared categories
    const allConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, share.userId));

    // Filter by shared categories
    const sharedCategorySet = new Set(share.categoryIds ?? []);
    const filtered = allConversations.filter(
      (conv) => conv.category !== null && sharedCategorySet.has(conv.category),
    );

    const result = filtered.map((row) => ({
      id: row.id,
      category: row.category,
      startedAt: row.startedAt.getTime(),
      endedAt: row.endedAt ? row.endedAt.getTime() : null,
      summary: row.summary,
      oneLinerSummary: row.oneLinerSummary,
      noteEntries: row.noteEntries ?? [],
      coveredQuestionIds: row.coveredQuestionIds ?? [],
    }));

    return c.json({
      shareId: share.id,
      categoryIds: share.categoryIds,
      expiresAt: share.expiresAt.getTime(),
      conversations: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to get shared data", { error: message });
    return c.json(
      { error: "共有データの取得に失敗しました", code: "GET_FAILED" },
      500,
    );
  }
});

export { sharingRoute };
